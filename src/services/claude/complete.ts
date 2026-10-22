import type Anthropic from '@anthropic-ai/sdk'
import { getClaudeClient } from '@/services/claude/client'
import {
	CLAUDE_MODEL_ID,
	MAX_BACKGROUND_OUTPUT_TOKENS,
} from '@/services/claude/constants'
import { usageToTotals } from '@/services/claude/pricing'
import {
	assertWithinSpendingLimit,
	recordUsage,
} from '@/services/usage/usageService'
import type { UsageFeature, UserPreferences } from '@/storage/types'

interface CompletionRequest {
	apiKey: string
	preferences: UserPreferences
	feature: UsageFeature
	system?: string
	prompt: string
	maxTokens?: number
	signal?: AbortSignal
}

function extractText(message: Anthropic.Message): string {
	return message.content
		.filter((block): block is Anthropic.TextBlock => block.type === 'text')
		.map((block) => block.text)
		.join('')
		.trim()
}

async function runCompletion(
	request: CompletionRequest,
	format?: Anthropic.JSONOutputFormat,
): Promise<Anthropic.Message> {
	await assertWithinSpendingLimit(request.preferences)

	const client = getClaudeClient(request.apiKey)
	const message = await client.messages.create(
		{
			model: CLAUDE_MODEL_ID,
			max_tokens: request.maxTokens ?? MAX_BACKGROUND_OUTPUT_TOKENS,
			...(request.system ? { system: request.system } : {}),
			messages: [{ role: 'user', content: request.prompt }],
			// Background jobs are simple; low effort keeps them fast and cheap.
			output_config: { effort: 'low', ...(format ? { format } : {}) },
		},
		{ signal: request.signal },
	)

	void recordUsage(request.feature, usageToTotals(message.usage))

	if (message.stop_reason === 'refusal') {
		throw new Error('Claude declined this request. Try rephrasing it.')
	}
	if (message.stop_reason === 'max_tokens') {
		throw new Error('The response was too long and got cut off. Try a shorter input.')
	}

	return message
}

/** One-shot text completion for background features. */
export async function completeText(request: CompletionRequest): Promise<string> {
	const text = extractText(await runCompletion(request))
	if (!text) {
		throw new Error('Claude returned an empty response.')
	}
	return text
}

/** One-shot completion constrained to a JSON schema (structured outputs). */
export async function completeJson<T>(
	request: CompletionRequest & { schema: Record<string, unknown> },
): Promise<T> {
	const message = await runCompletion(request, {
		type: 'json_schema',
		schema: request.schema,
	})
	const text = extractText(message)
	try {
		return JSON.parse(text) as T
	} catch {
		throw new Error('Could not read the AI response.')
	}
}
