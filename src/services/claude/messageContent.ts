import type Anthropic from '@anthropic-ai/sdk'
import {
	MAX_CHAT_HISTORY_CHARS,
	MAX_MESSAGES_WITH_ATTACHMENTS,
} from '@/services/claude/constants'
import { stripCitationMarkers } from '@/services/claude/webResults'
import type { StoredMessage } from '@/storage/types'
import { formatMessageDateTime } from '@/utils/dateTime'

const CLAUDE_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const

type ClaudeImageType = (typeof CLAUDE_IMAGE_TYPES)[number]

/** Rough per-item weights used only for the history budget. */
const IMAGE_BUDGET_CHARS = 6_000
const PDF_BUDGET_CHARS = 20_000

/** History start moves in steps of this many messages so the cached prefix stays stable between turns. */
const HISTORY_TRIM_STEP = 10

const ARCHIVED_HISTORY_NOTE =
	'[Earlier messages in this conversation were archived into long-term memory.]'

function isClaudeImageType(value: string): value is ClaudeImageType {
	return (CLAUDE_IMAGE_TYPES as readonly string[]).includes(value)
}

function base64FromDataUrl(dataUrl: string): string {
	const commaIndex = dataUrl.indexOf(',')
	return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : ''
}

function estimateMessageChars(message: StoredMessage): number {
	let total = message.content.length
	for (const media of message.media ?? []) {
		if (media.type === 'image') {
			total += IMAGE_BUDGET_CHARS
		}
	}
	for (const attachment of message.attachments ?? []) {
		total += attachment.kind === 'pdf' ? PDF_BUDGET_CHARS : attachment.data.length
	}
	return total
}

/**
 * Drops the oldest messages when the history is over budget. The cut point is
 * a multiple of HISTORY_TRIM_STEP so it only moves occasionally, which keeps
 * prompt-cache hits on the rest of the conversation.
 */
export function trimHistoryToBudget(
	messages: StoredMessage[],
	maxChars: number = MAX_CHAT_HISTORY_CHARS,
): StoredMessage[] {
	const sizes = messages.map(estimateMessageChars)
	let total = sizes.reduce((sum, size) => sum + size, 0)
	let start = 0

	while (total > maxChars && start < messages.length - 1) {
		const nextStart = Math.min(start + HISTORY_TRIM_STEP, messages.length - 1)
		for (let index = start; index < nextStart; index += 1) {
			total -= sizes[index] ?? 0
		}
		start = nextStart
	}

	return messages.slice(start)
}

function attachmentLabel(message: StoredMessage): string[] {
	const labels: string[] = []
	for (const [index, media] of (message.media ?? []).entries()) {
		if (media.type === 'image') {
			labels.push(`image ${index + 1}`)
		}
	}
	for (const attachment of message.attachments ?? []) {
		labels.push(attachment.name)
	}
	return labels
}

function buildUserContent(
	message: StoredMessage,
	includeAttachments: boolean,
): Anthropic.ContentBlockParam[] {
	const blocks: Anthropic.ContentBlockParam[] = []
	const notes: string[] = []

	if (includeAttachments) {
		for (const media of message.media ?? []) {
			if (media.type !== 'image' || !isClaudeImageType(media.mimeType)) {
				continue
			}
			const data = base64FromDataUrl(media.dataUrl)
			if (data) {
				blocks.push({
					type: 'image',
					source: { type: 'base64', media_type: media.mimeType, data },
				})
			}
		}

		for (const attachment of message.attachments ?? []) {
			if (attachment.kind === 'pdf') {
				blocks.push({
					type: 'document',
					title: attachment.name,
					source: { type: 'base64', media_type: 'application/pdf', data: attachment.data },
				})
			} else if (attachment.data.trim()) {
				blocks.push({
					type: 'document',
					title: attachment.name,
					source: { type: 'text', media_type: 'text/plain', data: attachment.data },
				})
			}
		}
	} else {
		const labels = attachmentLabel(message)
		if (labels.length > 0) {
			notes.push(
				`[Attachments sent earlier (${labels.join(', ')}) are no longer included. Ask the user to re-attach them if you need them again.]`,
			)
		}
	}

	const text = [`[Sent ${formatMessageDateTime(message.createdAt)}]`, ...notes, message.content.trim()]
		.filter(Boolean)
		.join('\n')
	blocks.push({ type: 'text', text })
	return blocks
}

/** Converts stored chat history into Claude message params (text-only replay for assistant turns). */
export function buildClaudeMessages(
	history: StoredMessage[],
): Anthropic.MessageParam[] {
	const trimmed = trimHistoryToBudget(history)
	const params: Anthropic.MessageParam[] = []

	let userMessagesSeen = 0
	const attachmentCutoff = new Set<string>()
	for (let index = trimmed.length - 1; index >= 0; index -= 1) {
		const message = trimmed[index]!
		if (message.role !== 'user') {
			continue
		}
		if (userMessagesSeen < MAX_MESSAGES_WITH_ATTACHMENTS) {
			attachmentCutoff.add(message.id)
		}
		userMessagesSeen += 1
	}

	for (const message of trimmed) {
		if (message.role === 'user') {
			params.push({
				role: 'user',
				content: buildUserContent(message, attachmentCutoff.has(message.id)),
			})
			continue
		}

		const text = stripCitationMarkers(message.content).trim()
		if (!text) {
			continue
		}
		params.push({ role: 'assistant', content: text })
	}

	if (params[0]?.role === 'assistant') {
		params.unshift({ role: 'user', content: ARCHIVED_HISTORY_NOTE })
	}

	return params
}
