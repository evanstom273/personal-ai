import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { usePreferencesContext } from '@/providers/ChatProvider'
import { useScratchpad } from '@/providers/ScratchpadProvider'
import { createDocument } from '@/services/documents/documentService'
import { createProject, createTask, listProjects } from '@/services/projects/projectService'
import { describeClaudeError } from '@/services/claude/client'
import {
	extractScratchpadTasks,
	organizeScratchpadIntoDocument,
} from '@/services/scratchpad/scratchpadAi'
import type { ProjectRecord } from '@/storage/types'

interface ScratchpadProjectDialogProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	defaultProjectTitle: string
	onConfirm: (projectId: string | null, newProjectTitle: string) => Promise<void>
}

export function ScratchpadProjectDialog({
	open,
	onOpenChange,
	defaultProjectTitle,
	onConfirm,
}: ScratchpadProjectDialogProps) {
	const [projects, setProjects] = useState<ProjectRecord[]>([])
	const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
	const [newProjectTitle, setNewProjectTitle] = useState(defaultProjectTitle)
	const [isSubmitting, setIsSubmitting] = useState(false)

	useEffect(() => {
		if (!open) {
			return
		}

		setNewProjectTitle(defaultProjectTitle)
		setSelectedProjectId(null)
		void listProjects().then(setProjects)
	}, [defaultProjectTitle, open])

	async function handleSubmit(): Promise<void> {
		setIsSubmitting(true)
		try {
			await onConfirm(selectedProjectId, newProjectTitle.trim())
			onOpenChange(false)
		} finally {
			setIsSubmitting(false)
		}
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="w-[min(28rem,calc(100vw-2rem))]">
				<DialogHeader>
					<DialogTitle>Add tasks to project</DialogTitle>
					<DialogDescription>
						Choose an existing project or create a new one for the extracted tasks.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="space-y-2">
						<label className="text-xs font-medium text-muted-foreground">
							New project title
						</label>
						<input
							value={newProjectTitle}
							onChange={(event) => {
								setNewProjectTitle(event.target.value)
								setSelectedProjectId(null)
							}}
							className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
							placeholder="Project name"
						/>
					</div>

					{projects.length > 0 ? (
						<div className="space-y-2">
							<p className="text-xs font-medium text-muted-foreground">
								Or add to existing
							</p>
							<div className="max-h-40 space-y-1 overflow-y-auto">
								{projects.map((project) => (
									<button
										key={project.id}
										type="button"
										onClick={() => {
											setSelectedProjectId(project.id)
											setNewProjectTitle('')
										}}
										className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
											selectedProjectId === project.id
												? 'bg-primary/15 text-primary'
												: 'hover:bg-accent'
										}`}
									>
										{project.title}
									</button>
								))}
							</div>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isSubmitting}
					>
						Cancel
					</Button>
					<Button
						onClick={() => void handleSubmit()}
						disabled={
							isSubmitting ||
							(!selectedProjectId && newProjectTitle.trim().length === 0)
						}
					>
						{isSubmitting ? 'Adding…' : 'Add tasks'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}

export function useScratchpadActions() {
	const navigate = useNavigate()
	const { preferences } = usePreferencesContext()
	const {
		content,
		setContent,
		closeScratchpad,
		setBusy,
		setError,
	} = useScratchpad()
	const [projectDialogOpen, setProjectDialogOpen] = useState(false)
	const [pendingProjectTitle, setPendingProjectTitle] = useState('')
	const pendingTasksRef = useRef<Array<{ title: string; note?: string }>>([])

	function ensureApiKey(): boolean {
		if (!preferences.anthropicApiKey.trim()) {
			setError('Add your Anthropic API key in Settings first.')
			return false
		}
		return true
	}

	async function handleOrganize(): Promise<void> {
		if (!content.trim()) {
			setError('Nothing to organize yet.')
			return
		}
		if (!ensureApiKey()) {
			return
		}

		setBusy(true, 'Organizing…')
		setError(null)
		try {
			const organized = await organizeScratchpadIntoDocument({
				apiKey: preferences.anthropicApiKey,
				preferences,
				rawText: content,
			})
			const document = await createDocument(organized.title, organized.content, {
				source: 'assistant',
				contentFormat: 'markdown',
				readOnly: false,
			})
			setContent('')
			closeScratchpad()
			navigate(`/library/documents/${document.id}`)
		} catch (caught) {
			setError(
				caught instanceof Error ? describeClaudeError(caught) : 'Could not organize scratchpad.',
			)
		} finally {
			setBusy(false, null)
		}
	}

	async function handleConvertToTasks(): Promise<void> {
		if (!content.trim()) {
			setError('Nothing to convert yet.')
			return
		}
		if (!ensureApiKey()) {
			return
		}

		setBusy(true, 'Extracting tasks…')
		setError(null)
		try {
			const extracted = await extractScratchpadTasks({
				apiKey: preferences.anthropicApiKey,
				preferences,
				rawText: content,
			})
			pendingTasksRef.current = extracted.tasks
			setPendingProjectTitle(extracted.projectTitle)
			setProjectDialogOpen(true)
		} catch (caught) {
			setError(
				caught instanceof Error ? describeClaudeError(caught) : 'Could not extract tasks.',
			)
		} finally {
			setBusy(false, null)
		}
	}

	async function handleConfirmProject(
		projectId: string | null,
		newProjectTitle: string,
	): Promise<void> {
		const tasks = pendingTasksRef.current
		if (tasks.length === 0) {
			return
		}

		setBusy(true, 'Creating tasks…')
		try {
			let targetProjectId = projectId
			if (!targetProjectId) {
				const project = await createProject({
					title: newProjectTitle || 'Scratchpad tasks',
					source: 'assistant',
				})
				targetProjectId = project.id
			}

			for (const task of tasks) {
				await createTask(targetProjectId, {
					title: task.title,
					note: task.note,
					status: 'todo',
				})
			}

			setContent('')
			closeScratchpad()
			navigate(`/library/projects/${targetProjectId}`)
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : 'Could not create project tasks.',
			)
		} finally {
			setBusy(false, null)
			pendingTasksRef.current = []
		}
	}

	async function handleSaveDraft(): Promise<void> {
		if (!content.trim()) {
			setError('Nothing to save yet.')
			return
		}

		setBusy(true, 'Saving draft…')
		setError(null)
		try {
			const dateLabel = new Date().toLocaleString(undefined, {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			})
			const document = await createDocument(
				`Scratchpad draft — ${dateLabel}`,
				content,
				{
					source: 'user',
					contentFormat: 'markdown',
					readOnly: false,
				},
			)
			setContent('')
			closeScratchpad()
			navigate(`/library/documents/${document.id}`)
		} catch (caught) {
			setError(
				caught instanceof Error ? caught.message : 'Could not save draft.',
			)
		} finally {
			setBusy(false, null)
		}
	}

	return {
		handleOrganize,
		handleConvertToTasks,
		handleSaveDraft,
		projectDialogOpen,
		setProjectDialogOpen,
		pendingProjectTitle,
		handleConfirmProject,
	}
}
