import {
	useChatGenerationContext,
	useChatHeaderSlot,
	useConversationsContext,
	usePreferencesContext,
	useTextToSpeechContext,
} from '@/providers/ChatProvider'
import { confirmDocumentDeletion } from '@/services/claude/documentTools'
import { CLAUDE_MODEL_NAME } from '@/services/claude/constants'
import { getConfiguredAiName } from '@/services/claude/systemInstruction'
import type { StoredMessage } from '@/storage/types'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChatConversationActions } from '@/components/chat/ChatConversationActions'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatMessages } from '@/components/chat/ChatMessages'

export function ChatPage() {
	const { preferences, savePreferences } = usePreferencesContext()
	const { conversation, appendMessages, updateMessage } = useConversationsContext()
	const {
		isGenerating,
		error,
		spendingWarning,
		streamingAssistant,
		submitMessage,
		regenerateMessage,
		stopGeneration,
		clearCompletionNotice,
		clearError,
		clearSpendingWarning,
	} = useChatGenerationContext()
	const {
		activeMessageId: activeSpeechMessageId,
		status: speechStatus,
		error: speechError,
		isSupported: isSpeechOutputSupported,
		speakAssistantMessage,
		stop: stopSpeech,
		pause: pauseSpeech,
		resume: resumeSpeech,
		clearError: clearSpeechError,
	} = useTextToSpeechContext()
	const { slot: voiceHeaderSlot } = useChatHeaderSlot()

	const [editingMessage, setEditingMessage] = useState<StoredMessage | null>(
		null,
	)

	const aiName = getConfiguredAiName(preferences)
	const hasApiKey = preferences.anthropicApiKey.trim().length > 0
	const messages = conversation?.messages ?? []
	const visibleStreamingAssistant =
		streamingAssistant && streamingAssistant.conversationId === conversation?.id
			? streamingAssistant
			: null
	const lastMessage = messages[messages.length - 1]
	const regenerableMessageId =
		lastMessage?.role === 'assistant' &&
		messages[messages.length - 2]?.role === 'user'
			? lastMessage.id
			: null

	useEffect(() => {
		clearCompletionNotice()
	}, [clearCompletionNotice])

	useEffect(() => {
		setEditingMessage(null)
	}, [conversation?.id])

	const handleWebSearchChange = useCallback(
		async (enabled: boolean) => {
			await savePreferences({ ...preferences, webSearchEnabled: enabled })
		},
		[preferences, savePreferences],
	)

	const handleEditUserMessage = useCallback(
		(message: StoredMessage) => {
			stopGeneration()
			setEditingMessage(message)
		},
		[stopGeneration],
	)

	const handleSubmit = useCallback(
		async (payload: Parameters<typeof submitMessage>[0]) => {
			stopSpeech()
			await submitMessage(payload)
			setEditingMessage(null)
		},
		[stopSpeech, submitMessage],
	)

	const handleRegenerate = useCallback(
		(message: StoredMessage) => {
			stopSpeech()
			void regenerateMessage(message.id)
		},
		[regenerateMessage, stopSpeech],
	)

	const handleConfirmDelete = useCallback(
		async (messageId: string, documentId: string, documentTitle: string) => {
			const deleted = await confirmDocumentDeletion(documentId)
			await updateMessage(messageId, { pendingDeleteConfirmation: undefined })
			if (deleted) {
				await appendMessages([
					{
						id: crypto.randomUUID(),
						role: 'assistant',
						content: `Deleted the document "${documentTitle}".`,
						createdAt: Date.now(),
					},
				])
			}
		},
		[appendMessages, updateMessage],
	)

	const handleCancelDelete = useCallback(
		async (messageId: string) => {
			await updateMessage(messageId, { pendingDeleteConfirmation: undefined })
			await appendMessages([
				{
					id: crypto.randomUUID(),
					role: 'assistant',
					content: 'Document deletion was cancelled.',
					createdAt: Date.now(),
				},
			])
		},
		[appendMessages, updateMessage],
	)

	const handleSpeakMessage = useCallback(
		(message: StoredMessage) => {
			clearSpeechError()
			void speakAssistantMessage({
				messageId: message.id,
				text: message.content,
			})
		},
		[clearSpeechError, speakAssistantMessage],
	)

	return (
		<div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
			<header className="hidden shrink-0 flex-wrap items-center justify-between gap-3 app-header-glass px-4 py-3 md:flex md:px-6">
				<div className="min-w-0">
					<div className="flex items-center gap-2">
						<h1 className="text-lg font-semibold">{aiName}</h1>
						{voiceHeaderSlot}
						<ChatConversationActions />
					</div>
					<p className="truncate text-xs text-muted-foreground">
						{conversation?.title ?? 'Chat'} · {CLAUDE_MODEL_NAME}
					</p>
				</div>
			</header>

			{!hasApiKey ? (
				<div className="shrink-0 border-b border-border bg-secondary/40 px-4 py-2 text-sm md:px-6">
					<span className="text-muted-foreground">
						No API key configured.{' '}
					</span>
					<Link
						to="/settings?tab=api"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Add your Anthropic API key
					</Link>
				</div>
			) : null}

			{error ? (
				<div className="shrink-0 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-sm text-destructive md:px-6">
					<div className="flex items-start justify-between gap-3">
						<p>{error}</p>
						<button
							type="button"
							className="shrink-0 text-xs underline-offset-4 hover:underline"
							onClick={clearError}
						>
							Dismiss
						</button>
					</div>
				</div>
			) : null}

			{spendingWarning && !error ? (
				<div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 md:px-6">
					<div className="flex items-start justify-between gap-3">
						<p>
							{spendingWarning}{' '}
							<Link
								to="/settings?tab=usage"
								className="font-medium underline-offset-4 hover:underline"
							>
								View usage
							</Link>
						</p>
						<button
							type="button"
							className="shrink-0 text-xs underline-offset-4 hover:underline"
							onClick={clearSpendingWarning}
						>
							Dismiss
						</button>
					</div>
				</div>
			) : null}

			{speechError ? (
				<div className="shrink-0 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-900 dark:text-amber-100 md:px-6">
					<div className="flex items-start justify-between gap-3">
						<p>{speechError}</p>
						<button
							type="button"
							className="shrink-0 text-xs underline-offset-4 hover:underline"
							onClick={clearSpeechError}
						>
							Dismiss
						</button>
					</div>
				</div>
			) : null}

			<ChatMessages
				key={conversation?.id ?? 'chat'}
				scrollConversationKey={conversation?.id}
				messages={messages}
				streamingAssistant={visibleStreamingAssistant}
				isGenerating={isGenerating && Boolean(visibleStreamingAssistant)}
				aiName={aiName}
				webSearchEnabled={preferences.webSearchEnabled}
				editingMessageId={editingMessage?.id ?? null}
				onEditUserMessage={handleEditUserMessage}
				regenerableMessageId={isGenerating ? null : regenerableMessageId}
				onRegenerate={handleRegenerate}
				onConfirmDelete={handleConfirmDelete}
				onCancelDelete={handleCancelDelete}
				activeSpeechMessageId={activeSpeechMessageId}
				speechStatus={speechStatus}
				onSpeakMessage={isSpeechOutputSupported ? handleSpeakMessage : undefined}
				onStopSpeech={stopSpeech}
				onPauseSpeech={pauseSpeech}
				onResumeSpeech={resumeSpeech}
				speechDisabled={isGenerating}
			/>

			<ChatInput
				disabled={!hasApiKey}
				isGenerating={isGenerating}
				webSearchEnabled={preferences.webSearchEnabled}
				onWebSearchChange={(enabled) => {
					void handleWebSearchChange(enabled)
				}}
				editingMessage={editingMessage}
				onCancelEdit={() => setEditingMessage(null)}
				onSubmit={(payload) => {
					void handleSubmit(payload)
				}}
				onStop={stopGeneration}
			/>
		</div>
	)
}
