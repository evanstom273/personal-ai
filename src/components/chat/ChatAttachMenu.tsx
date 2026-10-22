import { Check, FileText, Globe, ImagePlus, Plus } from 'lucide-react'
import { useRef } from 'react'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { DOCUMENT_UPLOAD_ACCEPT } from '@/utils/fileAttachments'
import { cn } from '@/utils/cn'

interface ChatAttachMenuProps {
	disabled?: boolean
	webSearchEnabled: boolean
	onWebSearchChange: (enabled: boolean) => void
	onDocumentUpload: (files: File[]) => void
	onImageUpload: (files: File[]) => void
}

export function ChatAttachMenu({
	disabled,
	webSearchEnabled,
	onWebSearchChange,
	onDocumentUpload,
	onImageUpload,
}: ChatAttachMenuProps) {
	const documentInputRef = useRef<HTMLInputElement>(null)
	const imageInputRef = useRef<HTMLInputElement>(null)

	return (
		<>
			<input
				ref={documentInputRef}
				type="file"
				multiple
				accept={DOCUMENT_UPLOAD_ACCEPT}
				className="hidden"
				onChange={(event) => {
					const files = Array.from(event.target.files ?? [])
					if (files.length > 0) {
						onDocumentUpload(files)
					}
					event.target.value = ''
				}}
			/>
			<input
				ref={imageInputRef}
				type="file"
				multiple
				accept="image/*"
				className="hidden"
				onChange={(event) => {
					const files = Array.from(event.target.files ?? [])
					if (files.length > 0) {
						onImageUpload(files)
					}
					event.target.value = ''
				}}
			/>

			<DropdownMenu modal={false}>
				<DropdownMenuTrigger
					hideChevron
					disabled={disabled}
					className="h-9 w-9 shrink-0 justify-center p-0 md:h-10 md:w-10"
					aria-label="Attach files or change web search"
				>
					<Plus className="h-4 w-4" />
				</DropdownMenuTrigger>
				<DropdownMenuContent
					side="top"
					align="start"
					collisionPadding={12}
					className="w-[min(17rem,calc(100vw-1.5rem))] max-h-[min(70svh,24rem)] overflow-y-auto"
				>
					<DropdownMenuLabel>Attach</DropdownMenuLabel>
					<DropdownMenuItem
						onSelect={() => {
							documentInputRef.current?.click()
						}}
					>
						<FileText className="h-4 w-4" />
						<span className="ml-2">Upload files</span>
						<span className="ml-auto text-xs text-muted-foreground">PDF, text, code</span>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() => {
							imageInputRef.current?.click()
						}}
					>
						<ImagePlus className="h-4 w-4" />
						<span className="ml-2">Upload images</span>
					</DropdownMenuItem>

					<DropdownMenuSeparator />
					<DropdownMenuLabel>Chat</DropdownMenuLabel>
					<DropdownMenuItem
						onSelect={(event) => {
							event.preventDefault()
							onWebSearchChange(!webSearchEnabled)
						}}
						className={cn('flex items-start gap-3 py-2.5', webSearchEnabled && 'bg-accent/60')}
					>
						<Globe className="mt-0.5 h-4 w-4 shrink-0" />
						<span className="min-w-0 flex-1">
							<span className="block font-medium">Web search</span>
							<span className="block text-xs text-muted-foreground">
								{webSearchEnabled
									? 'On — Claude can search and read pages when needed (about $0.01 per search)'
									: 'Off — replies use Claude’s own knowledge only'}
							</span>
						</span>
						{webSearchEnabled ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</>
	)
}
