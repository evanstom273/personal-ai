import { Download, Maximize2 } from 'lucide-react'
import { useState } from 'react'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/utils/cn'
import { downloadLibraryMediaItem } from '@/utils/downloads'

interface MediaLightboxProps {
	src: string
	alt: string
	title?: string
	className?: string
	previewClassName?: string
}

export function MediaLightbox({
	src,
	alt,
	title,
	className,
	previewClassName,
}: MediaLightboxProps) {
	const [open, setOpen] = useState(false)

	return (
		<>
			<button
				type="button"
				onClick={() => setOpen(true)}
				className={cn(
					'group relative block w-full min-w-0 overflow-hidden rounded-lg ring-1 ring-border',
					className,
				)}
				aria-label="View image full screen"
			>
				<img
					src={src}
					alt={alt}
					className={cn(
						'block max-h-64 w-full max-w-full object-contain md:max-h-80',
						previewClassName,
					)}
				/>
				<span className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/45 via-transparent to-transparent p-2 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
					<span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[11px] font-medium text-white">
						<Maximize2 className="h-3 w-3" />
						Full screen
					</span>
				</span>
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent
					className="fixed inset-0 top-0 left-0 flex h-full w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-black/95 p-0 shadow-none"
					closeClassName="top-[calc(var(--app-top-inset)+0.75rem)] right-3 z-10 rounded-full bg-white/10 p-2 text-white opacity-100 hover:bg-white/20 [&_svg]:h-5 [&_svg]:w-5"
					aria-describedby={undefined}
				>
					<DialogTitle className="sr-only">{title ?? alt}</DialogTitle>
					<DialogDescription className="sr-only">
						Full screen image viewer
					</DialogDescription>
					<button
						type="button"
						onClick={() => {
							const mimeType = src.match(/^data:([^;,]+)/)?.[1] ?? 'image/png'
							downloadLibraryMediaItem(title ?? alt, mimeType, src)
						}}
						className="absolute top-[calc(var(--app-top-inset)+0.75rem)] left-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20"
					>
						<Download className="h-3.5 w-3.5" />
						Download
					</button>
					<div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-[calc(var(--app-top-inset)+3.5rem)]">
						<img
							src={src}
							alt={alt}
							className="max-h-[calc(100vh-5rem)] max-w-full object-contain"
						/>
					</div>
					{title ? (
						<p className="shrink-0 truncate px-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm text-white/80">
							{title}
						</p>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	)
}
