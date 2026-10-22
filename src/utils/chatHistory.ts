import type { StoredMessage } from '@/storage/types'
import { MAX_CHAT_HISTORY_MESSAGES } from '@/services/claude/constants'

export function capMessagesForModelContext(
	messages: StoredMessage[],
	maxMessages: number = MAX_CHAT_HISTORY_MESSAGES,
): StoredMessage[] {
	if (messages.length <= maxMessages) {
		return messages
	}

	return messages.slice(-maxMessages)
}

export function capUnarchivedMessagesForModel(
	messages: StoredMessage[],
	archiveCursor: number,
	maxMessages: number = MAX_CHAT_HISTORY_MESSAGES,
): StoredMessage[] {
	const unarchived = messages.slice(archiveCursor)
	return capMessagesForModelContext(unarchived, maxMessages)
}
