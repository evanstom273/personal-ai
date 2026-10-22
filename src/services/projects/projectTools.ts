import type Anthropic from '@anthropic-ai/sdk'
import {
	createProject,
	createTask,
	deleteProject,
	deleteTask,
	listProjects,
	moveTask,
	parseChecklistItems,
	parseProjectTaskStatus,
	resolveProjectRef,
	resolveTaskRef,
	updateProject,
	updateTask,
} from '@/services/projects/projectService'

export interface ProjectToolResult {
	name: string
	response: Record<string, unknown>
}

export const PROJECT_TOOL_DECLARATIONS = [
	{
		name: 'list_projects',
		description:
			'List kanban projects stored in the app. Each project has todo, doing, and done columns.',
		input_schema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Optional case-insensitive title search filter.',
				},
			},
		},
	},
	{
		name: 'get_project',
		description: 'Get a project with all tasks by id or title.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				title: { type: 'string' },
			},
		},
	},
	{
		name: 'create_project',
		description:
			'Create a new kanban project. Optionally include initial tasks and linked document ids.',
		input_schema: {
			type: 'object',
			properties: {
				title: { type: 'string' },
				description: { type: 'string' },
				document_ids: {
					type: 'array',
					items: { type: 'string' },
					description: 'Optional linked document ids from the document library.',
				},
				tasks: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							title: { type: 'string' },
							note: { type: 'string' },
							status: {
								type: 'string',
								description: 'One of: todo, doing, done.',
							},
							checklist: {
								type: 'array',
								items: { type: 'string' },
							},
							document_ids: {
								type: 'array',
								items: { type: 'string' },
							},
						},
					},
				},
			},
			required: ['title'],
		},
	},
	{
		name: 'update_project',
		description: 'Update a project title, description, or linked documents.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				title: { type: 'string', description: 'Current title if id is unknown.' },
				new_title: { type: 'string' },
				description: { type: 'string' },
				document_ids: {
					type: 'array',
					items: { type: 'string' },
				},
			},
		},
	},
	{
		name: 'delete_project',
		description: 'Delete a project and all of its tasks.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				title: { type: 'string' },
			},
		},
	},
	{
		name: 'create_task',
		description: 'Add a task card to a project column.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				project_title: { type: 'string' },
				title: { type: 'string' },
				note: { type: 'string' },
				status: { type: 'string', description: 'One of: todo, doing, done.' },
				checklist: {
					type: 'array',
					items: { type: 'string' },
				},
				document_ids: {
					type: 'array',
					items: { type: 'string' },
				},
				reminder_id: {
					type: 'string',
					description: 'Optional reminder id to link to this task.',
				},
			},
			required: ['title'],
		},
	},
	{
		name: 'update_task',
		description: 'Update a task card, checklist, links, or reminder.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				project_title: { type: 'string' },
				task_id: { type: 'string' },
				task_title: { type: 'string' },
				new_title: { type: 'string' },
				note: { type: 'string' },
				status: { type: 'string' },
				checklist: {
					type: 'array',
					items: {
						type: 'object',
						properties: {
							label: { type: 'string' },
							checked: { type: 'boolean' },
						},
					},
				},
				document_ids: {
					type: 'array',
					items: { type: 'string' },
				},
				reminder_id: { type: 'string' },
			},
		},
	},
	{
		name: 'move_task',
		description: 'Move a task between todo, doing, and done columns.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				project_title: { type: 'string' },
				task_id: { type: 'string' },
				task_title: { type: 'string' },
				status: { type: 'string', description: 'One of: todo, doing, done.' },
			},
			required: ['status'],
		},
	},
	{
		name: 'delete_task',
		description: 'Delete a task from a project.',
		input_schema: {
			type: 'object',
			properties: {
				project_id: { type: 'string' },
				project_title: { type: 'string' },
				task_id: { type: 'string' },
				task_title: { type: 'string' },
			},
		},
	},
] satisfies Anthropic.Tool[]

function serializeProject(project: Awaited<ReturnType<typeof listProjects>>[number]) {
	return {
		id: project.id,
		title: project.title,
		description: project.description,
		documentIds: project.documentIds,
		tasks: project.tasks.map((task) => ({
			id: task.id,
			title: task.title,
			note: task.note,
			status: task.status,
			position: task.position,
			checklist: task.checklist,
			documentIds: task.documentIds,
			reminderId: task.reminderId,
		})),
	}
}

export async function executeProjectToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<ProjectToolResult> {
	switch (name) {
		case 'list_projects': {
			const query = typeof args.query === 'string' ? args.query : undefined
			const projects = await listProjects(query)
			return {
				name,
				response: {
					projects: projects.map(serializeProject),
				},
			}
		}
		case 'get_project': {
			const project = await resolveProjectRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!project) {
				return { name, response: { error: 'Project not found.' } }
			}

			return {
				name,
				response: serializeProject(project),
			}
		}
		case 'create_project': {
			const title = typeof args.title === 'string' ? args.title.trim() : ''
			if (!title) {
				return { name, response: { error: 'title is required.' } }
			}

			const documentIds = Array.isArray(args.document_ids)
				? args.document_ids.filter((id): id is string => typeof id === 'string')
				: undefined

			const project = await createProject({
				title,
				description:
					typeof args.description === 'string' ? args.description : undefined,
				documentIds,
				source: 'assistant',
			})

			if (Array.isArray(args.tasks)) {
				for (const item of args.tasks) {
					if (typeof item !== 'object' || item === null) {
						continue
					}

					const record = item as Record<string, unknown>
					const taskTitle =
						typeof record.title === 'string' ? record.title.trim() : ''
					if (!taskTitle) {
						continue
					}

					await createTask(project.id, {
						title: taskTitle,
						note: typeof record.note === 'string' ? record.note : undefined,
						status: parseProjectTaskStatus(record.status) ?? 'todo',
						checklist: parseChecklistItems(record.checklist),
						documentIds: Array.isArray(record.document_ids)
							? record.document_ids.filter(
									(id): id is string => typeof id === 'string',
								)
							: undefined,
					})
				}
			}

			const created = await resolveProjectRef({ projectId: project.id })
			return {
				name,
				response: created ? serializeProject(created) : { id: project.id, title },
			}
		}
		case 'update_project': {
			const project = await resolveProjectRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!project) {
				return { name, response: { error: 'Project not found.' } }
			}

			const updated = await updateProject(project.id, {
				title:
					typeof args.new_title === 'string' ? args.new_title : undefined,
				description:
					typeof args.description === 'string' ? args.description : undefined,
				documentIds: Array.isArray(args.document_ids)
					? args.document_ids.filter((id): id is string => typeof id === 'string')
					: undefined,
			})

			return {
				name,
				response: updated ? serializeProject(updated) : { error: 'Update failed.' },
			}
		}
		case 'delete_project': {
			const project = await resolveProjectRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!project) {
				return { name, response: { error: 'Project not found.' } }
			}

			await deleteProject(project.id)
			return {
				name,
				response: { status: 'deleted', id: project.id, title: project.title },
			}
		}
		case 'create_task': {
			const project = await resolveProjectRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				title:
					typeof args.project_title === 'string' ? args.project_title : undefined,
			})

			if (!project) {
				return { name, response: { error: 'Project not found.' } }
			}

			const title = typeof args.title === 'string' ? args.title.trim() : ''
			if (!title) {
				return { name, response: { error: 'title is required.' } }
			}

			const task = await createTask(project.id, {
				title,
				note: typeof args.note === 'string' ? args.note : undefined,
				status: parseProjectTaskStatus(args.status) ?? 'todo',
				checklist: parseChecklistItems(args.checklist),
				documentIds: Array.isArray(args.document_ids)
					? args.document_ids.filter((id): id is string => typeof id === 'string')
					: undefined,
				reminderId:
					typeof args.reminder_id === 'string' ? args.reminder_id : undefined,
			})

			return {
				name,
				response: task
					? {
							id: task.id,
							title: task.title,
							status: task.status,
						}
					: { error: 'Could not create task.' },
			}
		}
		case 'update_task': {
			const resolved = await resolveTaskRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				projectTitle:
					typeof args.project_title === 'string' ? args.project_title : undefined,
				taskId: typeof args.task_id === 'string' ? args.task_id : undefined,
				taskTitle: typeof args.task_title === 'string' ? args.task_title : undefined,
			})

			if (!resolved) {
				return { name, response: { error: 'Task not found.' } }
			}

			const updated = await updateTask(resolved.project.id, resolved.task.id, {
				title:
					typeof args.new_title === 'string' ? args.new_title : undefined,
				note: typeof args.note === 'string' ? args.note : undefined,
				status: parseProjectTaskStatus(args.status) ?? undefined,
				checklist:
					args.checklist !== undefined
						? parseChecklistItems(args.checklist).map((item) => ({
								id: crypto.randomUUID(),
								label: item.label,
								checked: item.checked ?? false,
							}))
						: undefined,
				documentIds: Array.isArray(args.document_ids)
					? args.document_ids.filter((id): id is string => typeof id === 'string')
					: undefined,
				reminderId:
					typeof args.reminder_id === 'string' ? args.reminder_id : undefined,
			})

			return {
				name,
				response: updated
					? {
							id: updated.id,
							title: updated.title,
							status: updated.status,
						}
					: { error: 'Update failed.' },
			}
		}
		case 'move_task': {
			const status = parseProjectTaskStatus(args.status)
			if (!status) {
				return {
					name,
					response: { error: 'status must be one of: todo, doing, done.' },
				}
			}

			const resolved = await resolveTaskRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				projectTitle:
					typeof args.project_title === 'string' ? args.project_title : undefined,
				taskId: typeof args.task_id === 'string' ? args.task_id : undefined,
				taskTitle: typeof args.task_title === 'string' ? args.task_title : undefined,
			})

			if (!resolved) {
				return { name, response: { error: 'Task not found.' } }
			}

			const moved = await moveTask(resolved.project.id, resolved.task.id, status)
			return {
				name,
				response: moved
					? {
							id: moved.id,
							title: moved.title,
							status: moved.status,
						}
					: { error: 'Move failed.' },
			}
		}
		case 'delete_task': {
			const resolved = await resolveTaskRef({
				projectId:
					typeof args.project_id === 'string' ? args.project_id : undefined,
				projectTitle:
					typeof args.project_title === 'string' ? args.project_title : undefined,
				taskId: typeof args.task_id === 'string' ? args.task_id : undefined,
				taskTitle: typeof args.task_title === 'string' ? args.task_title : undefined,
			})

			if (!resolved) {
				return { name, response: { error: 'Task not found.' } }
			}

			await deleteTask(resolved.project.id, resolved.task.id)
			return {
				name,
				response: {
					status: 'deleted',
					id: resolved.task.id,
					title: resolved.task.title,
				},
			}
		}
		default:
			return { name, response: { error: `Unknown project tool: ${name}` } }
	}
}

export function isProjectToolName(name: string): boolean {
	return PROJECT_TOOL_DECLARATIONS.some((tool) => tool.name === name)
}
