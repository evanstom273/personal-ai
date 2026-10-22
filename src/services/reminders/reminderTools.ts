import type Anthropic from '@anthropic-ai/sdk'
import {
	buildReminderCreateInputFromToolArgs,
	createReminder,
	deleteReminder,
	listReminders,
	resolveReminderRef,
	updateReminder,
} from '@/services/reminders/reminderService'
import {
	parseReminderRecurrence,
	parseScheduledAtIso,
} from '@/services/reminders/reminderRecurrence'

export interface ReminderToolResult {
	name: string
	response: Record<string, unknown>
}

export const REMINDER_TOOL_DECLARATIONS = [
	{
		name: 'list_reminders',
		description:
			'List reminders and scheduled items stored in the app. Optionally filter by title search.',
		input_schema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Optional case-insensitive title search filter.',
				},
				include_disabled: {
					type: 'boolean',
					description: 'When true, include disabled or completed one-shot reminders.',
				},
			},
		},
	},
	{
		name: 'create_reminder',
		description:
			'Create a reminder or scheduled notification. Use the current date and time from system instructions to pick a valid future scheduled_at_iso.',
		input_schema: {
			type: 'object',
			properties: {
				title: { type: 'string', description: 'Short reminder title.' },
				scheduled_at_iso: {
					type: 'string',
					description:
						'When the reminder should fire, as ISO 8601 (e.g. 2026-08-11T09:00:00). Use local time unless an offset is required.',
				},
				recurrence: {
					type: 'string',
					description: 'One of: none, daily, weekly, monthly, yearly.',
				},
				note: {
					type: 'string',
					description: 'Optional extra context shown with the reminder.',
				},
				delivery_message: {
					type: 'string',
					description:
						'Optional assistant chat message to send when the reminder fires. Write it in your voice.',
				},
			},
			required: ['title', 'scheduled_at_iso'],
		},
	},
	{
		name: 'update_reminder',
		description: 'Update an existing reminder by id or title.',
		input_schema: {
			type: 'object',
			properties: {
				reminder_id: { type: 'string' },
				title: { type: 'string', description: 'Current title if id is unknown.' },
				new_title: { type: 'string' },
				scheduled_at_iso: { type: 'string' },
				recurrence: { type: 'string' },
				note: { type: 'string' },
				delivery_message: { type: 'string' },
				enabled: { type: 'boolean' },
			},
		},
	},
	{
		name: 'delete_reminder',
		description: 'Delete a reminder by id or title.',
		input_schema: {
			type: 'object',
			properties: {
				reminder_id: { type: 'string' },
				title: { type: 'string', description: 'Exact or partial title if id is unknown.' },
			},
		},
	},
] satisfies Anthropic.Tool[]

export async function executeReminderToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<ReminderToolResult> {
	switch (name) {
		case 'list_reminders': {
			const query = typeof args.query === 'string' ? args.query : undefined
			const includeDisabled = args.include_disabled === true
			const reminders = await listReminders(query)
			const filtered = includeDisabled
				? reminders
				: reminders.filter((reminder) => reminder.enabled)

			return {
				name,
				response: {
					reminders: filtered.map((reminder) => ({
						id: reminder.id,
						title: reminder.title,
						scheduledAt: reminder.scheduledAt,
						recurrence: reminder.recurrence,
						enabled: reminder.enabled,
						note: reminder.note,
					})),
				},
			}
		}
		case 'create_reminder': {
			const parsed = buildReminderCreateInputFromToolArgs(args)
			if ('error' in parsed) {
				return { name, response: { error: parsed.error } }
			}

			const reminder = await createReminder({
				...parsed,
				source: 'assistant',
			})

			return {
				name,
				response: {
					id: reminder.id,
					title: reminder.title,
					scheduledAt: reminder.scheduledAt,
					recurrence: reminder.recurrence,
					enabled: reminder.enabled,
				},
			}
		}
		case 'update_reminder': {
			const reminder = await resolveReminderRef({
				reminderId:
					typeof args.reminder_id === 'string' ? args.reminder_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!reminder) {
				return { name, response: { error: 'Reminder not found.' } }
			}

			const recurrence = parseReminderRecurrence(args.recurrence)
			const scheduledAt = parseScheduledAtIso(args.scheduled_at_iso)

			const updated = await updateReminder(reminder.id, {
				title:
					typeof args.new_title === 'string' ? args.new_title : undefined,
				note: typeof args.note === 'string' ? args.note : undefined,
				deliveryMessage:
					typeof args.delivery_message === 'string'
						? args.delivery_message
						: undefined,
				scheduledAt: scheduledAt ?? undefined,
				recurrence: recurrence ?? undefined,
				enabled: typeof args.enabled === 'boolean' ? args.enabled : undefined,
			})

			return {
				name,
				response: {
					id: updated?.id,
					title: updated?.title,
					scheduledAt: updated?.scheduledAt,
					recurrence: updated?.recurrence,
					enabled: updated?.enabled,
				},
			}
		}
		case 'delete_reminder': {
			const reminder = await resolveReminderRef({
				reminderId:
					typeof args.reminder_id === 'string' ? args.reminder_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!reminder) {
				return { name, response: { error: 'Reminder not found.' } }
			}

			await deleteReminder(reminder.id)
			return {
				name,
				response: {
					status: 'deleted',
					id: reminder.id,
					title: reminder.title,
				},
			}
		}
		default:
			return { name, response: { error: `Unknown reminder tool: ${name}` } }
	}
}

export function isReminderToolName(name: string): boolean {
	return (
		name === 'list_reminders' ||
		name === 'create_reminder' ||
		name === 'update_reminder' ||
		name === 'delete_reminder'
	)
}

