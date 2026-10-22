import {
	Check,
	Download,
	MessagesSquare,
	Pencil,
	Plus,
	ScrollText,
	Trash2,
	Upload,
} from 'lucide-react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { useRef, useState, type ChangeEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
	useChatGenerationContext,
	useConversationsContext,
} from '@/providers/ChatProvider'
import {
	downloadChatExport,
	isChatExportZipFileName,
	parseChatImportFile,
	parseChatImportZip,
} from '@/utils/chatExport'
import type { ConversationRecord } from '@/storage/types'
import { cn } from '@/utils/cn'
import { formatMessageTime } from '@/utils/dateTime'

type ActiveDialog = 'clear' | 'import' | 'rename' | 'instructions' | 'delete' | null

export function ChatConversationActions() {
	const {
		conversation,
		conversations,
		clearConversation,
		createConversation,
		switchConversation,
		renameConversation,
		setConversationInstructions,
		deleteConversation,
		importConversation,
	} = useConversationsContext()
	const { isGenerating, stopGeneration } = useChatGenerationContext()

	const importInputRef = useRef<HTMLInputElement>(null)
	const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null)
	const [pendingImport, setPendingImport] = useState<ConversationRecord | null>(
		null,
	)
	const [importError, setImportError] = useState<string | null>(null)
	const [isWorking, setIsWorking] = useState(false)
	const [draft, setDraft] = useState('')

	const messageCount = conversation?.messages.length ?? 0

	function openDialog(dialog: Exclude<ActiveDialog, null>): void {
		if (dialog === 'rename') {
			setDraft(conversation?.title ?? '')
		} else if (dialog === 'instructions') {
			setDraft(conversation?.instructions ?? '')
		}
		setActiveDialog(dialog)
	}

	function closeDialog(): void {
		setActiveDialog(null)
		setPendingImport(null)
	}

	async function runAndClose(action: () => Promise<unknown>): Promise<void> {
		setIsWorking(true)
		try {
			await action()
			closeDialog()
		} finally {
			setIsWorking(false)
		}
	}

	function handleImportFileChange(event: ChangeEvent<HTMLInputElement>): void {
		const file = event.target.files?.[0]
		event.target.value = ''
		if (!file) {
			return
		}

		setImportError(null)
		const reader = new FileReader()
		const isZip = isChatExportZipFileName(file.name)

		reader.onload = () => {
			try {
				const imported = isZip
					? parseChatImportZip(new Uint8Array(reader.result as ArrayBuffer))
					: parseChatImportFile(JSON.parse(String(reader.result)))
				setPendingImport(imported)
				setActiveDialog('import')
			} catch (error) {
				setImportError(
					error instanceof Error ? error.message : 'Could not read that chat file.',
				)
			}
		}
		reader.onerror = () => {
			setImportError('Could not read that chat file.')
		}

		if (isZip) {
			reader.readAsArrayBuffer(file)
		} else {
			reader.readAsText(file)
		}
	}

	return (
		<div className="flex flex-col">
			<input
				ref={importInputRef}
				type="file"
				accept="application/json,.json,application/zip,.zip"
				className="hidden"
				onChange={handleImportFileChange}
			/>

			<div className="flex items-center gap-1">
				<DropdownMenu modal={false}>
					<DropdownMenuPrimitive.Trigger asChild disabled={isGenerating}>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-8 w-8"
							aria-label="Conversations"
							title="Conversations"
						>
							<MessagesSquare className="h-4 w-4" />
						</Button>
					</DropdownMenuPrimitive.Trigger>
					<DropdownMenuContent
						align="end"
						className="w-[min(18rem,calc(100vw-1.5rem))] max-h-[min(70svh,28rem)] overflow-y-auto"
					>
						<DropdownMenuItem onSelect={() => void createConversation()}>
							<Plus className="mr-2 h-4 w-4" />
							New conversation
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>Conversations</DropdownMenuLabel>
						{conversations.map((entry) => {
							const isActive = entry.id === conversation?.id
							return (
								<DropdownMenuItem
									key={entry.id}
									onSelect={() => {
										if (!isActive) {
											void switchConversation(entry.id)
										}
									}}
									className={cn('flex items-start gap-2', isActive && 'bg-accent/60')}
								>
									<span className="min-w-0 flex-1">
										<span className="block truncate font-medium">{entry.title}</span>
										<span className="block text-xs text-muted-foreground">
											{entry.messageCount} message{entry.messageCount === 1 ? '' : 's'} ·{' '}
											{formatMessageTime(entry.updatedAt)}
										</span>
									</span>
									{isActive ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : null}
								</DropdownMenuItem>
							)
						})}
						<DropdownMenuSeparator />
						<DropdownMenuItem onSelect={() => openDialog('rename')}>
							<Pencil className="mr-2 h-4 w-4" />
							Rename this conversation
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => openDialog('instructions')}>
							<ScrollText className="mr-2 h-4 w-4" />
							Conversation instructions
						</DropdownMenuItem>
						<DropdownMenuItem
							className="text-destructive"
							onSelect={() => openDialog('delete')}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete this conversation
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					disabled={!conversation || isGenerating}
					onClick={() => {
						if (conversation) {
							downloadChatExport(conversation)
						}
					}}
					aria-label="Export chat as ZIP"
					title="Export chat"
				>
					<Download className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					disabled={isGenerating}
					onClick={() => importInputRef.current?.click()}
					aria-label="Import chat ZIP or JSON"
					title="Import chat"
				>
					<Upload className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					className="h-8 w-8"
					disabled={messageCount === 0 || isGenerating}
					onClick={() => openDialog('clear')}
					aria-label="Clear chat"
					title="Clear chat"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>

			{importError ? (
				<p className="mt-1 text-xs text-destructive">{importError}</p>
			) : null}

			<Dialog
				open={activeDialog !== null}
				onOpenChange={(open) => {
					if (!open) {
						closeDialog()
					}
				}}
			>
				<DialogContent>
					{activeDialog === 'clear' ? (
						<>
							<DialogHeader>
								<DialogTitle>Clear this conversation?</DialogTitle>
								<DialogDescription>
									This permanently deletes all {messageCount} message
									{messageCount === 1 ? '' : 's'} in “{conversation?.title}”.
									Memory, documents, and library items are not affected.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline">Cancel</Button>
								</DialogClose>
								<Button
									variant="destructive"
									disabled={isWorking}
									onClick={() =>
										void runAndClose(async () => {
											stopGeneration()
											await clearConversation()
										})
									}
								>
									{isWorking ? 'Clearing…' : 'Clear chat'}
								</Button>
							</DialogFooter>
						</>
					) : null}

					{activeDialog === 'import' ? (
						<>
							<DialogHeader>
								<DialogTitle>Import this chat?</DialogTitle>
								<DialogDescription>
									{pendingImport?.messages.length ?? 0} message
									{(pendingImport?.messages.length ?? 0) === 1 ? '' : 's'} will be
									added as a new conversation. Your existing conversations are not
									changed.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline">Cancel</Button>
								</DialogClose>
								<Button
									disabled={isWorking || !pendingImport}
									onClick={() =>
										void runAndClose(async () => {
											if (pendingImport) {
												await importConversation(pendingImport)
											}
										})
									}
								>
									{isWorking ? 'Importing…' : 'Import chat'}
								</Button>
							</DialogFooter>
						</>
					) : null}

					{activeDialog === 'rename' ? (
						<form
							onSubmit={(event) => {
								event.preventDefault()
								if (conversation && draft.trim()) {
									void runAndClose(() => renameConversation(conversation.id, draft))
								}
							}}
						>
							<DialogHeader>
								<DialogTitle>Rename conversation</DialogTitle>
							</DialogHeader>
							<input
								autoFocus
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								maxLength={80}
								className="mt-4 w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
							/>
							<DialogFooter className="mt-4">
								<DialogClose asChild>
									<Button type="button" variant="outline">
										Cancel
									</Button>
								</DialogClose>
								<Button type="submit" disabled={isWorking || !draft.trim()}>
									Save
								</Button>
							</DialogFooter>
						</form>
					) : null}

					{activeDialog === 'instructions' ? (
						<>
							<DialogHeader>
								<DialogTitle>Conversation instructions</DialogTitle>
								<DialogDescription>
									Extra context or rules for “{conversation?.title}” only — for
									example the project it is about, or how replies should be
									formatted. Your profile settings still apply.
								</DialogDescription>
							</DialogHeader>
							<textarea
								autoFocus
								value={draft}
								onChange={(event) => setDraft(event.target.value)}
								rows={6}
								maxLength={4000}
								placeholder="e.g. This chat is for planning my Lisbon trip in May. Keep answers short."
								className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
							/>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline">Cancel</Button>
								</DialogClose>
								<Button
									disabled={isWorking || !conversation}
									onClick={() =>
										void runAndClose(async () => {
											if (conversation) {
												await setConversationInstructions(conversation.id, draft)
											}
										})
									}
								>
									Save
								</Button>
							</DialogFooter>
						</>
					) : null}

					{activeDialog === 'delete' ? (
						<>
							<DialogHeader>
								<DialogTitle>Delete this conversation?</DialogTitle>
								<DialogDescription>
									“{conversation?.title}” and its {messageCount} message
									{messageCount === 1 ? '' : 's'} will be permanently deleted. Export
									it first if you want a backup. Memory, documents, and library items
									are not affected.
								</DialogDescription>
							</DialogHeader>
							<DialogFooter>
								<DialogClose asChild>
									<Button variant="outline">Cancel</Button>
								</DialogClose>
								<Button
									variant="destructive"
									disabled={isWorking || !conversation}
									onClick={() =>
										void runAndClose(async () => {
											if (conversation) {
												await deleteConversation(conversation.id)
											}
										})
									}
								>
									{isWorking ? 'Deleting…' : 'Delete conversation'}
								</Button>
							</DialogFooter>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</div>
	)
}
