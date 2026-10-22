import { listReminders } from '@/services/reminders/reminderService'
import { formatRecurrenceLabel } from '@/services/reminders/reminderRecurrence'
import { formatMessageTime } from '@/utils/dateTime'

export async function buildScheduleContextFromStore(): Promise<string> {
	const reminders = (await listReminders()).filter((reminder) => reminder.enabled)

	if (reminders.length === 0) {
		return [
			'## Reminders & schedule',
			'',
			'No active reminders yet. Use reminder tools to create one, or the user can add them in Library → Schedule.',
			'When a reminder fires, the app posts an assistant chat message and sends a notification.',
		].join('\n')
	}

	const lines = reminders.slice(0, 40).map((reminder) => {
		const parts = [
			`- ${reminder.title}`,
			`  id: ${reminder.id}`,
			`  when: ${formatMessageTime(reminder.scheduledAt)}`,
			`  recurrence: ${formatRecurrenceLabel(reminder.recurrence)}`,
		]
		if (reminder.note) {
			parts.push(`  note: ${reminder.note}`)
		}
		return parts.join('\n')
	})

	const omitted =
		reminders.length > 40
			? `\n_${reminders.length - 40} additional reminder(s) omitted._`
			: ''

	return [
		'## Reminders & schedule (always in context)',
		'',
		'Active reminders stored in the app. Use reminder tools to list, create, update, or delete them.',
		'Use the current date and time above when scheduling. Prefer ISO 8601 datetimes for scheduled_at_iso.',
		'',
		lines.join('\n'),
		omitted,
	].join('\n')
}
