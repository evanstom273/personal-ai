import {
	AlertTriangle,
	ArrowDown,
	Bot,
	ExternalLink,
	FileText,
	Globe,
	Loader2,
	Music,
	User,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ChatMarkdown } from '@/components/chat/ChatMarkdown'
import { MessageActions } from '@/components/chat/MessageActions'
import { MediaLightbox } from '@/components/media/MediaLightbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useFoldablePane } from '@/hooks/useFoldablePane'
import type {
	MessageDocumentLink,
	MessageWebActivity,
	StoredMessage,
} from '@/storage/types'
import type { TtsPlaybackStatus } from '@/hooks/useTextToSpeech'
import { formatTokenCount, formatUsd } from '@/services/claude/pricing'
import { formatMessageTime } from '@/utils/dateTime'
import { readChatScrollTop, saveChatScrollTop } from '@/utils/chatScrollState'
import { cn } from '@/utils/cn'

const BOTTOM_THRESHOLD_PX = 80

interface ChatMessagesProps {
	messages: StoredMessage[]
	streamingAssistant?: {
		id: string
		conversationId: string
		content: string
		activity: string | null
	} | null
	isGenerating: boolean
	aiName: string
	webSearchEnabled?: boolean
	editingMessageId?: string | null
	onEditUserMessage?: (message: StoredMessage) => void
	regenerableMessageId?: string | null
	onRegenerate?: (message: StoredMessage) => void
	onConfirmDelete: (
		messageId: string,
		documentId: string,
		documentTitle: string,
	) => void
	onCancelDelete: (messageId: string) => void
	activeSpeechMessageId?: string | null
	speechStatus?: TtsPlaybackStatus
	onSpeakMessage?: (message: StoredMessage) => void
	onStopSpeech?: () => void
	onPauseSpeech?: () => void
	onResumeSpeech?: () => void
	speechDisabled?: boolean
	streamingSlot?: ReactNode
	/** Keeps a separate saved scroll position per conversation. */
	scrollConversationKey?: string
}

export function ChatMessages({
	messages,
	streamingAssistant,
	isGenerating,
	aiName,
	webSearchEnabled = true,
	editingMessageId = null,
	onEditUserMessage,
	regenerableMessageId = null,
	onRegenerate,
	onConfirmDelete,
	onCancelDelete,
	activeSpeechMessageId = null,
	speechStatus = 'idle',
	onSpeakMessage,
	onStopSpeech,
	onPauseSpeech,
	onResumeSpeech,
	speechDisabled = false,
	streamingSlot,
	scrollConversationKey = 'default',
}: ChatMessagesProps) {
	const viewportRef = useRef<HTMLDivElement>(null)
	const previousMessageCountRef = useRef(messages.length)
	const hasRestoredScrollRef = useRef(false)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const scrollKey = scrollConversationKey

	const isNearBottom = useCallback((viewport: HTMLElement): boolean => {
		return (
			viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <=
			BOTTOM_THRESHOLD_PX
		)
	}, [])

	const updateScrollButtonVisibility = useCallback(() => {
		const viewport = viewportRef.current
		if (!viewport) {
			return
		}

		setShowScrollToBottom(!isNearBottom(viewport))
	}, [isNearBottom])

	const scrollToBottom = useCallback(
		(behavior: ScrollBehavior = 'smooth') => {
			const viewport = viewportRef.current
			if (!viewport) {
				return
			}

			viewport.scrollTo({
				top: viewport.scrollHeight,
				behavior,
			})
			saveChatScrollTop(viewport.scrollHeight, scrollKey)
			setShowScrollToBottom(false)
		},
		[scrollKey],
	)

	useLayoutEffect(() => {
		if (hasRestoredScrollRef.current) {
			return
		}

		const viewport = viewportRef.current
		if (!viewport) {
			return
		}

		const savedScrollTop = readChatScrollTop(scrollKey)
		if (savedScrollTop !== null) {
			viewport.scrollTop = savedScrollTop
			updateScrollButtonVisibility()
			hasRestoredScrollRef.current = true
			return
		}

		if (messages.length > 0 || streamingAssistant || isGenerating) {
			viewport.scrollTop = viewport.scrollHeight
			updateScrollButtonVisibility()
		}

		hasRestoredScrollRef.current = true
	}, [
		isGenerating,
		messages.length,
		scrollKey,
		streamingAssistant,
		updateScrollButtonVisibility,
	])

	useEffect(() => {
		const viewport = viewportRef.current
		if (!viewport) {
			return
		}

		function handleScroll(): void {
			saveChatScrollTop(viewport!.scrollTop, scrollKey)
			updateScrollButtonVisibility()
		}

		viewport.addEventListener('scroll', handleScroll, { passive: true })
		return () => {
			viewport.removeEventListener('scroll', handleScroll)
		}
	}, [scrollKey, updateScrollButtonVisibility])

	useEffect(() => {
		return () => {
			const viewport = viewportRef.current
			if (viewport) {
				saveChatScrollTop(viewport.scrollTop, scrollKey)
			}
		}
	}, [scrollKey])

	useEffect(() => {
		if (messages.length <= previousMessageCountRef.current) {
			previousMessageCountRef.current = messages.length
			return
		}

		const lastMessage = messages[messages.length - 1]
		previousMessageCountRef.current = messages.length

		if (lastMessage?.role === 'user') {
			scrollToBottom('smooth')
		}
	}, [messages, scrollToBottom])

	useEffect(() => {
		updateScrollButtonVisibility()
	}, [isGenerating, streamingAssistant?.content, updateScrollButtonVisibility])

	if (messages.length === 0 && !isGenerating) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-6 text-center">
				<div className="max-w-md space-y-3">
					<div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
						<Bot className="h-7 w-7" />
					</div>
					<h2 className="text-lg font-semibold">New conversation</h2>
					<p className="text-sm text-muted-foreground">
						Chat with {aiName}. Attach images, PDFs, or code, ask for help with
						your documents, projects, and reminders
						{webSearchEnabled ? ', or ask about anything current — web search is on' : ''}.
					</p>
				</div>
			</div>
		)
	}

	return (
		<div className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
			<ScrollArea viewportRef={viewportRef} className="h-full w-full max-w-full">
				<div className="mx-auto box-border w-full min-w-0 max-w-3xl px-4 py-2 md:px-6">
					{messages.map((message) => (
						<MessageRow
							key={message.id}
							message={message}
							aiName={aiName}
							isEditing={editingMessageId === message.id}
							onEditUserMessage={onEditUserMessage}
							editDisabled={isGenerating}
							onRegenerate={
								onRegenerate && message.id === regenerableMessageId
									? () => onRegenerate(message)
									: undefined
							}
							onConfirmDelete={onConfirmDelete}
							onCancelDelete={onCancelDelete}
							activeSpeechMessageId={activeSpeechMessageId}
							speechStatus={speechStatus}
							onSpeakMessage={onSpeakMessage}
							onStopSpeech={onStopSpeech}
							onPauseSpeech={onPauseSpeech}
							onResumeSpeech={onResumeSpeech}
							speechDisabled={speechDisabled}
						/>
					))}
					{streamingAssistant ? (
						<MessageRow
							message={{
								id: streamingAssistant.id,
								role: 'assistant',
								content: streamingAssistant.content,
								createdAt: Date.now(),
							}}
							aiName={aiName}
							onConfirmDelete={onConfirmDelete}
							onCancelDelete={onCancelDelete}
							isStreaming
							streamingActivity={streamingAssistant.activity}
							streamingSlot={streamingSlot}
						/>
					) : null}
					{isGenerating && !streamingAssistant ? (
						<div className="flex items-center gap-3 border-t border-border/40 py-6 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							{aiName} is thinking…
						</div>
					) : null}
				</div>
			</ScrollArea>

			{showScrollToBottom ? (
				<div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
					<Button
						type="button"
						size="icon"
						variant="secondary"
						className="pointer-events-auto h-10 w-10 rounded-full shadow-lg ring-1 ring-border"
						onClick={() => scrollToBottom('smooth')}
						aria-label="Scroll to latest message"
					>
						<ArrowDown className="h-4 w-4" />
					</Button>
				</div>
			) : null}
		</div>
	)
}

function MessageRow({
	message,
	aiName,
	onEditUserMessage,
	editDisabled = false,
	isEditing = false,
	onConfirmDelete,
	onCancelDelete,
	activeSpeechMessageId = null,
	speechStatus = 'idle',
	onSpeakMessage,
	onStopSpeech,
	onPauseSpeech,
	onResumeSpeech,
	speechDisabled = false,
	isStreaming = false,
	streamingActivity = null,
	streamingSlot,
	onRegenerate,
}: {
	message: StoredMessage
	aiName: string
	onEditUserMessage?: (message: StoredMessage) => void
	onRegenerate?: () => void
	streamingActivity?: string | null
	editDisabled?: boolean
	isEditing?: boolean
	onConfirmDelete: ChatMessagesProps['onConfirmDelete']
	onCancelDelete: ChatMessagesProps['onCancelDelete']
	activeSpeechMessageId?: string | null
	speechStatus?: TtsPlaybackStatus
	onSpeakMessage?: (message: StoredMessage) => void
	onStopSpeech?: () => void
	onPauseSpeech?: () => void
	onResumeSpeech?: () => void
	speechDisabled?: boolean
	isStreaming?: boolean
	streamingSlot?: ReactNode
}) {
	const contentRef = useRef<HTMLDivElement>(null)
	const isUser = message.role === 'user'
	const hasMedia = (message.media?.length ?? 0) > 0
	const showMediaFirst = !isUser && hasMedia
	const messageSpeechStatus =
		activeSpeechMessageId === message.id ? speechStatus : 'idle'

	return (
		<article
			className={cn(
				'min-w-0 max-w-full overflow-hidden border-b border-border/40 py-5 last:border-b-0',
				isUser ? 'flex justify-end' : 'flex justify-start',
			)}
		>
			<div
				className={cn(
					'flex min-w-0 max-w-full gap-3 md:gap-4',
					isUser ? 'w-full max-w-[88%] flex-row-reverse' : 'w-full',
				)}
			>
				<MessageAvatar isUser={isUser} aiName={aiName} />

				<div className={cn('min-w-0 flex-1', isUser && 'flex flex-col items-end')}>
					<div
						className={cn(
							'mb-1.5 flex flex-wrap items-center gap-2',
							isUser && 'justify-end',
						)}
					>
						<p className="text-xs font-medium text-muted-foreground">
							{isUser ? 'You' : aiName}
						</p>
						<span className="text-xs text-muted-foreground/80">
							{isStreaming ? 'Now' : formatMessageTime(message.createdAt)}
						</span>
					</div>

					<div
						className={cn(
							'min-w-0 max-w-full overflow-hidden',
							isUser &&
								'rounded-[1.25rem] bg-secondary px-4 py-3 ring-1 ring-border/60',
							isUser && isEditing && 'ring-2 ring-primary/50',
						)}
					>
						{showMediaFirst
							? message.media
									?.filter(
										(item): item is Extract<typeof item, { type: 'image' | 'audio' }> =>
											item.type === 'image' || item.type === 'audio',
									)
									.map((media, index) => (
									<MediaPreview
										key={`${message.id}-media-${index}`}
										media={media}
										className={index === 0 ? '' : 'mt-3'}
									/>
								))
							: null}

						<div
							ref={contentRef}
							tabIndex={-1}
							className={cn(
								'chat-message-content outline-none',
								isUser
									? 'text-sm leading-relaxed whitespace-pre-wrap'
									: 'text-[0.9375rem] leading-7',
								showMediaFirst && message.content.trim() ? 'mt-4' : '',
								isUser && hasMedia && message.content.trim() ? 'mb-3' : '',
							)}
						>
							{isUser ? (
								message.content
							) : streamingSlot && isStreaming ? (
								<div className="space-y-3">
									{streamingSlot}
									{message.content ? (
										<ChatMarkdown content={message.content} />
									) : null}
								</div>
							) : message.content ? (
								<ChatMarkdown content={message.content} />
							) : null}
							{isStreaming && (streamingActivity || !message.content) ? (
								<span
									className={cn(
										'inline-flex items-center gap-2 text-sm text-muted-foreground',
										message.content && 'mt-3',
									)}
								>
									<Loader2 className="h-4 w-4 animate-spin" />
									{streamingActivity ?? 'Thinking…'}
								</span>
							) : null}
						</div>

						{isUser && message.attachments?.length ? (
							<div className="mt-3 flex flex-wrap justify-end gap-2">
								{message.attachments.map((file, index) => (
									<span
										key={`${message.id}-file-${index}`}
										className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-background/60 px-2.5 py-1 text-xs ring-1 ring-border/60"
									>
										<FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
										<span className="truncate">{file.name}</span>
									</span>
								))}
							</div>
						) : null}

						{!showMediaFirst
							? message.media
									?.filter(
										(item): item is Extract<typeof item, { type: 'image' | 'audio' }> =>
											item.type === 'image' || item.type === 'audio',
									)
									.map((media, index) => (
									<MediaPreview
										key={`${message.id}-media-${index}`}
										media={media}
										className={index === 0 ? (isUser ? '' : 'mt-4') : 'mt-3'}
									/>
								))
							: null}

						{!isUser && message.web ? <WebActivityFooter web={message.web} /> : null}

						{message.stopNote ? (
							<p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
								<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
								{message.stopNote}
							</p>
						) : null}

						{message.documentLinks?.map((link) => (
							<DocumentLinkCard
								key={`${message.id}-doc-${link.id}`}
								link={link}
							/>
						))}

						{message.pendingDeleteConfirmation ? (
							<div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 p-4">
								<p className="text-sm">
									Confirm deletion of &quot;
									{message.pendingDeleteConfirmation.documentTitle}&quot;?
								</p>
								<div className="mt-3 flex flex-wrap gap-2">
									<Button
										size="sm"
										variant="destructive"
										onClick={() =>
											onConfirmDelete(
												message.id,
												message.pendingDeleteConfirmation!.documentId,
												message.pendingDeleteConfirmation!.documentTitle,
											)
										}
									>
										Delete document
									</Button>
									<Button
										size="sm"
										variant="outline"
										onClick={() => onCancelDelete(message.id)}
									>
										Cancel
									</Button>
								</div>
							</div>
						) : null}
					</div>

					{!isStreaming ? (
						<MessageActions
							contentRef={contentRef}
							text={message.content}
							className={cn('mt-2', isUser && 'justify-end')}
							onEdit={
								isUser && onEditUserMessage
									? () => onEditUserMessage(message)
									: undefined
							}
							editDisabled={editDisabled}
							onSpeak={
								!isUser && onSpeakMessage && message.content.trim()
									? () => onSpeakMessage(message)
									: undefined
							}
							onStopSpeak={onStopSpeech}
							onPauseSpeak={onPauseSpeech}
							onResumeSpeak={onResumeSpeech}
							speakStatus={messageSpeechStatus}
							speakDisabled={speechDisabled}
							onRegenerate={onRegenerate}
							regenerateDisabled={editDisabled}
							costLabel={message.usage ? formatUsd(message.usage.costUsd) : undefined}
							costTitle={message.usage ? describeUsage(message.usage) : undefined}
						/>
					) : null}
				</div>
			</div>
		</article>
	)
}

function MessageAvatar({
	isUser,
	aiName,
}: {
	isUser: boolean
	aiName: string
}) {
	return (
		<div
			className={cn(
				'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
				isUser
					? 'bg-secondary text-secondary-foreground ring-1 ring-border'
					: 'bg-primary/15 text-primary',
			)}
			aria-hidden
			title={isUser ? 'You' : aiName}
		>
			{isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
		</div>
	)
}

function DocumentLinkCard({
	link,
	className,
}: {
	link: MessageDocumentLink
	className?: string
}) {
	const { isDualPaneActive, openInSecondaryPane } = useFoldablePane()
	const targetRoute = `/library/documents/${link.id}`

	const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
		if (isDualPaneActive) {
			e.preventDefault()
			openInSecondaryPane(targetRoute)
		}
	}

	return (
		<Link
			to={targetRoute}
			onClick={handleClick}
			className={cn(
				'mt-3 flex min-w-0 max-w-full items-center gap-3 overflow-hidden rounded-xl border border-border bg-secondary/40 px-4 py-3 transition-colors hover:bg-secondary/70',
				className,
			)}
		>
			<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
				<FileText className="h-5 w-5" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="truncate text-sm font-medium">{link.title}</p>
				<p className="text-xs text-muted-foreground">
					Document {link.action === 'created' ? 'created' : 'updated'}
				</p>
			</div>
			<span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
				Open
				<ExternalLink className="h-3.5 w-3.5" />
			</span>
		</Link>
	)
}

function MediaPreview({
	media,
	className,
}: {
	media: NonNullable<StoredMessage['media']>[number]
	className?: string
}) {
	const label = media.type === 'image' ? 'Image' : 'Music'
	const Icon = media.type === 'audio' ? Music : null

	return (
		<div className={cn('min-w-0 overflow-hidden rounded-xl ring-1 ring-border', className)}>
			<div className="flex items-center gap-2 border-b border-border/60 bg-secondary/40 px-3 py-2 text-xs font-medium text-muted-foreground">
				{Icon ? <Icon className="h-3.5 w-3.5" /> : null}
				{label}
			</div>
			<div className="min-w-0 overflow-hidden bg-background p-2">
				{media.type === 'image' ? (
					<MediaLightbox
						src={media.dataUrl}
						alt="Generated image"
						className="ring-0"
					/>
				) : (
					<audio controls src={media.dataUrl} className="w-full max-w-full" />
				)}
			</div>
		</div>
	)
}

function describeUsage(usage: NonNullable<StoredMessage['usage']>): string {
	const parts = [
		`${formatTokenCount(usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} input tokens`,
		usage.cacheReadTokens > 0 ? `${formatTokenCount(usage.cacheReadTokens)} from cache` : null,
		`${formatTokenCount(usage.outputTokens)} output tokens`,
		usage.webSearches > 0
			? `${usage.webSearches} web search${usage.webSearches === 1 ? '' : 'es'}`
			: null,
		usage.requests > 1 ? `${usage.requests} API requests` : null,
	].filter(Boolean)
	return `Estimated cost: ${parts.join(' · ')}`
}

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

function WebActivityFooter({ web }: { web: MessageWebActivity }) {
	const searchCount = web.searchQueries.length
	const pageCount = web.fetchedUrls.length
	const summary = [
		searchCount > 0
			? `Searched the web for ${web.searchQueries.map((query) => `“${query}”`).join(', ')}`
			: null,
		pageCount > 0 ? `read ${pageCount} page${pageCount === 1 ? '' : 's'}` : null,
	]
		.filter(Boolean)
		.join(' · ')

	return (
		<div className="mt-4 rounded-xl border border-border/70 bg-secondary/30 px-3 py-2.5 text-xs">
			{summary ? (
				<p className="flex items-start gap-1.5 text-muted-foreground">
					<Globe className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>{summary}</span>
				</p>
			) : null}
			{web.sources.length > 0 ? (
				<>
					<p className={cn('font-medium text-foreground', summary && 'mt-2')}>Sources</p>
					<ol className="mt-1 space-y-1">
						{web.sources.map((source, index) => (
							<li key={source.url} className="flex min-w-0 gap-1.5">
								<span className="shrink-0 text-muted-foreground">{index + 1}.</span>
								<a
									href={source.url}
									target="_blank"
									rel="noopener noreferrer"
									className="min-w-0 truncate text-primary underline-offset-4 hover:underline"
									title={source.url}
								>
									{source.title}
									<span className="text-muted-foreground"> — {hostnameOf(source.url)}</span>
								</a>
							</li>
						))}
					</ol>
				</>
			) : null}
			{web.failures.length > 0 ? (
				<p className="mt-2 flex items-start gap-1.5 text-amber-700 dark:text-amber-300">
					<AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
					<span>Some web lookups failed: {web.failures.join('; ')}.</span>
				</p>
			) : null}
		</div>
	)
}
