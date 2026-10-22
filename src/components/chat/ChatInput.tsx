import { ArrowUp, FileText, Mic, Square, X } from 'lucide-react'
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type FormEvent,
	type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { ChatAttachMenu } from '@/components/chat/ChatAttachMenu'
import { DocumentMentionMenu } from '@/components/chat/DocumentMentionMenu'
import { Button } from '@/components/ui/button'
import { useDocumentMentionPicker } from '@/hooks/useDocumentMentionPicker'
import { useCloudflareTranscriber } from '@/hooks/useCloudflareTranscriber'
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition'
import { insertDocumentMention, buildDocumentMention } from '@/utils/documentMentions'
import { createDocument } from '@/services/documents/documentService'
import {
	ingestUploadedDocumentContent,
} from '@/utils/documentContent'
import type { ChatAttachment, ChatInputMethod, ChatSubmitPayload } from '@/types/chat'
import {
	MAX_PDF_ATTACHMENT_BYTES,
	MAX_PDF_ATTACHMENT_PAGES,
	MAX_TEXT_ATTACHMENT_CHARS,
} from '@/services/claude/constants'
import type { MessageFileAttachment, StoredMessage } from '@/storage/types'
import {
	getCodeFenceLanguage,
	getFileBaseName,
	isCodeFile,
	isImageFile,
	isPdfFile,
	isUploadableDocumentFile,
	prepareImageForClaude,
	readFileAsBase64,
	readTextFile,
	readUploadableDocumentContent,
} from '@/utils/fileAttachments'
import { cn } from '@/utils/cn'

interface ChatInputProps {
	disabled?: boolean
	isGenerating?: boolean
	webSearchEnabled: boolean
	onWebSearchChange: (enabled: boolean) => void
	onSubmit: (payload: ChatSubmitPayload) => void
	onStop?: () => void
	editingMessage?: StoredMessage | null
	onCancelEdit?: () => void
}

export function ChatInput({
	disabled,
	isGenerating,
	webSearchEnabled,
	onWebSearchChange,
	onSubmit,
	onStop,
	editingMessage = null,
	onCancelEdit,
}: ChatInputProps) {
	const [prompt, setPrompt] = useState('')
	const [cursorPosition, setCursorPosition] = useState(0)
	const [attachments, setAttachments] = useState<ChatAttachment[]>([])
	const [attachError, setAttachError] = useState<string | null>(null)
	const [inputMethod, setInputMethod] = useState<ChatInputMethod>('typed')
	const textareaRef = useRef<HTMLTextAreaElement>(null)
	const formRef = useRef<HTMLFormElement>(null)
	const mentionAnchorRef = useRef<HTMLDivElement>(null)
	const promptBeforeSpeechRef = useRef('')
	const [mentionMenuStyle, setMentionMenuStyle] = useState<CSSProperties | null>(
		null,
	)

	const adjustTextareaHeight = useCallback(() => {
		const textarea = textareaRef.current
		if (!textarea) {
			return
		}

		textarea.style.height = '0px'
		const maxHeight = 128
		const nextHeight = Math.min(textarea.scrollHeight, maxHeight)
		textarea.style.height = `${nextHeight}px`
		textarea.style.overflowY =
			textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
	}, [])

	const cloudflareTranscriber = useCloudflareTranscriber()
	const {
		isSupported,
		status,
		transcript,
		error: speechError,
		hint: speechHint,
		startListening,
		continueListening,
		cancelListening,
	} = useSpeechRecognition({ transcribe: cloudflareTranscriber })

	const isListening = status === 'listening'
	const isTranscribing = status === 'transcribing'
	const isReviewing = status === 'review'
	const inputDisabled = disabled || isGenerating || isListening || isTranscribing

	const {
		isOpen: isMentionMenuOpen,
		activeMention,
		filteredDocuments,
		selectedIndex,
		moveSelection,
	} = useDocumentMentionPicker(prompt, cursorPosition, !inputDisabled)

	const updateMentionMenuPosition = useCallback(() => {
		const anchor = mentionAnchorRef.current
		const textarea = textareaRef.current
		if (!anchor || !textarea) {
			return
		}

		const anchorRect = anchor.getBoundingClientRect()
		const textareaRect = textarea.getBoundingClientRect()
		const gap = 8
		const maxHeight = Math.max(160, textareaRect.top - gap - 16)

		setMentionMenuStyle({
			position: 'fixed',
			left: anchorRect.left,
			width: anchorRect.width,
			bottom: window.innerHeight - textareaRect.top + gap,
			maxHeight,
			zIndex: 60,
		})
	}, [])

	useLayoutEffect(() => {
		if (!isMentionMenuOpen) {
			setMentionMenuStyle(null)
			return
		}

		updateMentionMenuPosition()

		const handleLayoutChange = () => {
			updateMentionMenuPosition()
		}

		window.addEventListener('resize', handleLayoutChange)
		window.addEventListener('scroll', handleLayoutChange, true)
		window.visualViewport?.addEventListener('resize', handleLayoutChange)
		window.visualViewport?.addEventListener('scroll', handleLayoutChange)

		return () => {
			window.removeEventListener('resize', handleLayoutChange)
			window.removeEventListener('scroll', handleLayoutChange, true)
			window.visualViewport?.removeEventListener('resize', handleLayoutChange)
			window.visualViewport?.removeEventListener('scroll', handleLayoutChange)
		}
	}, [isMentionMenuOpen, prompt, cursorPosition, updateMentionMenuPosition])

	useEffect(() => {
		if (isListening) {
			setPrompt(transcript)
			setCursorPosition(transcript.length)
		}
	}, [isListening, transcript])

	useEffect(() => {
		adjustTextareaHeight()
	}, [adjustTextareaHeight, prompt])

	const resetSpeechState = useCallback(() => {
		if (isListening) {
			cancelListening()
			return
		}

		if (isReviewing) {
			cancelListening()
		}
	}, [cancelListening, isListening, isReviewing])

	useEffect(() => {
		if (!editingMessage) {
			return
		}

		setPrompt(editingMessage.content)
		setCursorPosition(editingMessage.content.length)
		setAttachments(storedMessageToAttachments(editingMessage))
		setAttachError(null)
		resetSpeechState()

		requestAnimationFrame(() => {
			const textarea = textareaRef.current
			if (!textarea) {
				return
			}
			textarea.focus()
			textarea.setSelectionRange(
				editingMessage.content.length,
				editingMessage.content.length,
			)
			adjustTextareaHeight()
		})
	}, [adjustTextareaHeight, editingMessage, resetSpeechState])

	const syncCursor = useCallback(() => {
		const nextPosition = textareaRef.current?.selectionStart ?? prompt.length
		setCursorPosition(nextPosition)
	}, [prompt.length])

	const insertMention = useCallback(
		(title: string) => {
			if (!activeMention) {
				return
			}

			const { nextText, nextCursor } = insertDocumentMention(
				prompt,
				activeMention,
				title,
			)
			setPrompt(nextText)
			setCursorPosition(nextCursor)

			requestAnimationFrame(() => {
				const textarea = textareaRef.current
				if (!textarea) {
					return
				}
				textarea.focus()
				textarea.setSelectionRange(nextCursor, nextCursor)
			})
		},
		[activeMention, prompt],
	)

	function handleSubmit(event?: FormEvent): void {
		event?.preventDefault()
		const trimmed = prompt.trim()
		if ((!trimmed && attachments.length === 0) || disabled || isGenerating || isListening) {
			return
		}

		let messageText = trimmed
		// Files sent directly to Claude need no mention; library-only copies are read via tools.
		const documentMentions = attachments
			.filter((attachment) => attachment.type === 'document' && !attachment.file)
			.map((attachment) => buildDocumentMention(attachment.name))

		for (const mention of documentMentions) {
			if (!messageText.includes(mention)) {
				messageText = messageText
					? `${messageText} ${mention}`
					: `Please review ${mention}`
			}
		}

		onSubmit({
			text: messageText,
			attachments,
			inputMethod,
			editFromMessageId: editingMessage?.id,
		})
		setPrompt('')
		setCursorPosition(0)
		setAttachments([])
		setAttachError(null)
		setInputMethod('typed')
		resetSpeechState()
		onCancelEdit?.()
	}

	async function handleDocumentUploads(files: File[]): Promise<void> {
		setAttachError(null)

		if (files.length === 0) {
			return
		}

		const results = await Promise.allSettled(
			files.map(async (file) => {
				if (!isUploadableDocumentFile(file)) {
					throw new Error(
						`${file.name} is not a supported file (PDF, text, Markdown, or code).`,
					)
				}

				return isPdfFile(file) ? preparePdfAttachment(file) : prepareTextAttachment(file)
			}),
		)

		const nextAttachments: ChatAttachment[] = []
		const errors: string[] = []

		for (const result of results) {
			if (result.status === 'fulfilled') {
				nextAttachments.push(result.value)
				continue
			}

			errors.push(
				result.reason instanceof Error
					? result.reason.message
					: 'Could not upload one of the documents.',
			)
		}

		if (nextAttachments.length > 0) {
			setAttachments((current) => [...current, ...nextAttachments])
		}

		if (errors.length > 0) {
			setAttachError(errors.join(' '))
		}
	}

	async function handleImageUploads(files: File[]): Promise<void> {
		setAttachError(null)

		if (files.length === 0) {
			return
		}

		const results = await Promise.allSettled(
			files.map(async (file) => {
				if (!isImageFile(file)) {
					throw new Error(`${file.name} is not an image file.`)
				}

				const { dataUrl, mimeType } = await prepareImageForClaude(file)

				return {
					id: crypto.randomUUID(),
					type: 'image' as const,
					name: file.name,
					dataUrl,
					mimeType,
				}
			}),
		)

		const nextAttachments: ChatAttachment[] = []
		const errors: string[] = []

		for (const result of results) {
			if (result.status === 'fulfilled') {
				nextAttachments.push(result.value)
				continue
			}

			errors.push(
				result.reason instanceof Error
					? result.reason.message
					: 'Could not upload one of the images.',
			)
		}

		if (nextAttachments.length > 0) {
			setAttachments((current) => [...current, ...nextAttachments])
		}

		if (errors.length > 0) {
			setAttachError(errors.join(' '))
		}
	}

	function removeAttachment(id: string): void {
		setAttachments((current) => current.filter((attachment) => attachment.id !== id))
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		if (isMentionMenuOpen) {
			if (event.key === 'ArrowDown') {
				event.preventDefault()
				moveSelection(1)
				return
			}

			if (event.key === 'ArrowUp') {
				event.preventDefault()
				moveSelection(-1)
				return
			}

			if (event.key === 'Enter' && !event.shiftKey) {
				event.preventDefault()
				const selected = filteredDocuments[selectedIndex]
				if (selected) {
					insertMention(selected.title)
				}
				return
			}

			if (event.key === 'Escape') {
				event.preventDefault()
				return
			}
		}
	}

	function handleMicPress(): void {
		if (disabled || isGenerating || isListening || isTranscribing) {
			return
		}

		promptBeforeSpeechRef.current = prompt
		void startListening(prompt)
	}

	function handleContinue(): void {
		void continueListening().then((nextTranscript) => {
			const nextPrompt = nextTranscript.trim()
			setPrompt(nextPrompt)
			setCursorPosition(nextPrompt.length)
			setInputMethod('speech')
		})
	}

	function handleCancelSpeech(): void {
		cancelListening()
		if (isListening || isTranscribing) {
			setPrompt(promptBeforeSpeechRef.current)
			setCursorPosition(promptBeforeSpeechRef.current.length)
		}
	}

	function handleCancelMessageEdit(): void {
		setPrompt('')
		setCursorPosition(0)
		setAttachments([])
		setAttachError(null)
		onCancelEdit?.()
	}

	// Publish the bar's height so floating buttons (scratchpad) can sit above it.
	useEffect(() => {
		const form = formRef.current
		if (!form) {
			return
		}
		const root = document.documentElement
		const observer = new ResizeObserver(() => {
			root.style.setProperty('--chat-input-height', `${form.offsetHeight}px`)
		})
		observer.observe(form)
		return () => {
			observer.disconnect()
			root.style.removeProperty('--chat-input-height')
		}
	}, [])

	return (
		<form
			ref={formRef}
			onSubmit={handleSubmit}
			className="chat-input-bar relative z-30 w-full max-w-full shrink-0 overflow-visible border-t border-border px-3 py-2.5 md:px-8 md:py-4"
		>
			{isListening ? (
				<div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 text-xs text-primary">
					<span className="relative flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
					</span>
					Listening… speak now. Press Continue when done.
				</div>
			) : null}

			{isTranscribing ? (
				<div className="mx-auto mb-2 flex max-w-3xl items-center gap-2 text-xs text-primary">
					Transcribing your recording…
				</div>
			) : null}

			{editingMessage ? (
				<div className="mx-auto mb-2 flex max-w-3xl items-center justify-between gap-2 text-xs text-primary">
					<span>
						Editing message — send to replace this and following replies.
					</span>
					{onCancelEdit ? (
						<button
							type="button"
							className="shrink-0 text-muted-foreground underline-offset-4 hover:underline"
							onClick={handleCancelMessageEdit}
						>
							Cancel edit
						</button>
					) : null}
				</div>
			) : null}

			{isReviewing && prompt.trim() && !editingMessage ? (
				<div className="mx-auto mb-2 max-w-3xl text-xs text-muted-foreground">
					Edit your message below, then send when ready.
				</div>
			) : null}

			{speechError ? (
				<div className="mx-auto mb-2 max-w-3xl text-xs text-destructive">
					{speechError}
				</div>
			) : null}

			{speechHint ? (
				<div className="mx-auto mb-2 max-w-3xl text-xs text-muted-foreground">
					{speechHint}
				</div>
			) : null}

			{attachError ? (
				<div className="mx-auto mb-2 max-w-3xl text-xs text-destructive">
					{attachError}
				</div>
			) : null}

			{attachments.length > 0 ? (
				<div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
					{attachments.map((attachment) => (
						<div
							key={attachment.id}
							className="flex items-center gap-2 rounded-full surface-panel px-3 py-1.5 text-xs"
						>
							{attachment.type === 'image' ? (
								<img
									src={attachment.dataUrl}
									alt=""
									className="h-5 w-5 rounded object-cover"
								/>
							) : (
								<FileText className="h-3.5 w-3.5 text-muted-foreground" />
							)}
							<span className="max-w-[10rem] truncate">{attachment.name}</span>
							<button
								type="button"
								className="text-muted-foreground hover:text-foreground"
								onClick={() => removeAttachment(attachment.id)}
								aria-label={`Remove ${attachment.name}`}
							>
								<X className="h-3.5 w-3.5" />
							</button>
						</div>
					))}
				</div>
			) : null}

			<div ref={mentionAnchorRef} className="relative mx-auto w-full min-w-0 max-w-3xl">
				{isMentionMenuOpen && mentionMenuStyle
					? createPortal(
							<DocumentMentionMenu
								documents={filteredDocuments}
								selectedIndex={selectedIndex}
								onSelect={(document) => insertMention(document.title)}
								style={mentionMenuStyle}
							/>,
							document.body,
						)
					: null}

				<div
					className={cn(
						'flex items-end gap-2 surface-glass rounded-2xl p-2 shadow-sm',
						isListening ? 'border-primary/50 ring-1 ring-primary/30' : 'border-border',
					)}
				>
					<ChatAttachMenu
						disabled={disabled || isGenerating || isListening || isTranscribing}
						webSearchEnabled={webSearchEnabled}
						onWebSearchChange={onWebSearchChange}
						onDocumentUpload={(files) => {
							void handleDocumentUploads(files)
						}}
						onImageUpload={(files) => {
							void handleImageUploads(files)
						}}
					/>

					{isSupported ? (
						<Button
							type="button"
							size="icon"
							variant={isListening ? 'default' : 'outline'}
							disabled={disabled || isGenerating || isTranscribing}
							onClick={handleMicPress}
							aria-label="Start voice input"
							className={cn(isListening && 'animate-pulse')}
						>
							<Mic className="h-4 w-4" />
						</Button>
					) : null}

					<textarea
						ref={textareaRef}
						value={prompt}
						onChange={(event) => {
							setPrompt(event.target.value)
							setCursorPosition(event.target.selectionStart)
							if (!isListening && !isTranscribing) {
								setInputMethod('typed')
							}
						}}
						onClick={syncCursor}
						onKeyUp={syncCursor}
						onKeyDown={handleKeyDown}
						placeholder={
							isTranscribing
								? 'Transcribing…'
								: isListening
									? 'Recording…'
									: 'Message…'
						}
						disabled={inputDisabled}
						readOnly={isListening}
						enterKeyHint="enter"
						rows={1}
						className="max-h-32 min-h-[40px] flex-1 resize-none overflow-hidden bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60 md:min-h-[44px] md:px-3"
					/>

					{isListening ? (
						<>
							<Button
								type="button"
								size="icon"
								variant="ghost"
								onClick={handleCancelSpeech}
								aria-label="Cancel voice input"
							>
								<X className="h-4 w-4" />
							</Button>
							<Button
								type="button"
								variant="secondary"
								onClick={handleContinue}
								className="shrink-0"
							>
								Continue
							</Button>
						</>
					) : isGenerating ? (
						<Button
							type="button"
							size="icon"
							variant="secondary"
							onClick={onStop}
							aria-label="Stop generating"
						>
							<Square className="h-4 w-4" />
						</Button>
					) : (
						<Button
							type="submit"
							size="icon"
							disabled={disabled || (!prompt.trim() && attachments.length === 0)}
							aria-label="Send message"
						>
							<ArrowUp className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			<p className="mx-auto mt-2 hidden max-w-3xl text-center text-xs text-muted-foreground md:block">
				Use <span className="font-medium text-foreground">+</span> to attach images,
				PDFs, or text and code files, or toggle web search. Type{' '}
				<span className="font-medium text-foreground">@</span> to reference documents.
			</p>
		</form>
	)
}

function storedMessageToAttachments(message: StoredMessage): ChatAttachment[] {
	const images: ChatAttachment[] = (message.media ?? [])
		.filter((item) => item.type === 'image')
		.map((item, index) => ({
			id: crypto.randomUUID(),
			type: 'image' as const,
			name: `Image ${index + 1}`,
			dataUrl: item.dataUrl,
			mimeType: item.mimeType,
		}))

	const files: ChatAttachment[] = (message.attachments ?? []).map((file) => ({
		id: crypto.randomUUID(),
		type: 'document' as const,
		name: file.name,
		documentId: file.documentId,
		file,
	}))

	return [...images, ...files]
}

/**
 * PDFs within the size/page limits go to Claude as native documents (text and
 * page images). A text copy is also saved to the library when one can be
 * extracted; scanned PDFs skip that step.
 */
async function preparePdfAttachment(file: File): Promise<ChatAttachment> {
	const { getPdfPageCount } = await import('@/utils/pdfText')
	const pageCount = await getPdfPageCount(file).catch(() => Number.POSITIVE_INFINITY)
	const fitsInline =
		file.size <= MAX_PDF_ATTACHMENT_BYTES && pageCount <= MAX_PDF_ATTACHMENT_PAGES

	let documentId: string | undefined
	let title = getFileBaseName(file.name) || 'Uploaded PDF'
	try {
		const raw = await readUploadableDocumentContent(file)
		const { content, contentFormat } = ingestUploadedDocumentContent(file, raw)
		const document = await createDocument(title, content, {
			source: 'upload',
			contentFormat,
		})
		documentId = document.id
		title = document.title
	} catch (extractError) {
		if (!fitsInline) {
			throw extractError instanceof Error
				? extractError
				: new Error(`${file.name} could not be read.`)
		}
	}

	if (!fitsInline) {
		if (!documentId) {
			throw new Error(`${file.name} is too large to attach.`)
		}
		// Too big to send whole; Claude reads the extracted text from the library instead.
		return { id: crypto.randomUUID(), type: 'document', name: title, documentId }
	}

	const pdf: MessageFileAttachment = {
		kind: 'pdf',
		name: file.name,
		mimeType: 'application/pdf',
		data: await readFileAsBase64(file),
		documentId,
	}
	return { id: crypto.randomUUID(), type: 'document', name: title, documentId, file: pdf }
}

async function prepareTextAttachment(file: File): Promise<ChatAttachment> {
	const raw = await readTextFile(file)
	const title = getFileBaseName(file.name) || 'Uploaded document'
	const libraryContent = isCodeFile(file)
		? `\`\`\`${getCodeFenceLanguage(file)}\n${raw.trimEnd()}\n\`\`\``
		: raw
	const { content, contentFormat } = ingestUploadedDocumentContent(file, libraryContent)
	const document = await createDocument(title, content, {
		source: 'upload',
		contentFormat,
	})

	if (raw.length > MAX_TEXT_ATTACHMENT_CHARS) {
		return { id: crypto.randomUUID(), type: 'document', name: document.title, documentId: document.id }
	}

	const textFile: MessageFileAttachment = {
		kind: 'text',
		name: file.name,
		mimeType: file.type || 'text/plain',
		data: raw,
		documentId: document.id,
	}
	return {
		id: crypto.randomUUID(),
		type: 'document',
		name: document.title,
		documentId: document.id,
		file: textFile,
	}
}
