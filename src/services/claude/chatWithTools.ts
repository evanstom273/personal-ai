import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient, isAbortError } from '@/services/claude/client'
import {
	CLAUDE_MODEL_ID,
	MAX_CHAT_OUTPUT_TOKENS,
	MAX_PAUSE_CONTINUATIONS,
	MAX_TOOL_ITERATIONS,
} from '@/services/claude/constants'
import { buildFullSystemInstruction } from '@/services/claude/documentContext'
import {
	buildChatTools,
	executeAppToolCall,
	isImageGenerationAvailable,
} from '@/services/claude/executeAppToolCall'
import { buildClaudeMessages } from '@/services/claude/messageContent'
import {
	addUsageTotals,
	emptyUsageTotals,
	usageToTotals,
} from '@/services/claude/pricing'
import { ReplyAssembler } from '@/services/claude/webResults'
import { recordUsage } from '@/services/usage/usageService'
import type {
	ConversationRecord,
	MessageDocumentLink,
	MessageMedia,
	MessageUsage,
	MessageWebActivity,
	PendingDeleteConfirmation,
	StoredMessage,
	UserPreferences,
} from '@/storage/types'
import { mergeDocumentLinks } from '@/utils/messageAttachments'

export interface ChatWithToolsResult {
	text: string
	documentLinks: MessageDocumentLink[]
	media: MessageMedia[]
	pendingDeleteConfirmation?: PendingDeleteConfirmation
	web?: MessageWebActivity
	usage: MessageUsage
	stopNote?: string
}

export interface ChatGenerationOptions {
	signal?: AbortSignal
	/** Full reply text shown so far (replaces, not appends). */
	onTextChange?: (text: string) => void
	/** Short status such as "Searching the web…", or null when text is flowing. */
	onActivity?: (activity: string | null) => void
}

/** Thrown when the user stops a reply; carries what was already billed. */
export class GenerationAbortedError extends Error {
	readonly partialUsage: MessageUsage
	readonly partialText: string

	constructor(partialUsage: MessageUsage, partialText: string) {
		super('Generation stopped')
		this.name = 'AbortError'
		this.partialUsage = partialUsage
		this.partialText = partialText
	}
}

function describeToolActivity(name: string): string {
	if (name === 'generate_image') return 'Generating an image…'
	if (name.includes('document')) return 'Working on your documents…'
	if (name.includes('reminder')) return 'Updating reminders…'
	if (name.includes('project') || name.includes('task')) return 'Updating projects…'
	if (name.includes('home_todo')) return 'Updating your to-do list…'
	if (name.includes('memory')) return 'Checking memory…'
	if (name.includes('source')) return 'Reading the app source…'
	return 'Working…'
}

function describeServerToolActivity(block: Anthropic.ServerToolUseBlock): string {
	const input = (block.input ?? {}) as Record<string, unknown>
	if (block.name === 'web_search') {
		const query = typeof input.query === 'string' ? input.query.trim() : ''
		return query ? `Searching the web for “${query}”…` : 'Searching the web…'
	}
	if (block.name === 'web_fetch') {
		const url = typeof input.url === 'string' ? input.url : ''
		try {
			return url ? `Reading ${new URL(url).hostname}…` : 'Reading a web page…'
		} catch {
			return 'Reading a web page…'
		}
	}
	return 'Working…'
}

function describeRefusal(message: Anthropic.Message): string {
	const category = message.stop_details?.category
	return category
		? `Claude declined to continue this reply (safety category: ${category}). Try rephrasing the request.`
		: 'Claude declined to continue this reply. Try rephrasing the request.'
}

function toToolInput(input: unknown): Record<string, unknown> {
	return input && typeof input === 'object' && !Array.isArray(input)
		? (input as Record<string, unknown>)
		: {}
}

/**
 * Runs one assistant reply: streams Claude's response, executes the app's own
 * tools when asked, and lets Anthropic's web search/fetch run server-side.
 * The system prompt is built once per reply and each request is cached.
 */
export async function generateChatWithTools(
	apiKey: string,
	history: StoredMessage[],
	preferences: UserPreferences,
	conversation: Pick<ConversationRecord, 'title' | 'instructions'> | null,
	options: ChatGenerationOptions = {},
): Promise<ChatWithToolsResult> {
	const client = getClaudeClient(apiKey)
	const systemPrompt = await buildFullSystemInstruction(preferences, conversation)
	const system: Anthropic.TextBlockParam[] = [
		{ type: 'text', text: systemPrompt.stable, cache_control: { type: 'ephemeral' } },
		{ type: 'text', text: systemPrompt.context, cache_control: { type: 'ephemeral' } },
	]
	const tools = buildChatTools({
		webAccess: preferences.webSearchEnabled,
		allowCodebaseInspection: preferences.allowCodebaseInspection ?? false,
		imageGeneration: isImageGenerationAvailable(preferences),
	})
	const messages = buildClaudeMessages(history)

	if (import.meta.env.DEV) {
		console.debug('[claude] system chars:', systemPrompt.stable.length, '+', systemPrompt.context.length)
	}

	const assembler = new ReplyAssembler()
	let usage = emptyUsageTotals()
	let documentLinks: MessageDocumentLink[] = []
	const media: MessageMedia[] = []
	let pendingDeleteConfirmation: PendingDeleteConfirmation | undefined
	let stopNote: string | undefined
	let toolRounds = 0
	let pauseContinuations = 0
	let usedAppTools = false

	while (true) {
		if (options.signal?.aborted) {
			throw new GenerationAbortedError(usage, assembler.committedText)
		}

		const stream = client.messages.stream(
			{
				model: CLAUDE_MODEL_ID,
				max_tokens: MAX_CHAT_OUTPUT_TOKENS,
				system,
				tools,
				messages,
				thinking: { type: 'adaptive' },
				output_config: { effort: preferences.claudeEffort },
				// Automatic breakpoint on the growing conversation tail.
				cache_control: { type: 'ephemeral' },
			},
			{ signal: options.signal },
		)

		let liveText = ''
		let previousWasText = assembler.previousBlockWasText
		let seenUsage: Anthropic.Usage | null = null
		let seenOutputTokens = 0

		let message: Anthropic.Message
		try {
			for await (const event of stream) {
				switch (event.type) {
					case 'message_start':
						seenUsage = event.message.usage
						break
					case 'message_delta':
						seenOutputTokens = event.usage.output_tokens
						break
					case 'content_block_start': {
						const block = event.content_block
						if (block.type === 'text') {
							if (!previousWasText) {
								liveText += assembler.separatorBeforeText(liveText)
							}
							previousWasText = true
						} else if (block.type === 'thinking' || block.type === 'redacted_thinking') {
							if (!assembler.committedText && !liveText) {
								options.onActivity?.('Thinking…')
							}
						} else {
							previousWasText = false
							if (block.type === 'tool_use') {
								options.onActivity?.(describeToolActivity(block.name))
							} else if (block.type === 'server_tool_use') {
								options.onActivity?.(describeServerToolActivity(block))
							}
						}
						break
					}
					case 'content_block_delta':
						if (event.delta.type === 'text_delta' && event.delta.text) {
							liveText += event.delta.text
							options.onActivity?.(null)
							options.onTextChange?.(assembler.committedText + liveText)
						}
						break
					case 'content_block_stop': {
						const block = stream.currentMessage?.content[event.index]
						if (block?.type === 'server_tool_use') {
							options.onActivity?.(describeServerToolActivity(block))
						}
						break
					}
					default:
						break
				}
			}
			message = await stream.finalMessage()
		} catch (error) {
			if (isAbortError(error) || options.signal?.aborted) {
				const partial = seenUsage
					? usageToTotals({ ...seenUsage, output_tokens: seenOutputTokens })
					: emptyUsageTotals()
				usage = addUsageTotals(usage, partial)
				void recordUsage('chat', partial)
				throw new GenerationAbortedError(usage, assembler.committedText + liveText)
			}
			throw error
		}

		const responseUsage = usageToTotals(message.usage)
		usage = addUsageTotals(usage, responseUsage)
		void recordUsage('chat', responseUsage)

		assembler.addResponse(message.content)
		options.onTextChange?.(assembler.committedText)

		if (message.stop_reason === 'tool_use') {
			const toolUses = message.content.filter(
				(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
			)

			if (toolUses.length > 0) {
				if (toolRounds >= MAX_TOOL_ITERATIONS) {
					stopNote = 'Stopped after several tool steps to keep costs down. Ask me to continue if needed.'
					break
				}

				usedAppTools = true
				messages.push({ role: 'assistant', content: message.content })

				const results: Anthropic.ToolResultBlockParam[] = []
				for (const toolUse of toolUses) {
					options.onActivity?.(describeToolActivity(toolUse.name))
					try {
						const result = await executeAppToolCall(toolUse.name, toToolInput(toolUse.input), preferences)
						if (result.generatedMedia) {
							media.push(result.generatedMedia)
						}
						if (result.pendingDeleteConfirmation) {
							pendingDeleteConfirmation = result.pendingDeleteConfirmation
						}
						if (result.documentLink) {
							documentLinks = mergeDocumentLinks(documentLinks, [result.documentLink])
						}
						results.push({
							type: 'tool_result',
							tool_use_id: toolUse.id,
							content: JSON.stringify(result.response),
							...(result.response.error ? { is_error: true } : {}),
						})
					} catch (toolError) {
						results.push({
							type: 'tool_result',
							tool_use_id: toolUse.id,
							content: toolError instanceof Error ? toolError.message : 'Tool failed.',
							is_error: true,
						})
					}
				}

				// All results go back in one user message so parallel tool use keeps working.
				messages.push({ role: 'user', content: results })
				toolRounds += 1
				continue
			}
		}

		if (message.stop_reason === 'pause_turn') {
			if (pauseContinuations >= MAX_PAUSE_CONTINUATIONS) {
				stopNote = 'Stopped a long web lookup early to keep costs down. Ask me to continue if needed.'
				break
			}
			// The API paused a long server-side tool turn; send it back unchanged to resume.
			messages.push({ role: 'assistant', content: message.content })
			pauseContinuations += 1
			continue
		}

		if (message.stop_reason === 'max_tokens') {
			stopNote = 'This reply hit the length limit and was cut off.'
		} else if (message.stop_reason === 'refusal') {
			stopNote = describeRefusal(message)
		} else if (message.stop_reason === 'model_context_window_exceeded') {
			stopNote = 'This conversation is too long for one reply. Start a new conversation or clear older messages.'
		}
		break
	}

	options.onActivity?.(null)

	const text =
		assembler.committedText.trim() ||
		(usedAppTools ? 'Done.' : stopNote ? '' : 'Claude returned an empty reply.')

	return {
		text,
		documentLinks,
		media,
		pendingDeleteConfirmation,
		web: assembler.getWebActivity(),
		usage,
		stopNote,
	}
}
