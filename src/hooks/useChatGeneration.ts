import { useCallback, useEffect, useRef, useState } from 'react'
import {
	GenerationAbortedError,
	generateChatWithTools,
} from '@/services/claude/chatWithTools'
import { describeClaudeError, isAbortError } from '@/services/claude/client'
import { getConfiguredAiName } from '@/services/claude/systemInstruction'
import { queueMemoryArchive } from '@/services/memory/memoryArchive'
import { saveMessageMediaToLibrary } from '@/services/library/libraryMediaService'
import {
	getSpendingStatus,
	SpendingLimitError,
} from '@/services/usage/usageService'
import { capUnarchivedMessagesForModel } from '@/utils/chatHistory'
import type {
	ConversationRecord,
	MessageFileAttachment,
	MessageMedia,
	StoredMessage,
	UserPreferences,
} from '@/storage/types'
import type { ChatInputMethod, ChatSubmitPayload } from '@/types/chat'
import {
	notifyGenerationComplete,
	requestNotificationPermission,
} from '@/utils/notifications'

interface UseChatGenerationOptions {
	preferences: UserPreferences
	conversation: ConversationRecord | null
	appendMessages: (
		newMessages: StoredMessage[],
		conversationId?: string,
	) => Promise<ConversationRecord>
	truncateMessagesFrom: (
		messageId: string,
		conversationId?: string,
	) => Promise<ConversationRecord>
	ensureConversation: (conversationId?: string) => Promise<ConversationRecord>
	setMemoryArchiveCursor: (conversationId: string, cursor: number) => Promise<void>
	isChatRoute: boolean
	onAssistantReply?: (payload: {
		message: StoredMessage
		inputMethod: ChatInputMethod
	}) => void
	onMemoryArchiveError?: (error: Error) => void
}

export interface StreamingAssistantState {
	id: string
	conversationId: string
	content: string
	activity: string | null
}

export function useChatGeneration({
	preferences,
	conversation,
	appendMessages,
	truncateMessagesFrom,
	ensureConversation,
	setMemoryArchiveCursor,
	isChatRoute,
	onAssistantReply,
	onMemoryArchiveError,
}: UseChatGenerationOptions) {
	const [isGenerating, setIsGenerating] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [spendingWarning, setSpendingWarning] = useState<string | null>(null)
	const [streamingAssistant, setStreamingAssistant] =
		useState<StreamingAssistantState | null>(null)
	const [completionNotice, setCompletionNotice] = useState<string | null>(null)

	const streamingContentRef = useRef('')
	const abortControllerRef = useRef<AbortController | null>(null)
	const isChatRouteRef = useRef(isChatRoute)

	isChatRouteRef.current = isChatRoute

	useEffect(() => {
		if (isGenerating && !isChatRoute) {
			void requestNotificationPermission()
		}
	}, [isGenerating, isChatRoute])

	const clearCompletionNotice = useCallback(() => {
		setCompletionNotice(null)
	}, [])

	const clearError = useCallback(() => {
		setError(null)
	}, [])

	const clearSpendingWarning = useCallback(() => {
		setSpendingWarning(null)
	}, [])

	const stopGeneration = useCallback(() => {
		abortControllerRef.current?.abort()
	}, [])

	/** Checks local limits before any request is sent. Returns false when blocked. */
	const passesSpendingCheck = useCallback(async (): Promise<boolean> => {
		const status = await getSpendingStatus(preferences)
		if (status.blocked) {
			setError(status.message)
			return false
		}
		setSpendingWarning(status.warning)
		return true
	}, [preferences])

	const runAssistantTurn = useCallback(
		async (target: ConversationRecord, inputMethod: ChatInputMethod) => {
			const apiKey = preferences.anthropicApiKey.trim()
			const assistantMessageId = crypto.randomUUID()
			const abortController = new AbortController()
			abortControllerRef.current = abortController
			streamingContentRef.current = ''
			setStreamingAssistant({
				id: assistantMessageId,
				conversationId: target.id,
				content: '',
				activity: 'Thinking…',
			})

			try {
				const history = capUnarchivedMessagesForModel(
					target.messages,
					target.memoryArchiveCursor ?? 0,
				)

				const result = await generateChatWithTools(
					apiKey,
					history,
					preferences,
					target,
					{
						signal: abortController.signal,
						onTextChange: (text) => {
							streamingContentRef.current = text
							setStreamingAssistant((current) =>
								current ? { ...current, content: text } : null,
							)
						},
						onActivity: (activity) => {
							setStreamingAssistant((current) =>
								current && current.activity !== activity
									? { ...current, activity }
									: current,
							)
						},
					},
				)

				const assistantMessage: StoredMessage = {
					id: assistantMessageId,
					role: 'assistant',
					content: result.text,
					documentLinks:
						result.documentLinks.length > 0 ? result.documentLinks : undefined,
					pendingDeleteConfirmation: result.pendingDeleteConfirmation,
					web: result.web,
					usage: result.usage,
					stopNote: result.stopNote,
					createdAt: Date.now(),
				}

				const updatedConversation = await appendMessages(
					[assistantMessage],
					target.id,
				)
				setStreamingAssistant(null)
				streamingContentRef.current = ''

				queueMemoryArchive(
					apiKey,
					updatedConversation,
					preferences,
					(next) => setMemoryArchiveCursor(next.id, next.memoryArchiveCursor),
					onMemoryArchiveError,
				)

				if (assistantMessage.content.trim() && onAssistantReply) {
					onAssistantReply({ message: assistantMessage, inputMethod })
				}

				const aiName = getConfiguredAiName(preferences)
				if (!isChatRouteRef.current) {
					setCompletionNotice(`${aiName} finished replying.`)
				}

				void requestNotificationPermission().then(() => {
					void notifyGenerationComplete(aiName, assistantMessage.content, {
						isChatRoute: isChatRouteRef.current,
					})
				})

				void getSpendingStatus(preferences).then((status) => {
					setSpendingWarning(status.warning)
				})
			} catch (generationError) {
				if (
					generationError instanceof GenerationAbortedError ||
					isAbortError(generationError)
				) {
					const partialContent =
						generationError instanceof GenerationAbortedError
							? generationError.partialText.trim()
							: streamingContentRef.current.trim()
					if (partialContent) {
						await appendMessages(
							[
								{
									id: assistantMessageId,
									role: 'assistant',
									content: partialContent,
									usage:
										generationError instanceof GenerationAbortedError
											? generationError.partialUsage
											: undefined,
									stopNote: 'Stopped before the reply finished.',
									createdAt: Date.now(),
								},
							],
							target.id,
						)
					}
					setStreamingAssistant(null)
					streamingContentRef.current = ''
					return
				}

				setError(
					generationError instanceof SpendingLimitError
						? generationError.message
						: describeClaudeError(generationError),
				)
				setStreamingAssistant(null)
				streamingContentRef.current = ''

				if (!isChatRouteRef.current) {
					setCompletionNotice('The reply failed. Open chat to see details.')
				}
			} finally {
				abortControllerRef.current = null
				setIsGenerating(false)
			}
		},
		[
			appendMessages,
			onAssistantReply,
			onMemoryArchiveError,
			preferences,
			setMemoryArchiveCursor,
		],
	)

	const submitMessage = useCallback(
		async ({
			text,
			attachments,
			editFromMessageId,
			inputMethod,
		}: ChatSubmitPayload) => {
			if (isGenerating) {
				return
			}

			if (!preferences.anthropicApiKey.trim()) {
				setError('Add your Anthropic API key in Settings → API before chatting.')
				return
			}

			setError(null)
			setCompletionNotice(null)
			setIsGenerating(true)

			try {
				if (!(await passesSpendingCheck())) {
					setIsGenerating(false)
					return
				}

				let target = conversation ?? (await ensureConversation())
				if (editFromMessageId) {
					target = await truncateMessagesFrom(editFromMessageId, target.id)
				}

				const imageMedia: MessageMedia[] = attachments
					.filter((attachment) => attachment.type === 'image')
					.map((attachment) => ({
						type: 'image',
						mimeType: attachment.mimeType,
						dataUrl: attachment.dataUrl,
					}))

				const files: MessageFileAttachment[] = attachments.flatMap((attachment) =>
					attachment.type === 'document' && attachment.file ? [attachment.file] : [],
				)

				const userMessage: StoredMessage = {
					id: crypto.randomUUID(),
					role: 'user',
					content: text,
					media: imageMedia.length > 0 ? imageMedia : undefined,
					attachments: files.length > 0 ? files : undefined,
					createdAt: Date.now(),
				}
				target = await appendMessages([userMessage], target.id)

				if (imageMedia.length > 0) {
					await saveMessageMediaToLibrary(imageMedia, {
						source: 'upload',
						prompt: text,
					})
				}

				await runAssistantTurn(target, inputMethod)
			} catch (submitError) {
				setError(describeClaudeError(submitError))
				setStreamingAssistant(null)
				setIsGenerating(false)
			}
		},
		[
			appendMessages,
			conversation,
			ensureConversation,
			isGenerating,
			passesSpendingCheck,
			preferences.anthropicApiKey,
			runAssistantTurn,
			truncateMessagesFrom,
		],
	)

	/** Replaces the latest assistant reply with a fresh one for the same message. */
	const regenerateMessage = useCallback(
		async (assistantMessageId: string) => {
			if (isGenerating || !conversation) {
				return
			}

			if (!preferences.anthropicApiKey.trim()) {
				setError('Add your Anthropic API key in Settings → API before chatting.')
				return
			}

			const index = conversation.messages.findIndex(
				(message) => message.id === assistantMessageId,
			)
			if (index <= 0 || conversation.messages[index - 1]?.role !== 'user') {
				return
			}

			setError(null)
			setCompletionNotice(null)
			setIsGenerating(true)

			try {
				if (!(await passesSpendingCheck())) {
					setIsGenerating(false)
					return
				}

				const target = await truncateMessagesFrom(assistantMessageId, conversation.id)
				await runAssistantTurn(target, 'typed')
			} catch (regenerateError) {
				setError(describeClaudeError(regenerateError))
				setStreamingAssistant(null)
				setIsGenerating(false)
			}
		},
		[
			conversation,
			isGenerating,
			passesSpendingCheck,
			preferences.anthropicApiKey,
			runAssistantTurn,
			truncateMessagesFrom,
		],
	)

	return {
		isGenerating,
		error,
		spendingWarning,
		streamingAssistant,
		completionNotice,
		submitMessage,
		regenerateMessage,
		stopGeneration,
		clearCompletionNotice,
		clearError,
		clearSpendingWarning,
	}
}
