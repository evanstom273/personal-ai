import { Check, Copy, Loader2, Pause, Pencil, Play, RefreshCw, Square, TextSelect, Volume2 } from 'lucide-react'
import { useCallback, useState, type RefObject } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface MessageActionsProps {
	contentRef: RefObject<HTMLElement | null>
	text: string
	className?: string
	onEdit?: () => void
	editDisabled?: boolean
	onSpeak?: () => void
	onStopSpeak?: () => void
	speakStatus?: 'idle' | 'loading' | 'playing' | 'paused'
	onPauseSpeak?: () => void
	onResumeSpeak?: () => void
	speakDisabled?: boolean
	onRegenerate?: () => void
	regenerateDisabled?: boolean
	/** Estimated cost of this reply, shown quietly at the end of the row. */
	costLabel?: string
	costTitle?: string
}

export function MessageActions({
	contentRef,
	text,
	className,
	onEdit,
	editDisabled = false,
	onSpeak,
	onStopSpeak,
	speakStatus = 'idle',
	speakDisabled = false,
	onPauseSpeak,
	onResumeSpeak,
	onRegenerate,
	regenerateDisabled = false,
	costLabel,
	costTitle,
}: MessageActionsProps) {
	const [copied, setCopied] = useState(false)

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(text)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 2000)
		} catch {
			// Clipboard access can fail in insecure contexts.
		}
	}, [text])

	const handleSelectAll = useCallback(() => {
		const element = contentRef.current
		if (!element) {
			return
		}

		const range = document.createRange()
		range.selectNodeContents(element)
		const selection = window.getSelection()
		selection?.removeAllRanges()
		selection?.addRange(range)
		element.focus({ preventScroll: true })
	}, [contentRef])

	const isPaused = speakStatus === 'paused'
	const isSpeaking = speakStatus === 'playing' || isPaused
	const isLoadingSpeech = speakStatus === 'loading'

	return (
		<div className={cn('flex flex-wrap items-center gap-1', className)}>
			{onEdit ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
					disabled={editDisabled}
					onClick={onEdit}
					aria-label="Edit message"
				>
					<Pencil className="h-3.5 w-3.5" />
					Edit
				</Button>
			) : null}
			{onSpeak ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
					disabled={speakDisabled || isLoadingSpeech}
					onClick={() => {
						if (isSpeaking) {
							onStopSpeak?.()
							return
						}
						onSpeak()
					}}
					aria-label={
						isLoadingSpeech
							? 'Generating speech'
							: isSpeaking
								? 'Stop speech'
								: 'Read message aloud'
					}
				>
					{isLoadingSpeech ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin" />
					) : isSpeaking ? (
						<Square className="h-3.5 w-3.5" />
					) : (
						<Volume2 className="h-3.5 w-3.5" />
					)}
					{isLoadingSpeech ? 'Loading' : isSpeaking ? 'Stop' : 'Listen'}
				</Button>
			) : null}
			{onSpeak && isSpeaking && onPauseSpeak && onResumeSpeak ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
					onClick={isPaused ? onResumeSpeak : onPauseSpeak}
					aria-label={isPaused ? 'Resume speech' : 'Pause speech'}
				>
					{isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
					{isPaused ? 'Resume' : 'Pause'}
				</Button>
			) : null}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
				onClick={() => {
					void handleCopy()
				}}
				aria-label={copied ? 'Copied message' : 'Copy message'}
			>
				{copied ? (
					<Check className="h-3.5 w-3.5" />
				) : (
					<Copy className="h-3.5 w-3.5" />
				)}
				{copied ? 'Copied' : 'Copy'}
			</Button>
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
				onClick={handleSelectAll}
				aria-label="Select message"
			>
				<TextSelect className="h-3.5 w-3.5" />
				Select
			</Button>
			{onRegenerate ? (
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
					disabled={regenerateDisabled}
					onClick={onRegenerate}
					aria-label="Regenerate reply"
				>
					<RefreshCw className="h-3.5 w-3.5" />
					Regenerate
				</Button>
			) : null}
			{costLabel ? (
				<span
					className="px-1.5 text-[11px] tabular-nums text-muted-foreground/70"
					title={costTitle}
				>
					{costLabel}
				</span>
			) : null}
		</div>
	)
}
