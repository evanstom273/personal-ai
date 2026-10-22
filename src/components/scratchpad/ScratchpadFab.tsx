import { Loader2, StickyNote } from 'lucide-react'
import { useScratchpad } from '@/providers/ScratchpadProvider'
import { cn } from '@/utils/cn'

export function ScratchpadFab() {
	const { toggleScratchpad, content } = useScratchpad()
	const hasContent = content.trim().length > 0

	return (
		<button
			type="button"
			onClick={toggleScratchpad}
			className={cn(
				'fixed left-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border shadow-lg transition-colors',
				'border-border/60 bg-card/95 text-foreground backdrop-blur-md',
				'hover:bg-accent hover:text-accent-foreground',
				'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
			)}
			style={{
				bottom: 'calc(var(--bottom-nav-height) + var(--chat-input-height, 0px) + 0.5rem)',
			}}
			aria-label="Open scratchpad"
		>
			<StickyNote className="h-5 w-5" />
			{hasContent ? (
				<span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-background" />
			) : null}
		</button>
	)
}

export function ScratchpadBusyIndicator() {
	const { isBusy, busyLabel } = useScratchpad()

	if (!isBusy) {
		return null
	}

	return (
		<div
			className="fixed left-4 z-30 flex items-center gap-2 rounded-full border border-border/60 bg-card/95 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur-md"
			style={{
				bottom: 'calc(var(--bottom-nav-height) + var(--chat-input-height, 0px) + 3.75rem)',
			}}
		>
			<Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
			{busyLabel ?? 'Working…'}
		</div>
	)
}
