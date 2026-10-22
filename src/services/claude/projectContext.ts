import { listProjects } from '@/services/projects/projectService'
import type { ProjectRecord } from '@/storage/types'

const MAX_TOTAL_PROJECT_CONTEXT_CHARS = 12_000

function formatTaskLine(task: ProjectRecord['tasks'][number]): string {
	const checklist =
		task.checklist.length > 0
			? ` | checklist: ${task.checklist
					.map((item) => `${item.checked ? '[x]' : '[ ]'} ${item.label}`)
					.join('; ')}`
			: ''
	const docs =
		task.documentIds.length > 0
			? ` | docs: ${task.documentIds.join(', ')}`
			: ''
	const reminder = task.reminderId ? ` | reminder: ${task.reminderId}` : ''

	return `- [${task.status}] ${task.title} (id: ${task.id})${task.note ? ` — ${task.note}` : ''}${checklist}${docs}${reminder}`
}

function formatProjectForContext(project: ProjectRecord): string {
	const linkedDocs =
		project.documentIds.length > 0
			? `\n- linked documents: ${project.documentIds.join(', ')}`
			: ''

	const tasksByStatus = {
		todo: project.tasks.filter((task) => task.status === 'todo'),
		doing: project.tasks.filter((task) => task.status === 'doing'),
		done: project.tasks.filter((task) => task.status === 'done'),
	}

	const taskSections = (['todo', 'doing', 'done'] as const)
		.map((status) => {
			const tasks = tasksByStatus[status]
			if (tasks.length === 0) {
				return `#### ${status}\n(none)`
			}

			if (status === 'done') {
				// Finished work only needs titles; get_project returns full detail.
				return `#### done\n${tasks.map((task) => `- ${task.title} (id: ${task.id})`).join('\n')}`
			}

			return `#### ${status}\n${tasks.map(formatTaskLine).join('\n')}`
		})
		.join('\n\n')

	return [
		`### ${project.title}`,
		`- id: ${project.id}`,
		project.description ? `- description: ${project.description}` : null,
		linkedDocs || null,
		'',
		taskSections,
	]
		.filter((line) => line !== null)
		.join('\n')
}

export function buildProjectLibraryContext(projects: ProjectRecord[]): string {
	if (projects.length === 0) {
		return [
			'## Projects (always in context)',
			'',
			'No projects yet. Use project tools to create a kanban board with todo, doing, and done columns.',
		].join('\n')
	}

	const sections: string[] = []
	let totalChars = 0
	let omittedCount = 0

	for (const project of projects) {
		const section = formatProjectForContext(project)
		if (totalChars + section.length > MAX_TOTAL_PROJECT_CONTEXT_CHARS) {
			omittedCount += 1
			continue
		}

		sections.push(section)
		totalChars += section.length
	}

	const omittedNote =
		omittedCount > 0
			? `\n\n_${omittedCount} additional project${omittedCount === 1 ? '' : 's'} omitted due to context size limits. Use list_projects for the full list._`
			: ''

	return [
		'## Projects (always in context)',
		'',
		'Kanban projects are separate from documents. Tasks can link to documents and reminders. Done tasks stay visible in the done column.',
		'',
		sections.join('\n\n---\n\n'),
		omittedNote,
	].join('\n')
}

export async function buildProjectContextFromStore(): Promise<string> {
	const projects = await listProjects()
	return buildProjectLibraryContext(projects)
}
