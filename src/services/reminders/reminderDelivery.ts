import type { ReminderRecord, UserPreferences } from '@/storage/types'
import { getConfiguredAiName } from '@/services/claude/systemInstruction'
import { formatMessageTime } from '@/utils/dateTime'

export function buildReminderAssistantMessage(
	reminder: ReminderRecord,
	preferences: UserPreferences,
): string {
	if (reminder.deliveryMessage?.trim()) {
		return reminder.deliveryMessage.trim()
	}

	const aiName = getConfiguredAiName(preferences)
	const when = formatMessageTime(reminder.scheduledAt)
	const lines = [`⏰ **Reminder** · ${when}`, '', reminder.title]

	if (reminder.note?.trim()) {
		lines.push('', reminder.note.trim())
	}

	lines.push('', `— ${aiName}`)
	return lines.join('\n')
}
