import type Anthropic from '@anthropic-ai/sdk'
import {
	addHomeTodo,
	clearCompletedHomeTodos,
	getHomeTodoList,
	removeHomeTodo,
	setHomeTodos,
	updateHomeTodo,
} from '@/services/home/homeTodoService'

export interface HomeTodoToolResult {
	name: string
	response: Record<string, unknown>
}

export const HOME_TODO_TOOL_DECLARATIONS = [
	{
		name: 'list_home_todos',
		description:
			'List items on the user Home dashboard todo list (separate from project kanban tasks).',
		input_schema: {
			type: 'object',
			properties: {
				include_checked: {
					type: 'boolean',
					description: 'When false, only return unchecked todos. Defaults to true.',
				},
			},
		},
	},
	{
		name: 'add_home_todo',
		description: 'Add a single item to the Home dashboard todo list.',
		input_schema: {
			type: 'object',
			properties: {
				text: { type: 'string', description: 'Todo item text.' },
			},
			required: ['text'],
		},
	},
	{
		name: 'update_home_todo',
		description:
			'Update a Home todo by id or by matching text. Can change text or checked state.',
		input_schema: {
			type: 'object',
			properties: {
				todo_id: { type: 'string' },
				text: { type: 'string', description: 'Current text if id is unknown.' },
				new_text: { type: 'string' },
				checked: { type: 'boolean' },
			},
		},
	},
	{
		name: 'remove_home_todo',
		description: 'Remove a Home todo by id or matching text.',
		input_schema: {
			type: 'object',
			properties: {
				todo_id: { type: 'string' },
				text: { type: 'string', description: 'Current text if id is unknown.' },
			},
		},
	},
	{
		name: 'set_home_todos',
		description:
			'Replace the entire Home todo list with a new ordered list. Use when the user wants a fresh daily list.',
		input_schema: {
			type: 'object',
			properties: {
				items: {
					type: 'array',
					description: 'Ordered todo items.',
					items: {
						type: 'object',
						properties: {
							text: { type: 'string' },
							checked: { type: 'boolean' },
						},
						required: ['text'],
					},
				},
			},
			required: ['items'],
		},
	},
	{
		name: 'clear_completed_home_todos',
		description: 'Remove checked items from the Home todo list.',
		input_schema: {
			type: 'object',
			properties: {},
		},
	},
] satisfies Anthropic.Tool[]

const HOME_TODO_TOOL_NAMES = new Set<string>(
	HOME_TODO_TOOL_DECLARATIONS.map((declaration) => declaration.name),
)

export function isHomeTodoToolName(name: string): boolean {
	return HOME_TODO_TOOL_NAMES.has(name)
}

function resolveTodoId(
	args: Record<string, unknown>,
	items: Awaited<ReturnType<typeof getHomeTodoList>>['items'],
): string | null {
	const todoId = typeof args.todo_id === 'string' ? args.todo_id.trim() : ''
	if (todoId) {
		return items.some((item) => item.id === todoId) ? todoId : null
	}

	const text = typeof args.text === 'string' ? args.text.trim().toLowerCase() : ''
	if (!text) {
		return null
	}

	const match = items.find((item) => item.text.toLowerCase().includes(text))
	return match?.id ?? null
}

export async function executeHomeTodoToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<HomeTodoToolResult> {
	switch (name) {
		case 'list_home_todos': {
			const state = await getHomeTodoList()
			const includeChecked = args.include_checked !== false
			const items = includeChecked
				? state.items
				: state.items.filter((item) => !item.checked)
			return {
				name,
				response: {
					ok: true,
					items: items.map((item) => ({
						id: item.id,
						text: item.text,
						checked: item.checked,
						position: item.position,
					})),
					daily_review_reminder_id: state.dailyReviewReminderId ?? null,
				},
			}
		}
		case 'add_home_todo': {
			const text = typeof args.text === 'string' ? args.text : ''
			const state = await addHomeTodo(text)
			return { name, response: { ok: true, item_count: state.items.length } }
		}
		case 'update_home_todo': {
			const state = await getHomeTodoList()
			const id = resolveTodoId(args, state.items)
			if (!id) {
				return { name, response: { ok: false, error: 'Todo not found.' } }
			}
			const next = await updateHomeTodo(id, {
				text: typeof args.new_text === 'string' ? args.new_text : undefined,
				checked: typeof args.checked === 'boolean' ? args.checked : undefined,
			})
			return { name, response: { ok: true, item_count: next.items.length } }
		}
		case 'remove_home_todo': {
			const state = await getHomeTodoList()
			const id = resolveTodoId(args, state.items)
			if (!id) {
				return { name, response: { ok: false, error: 'Todo not found.' } }
			}
			const next = await removeHomeTodo(id)
			return { name, response: { ok: true, item_count: next.items.length } }
		}
		case 'set_home_todos': {
			const rawItems = Array.isArray(args.items) ? args.items : []
			const items = rawItems
				.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
				.map((item) => ({
					text: typeof item.text === 'string' ? item.text : '',
					checked: typeof item.checked === 'boolean' ? item.checked : false,
				}))
			const next = await setHomeTodos(items)
			return { name, response: { ok: true, item_count: next.items.length } }
		}
		case 'clear_completed_home_todos': {
			const next = await clearCompletedHomeTodos()
			return { name, response: { ok: true, item_count: next.items.length } }
		}
		default:
			return { name, response: { ok: false, error: `Unknown home todo tool: ${name}` } }
	}
}
