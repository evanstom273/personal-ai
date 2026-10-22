import { zipSync, unzipSync } from 'fflate'
import { MAIN_CONVERSATION_ID } from '@/services/claude/constants'
import type { ConversationRecord, MessageMedia, StoredMessage } from '@/storage/types'
import { buildDownloadFilename, downloadBlob, extensionForMimeType } from '@/utils/downloads'

export const CHAT_EXPORT_VERSION = 3
export const CHAT_EXPORT_JSON_NAME = 'chat.json'
export const CHAT_EXPORT_MEDIA_DIR = 'media'

export interface ChatExportMediaAsset {
	type: MessageMedia['type']
	mimeType: string
	dataUrl: string
}

export interface ChatExportMediaRef {
	type: MessageMedia['type']
	mimeType: string
	mediaId: string
}

export interface ChatExportMediaFileRef {
	type: MessageMedia['type']
	mimeType: string
	file: string
}

export interface ChatExportMessage extends Omit<StoredMessage, 'media'> {
	media?: ChatExportMediaRef[]
}

export interface ChatExportZipMessage extends Omit<StoredMessage, 'media'> {
	media?: ChatExportMediaFileRef[]
}

export interface ChatExportConversation
	extends Omit<ConversationRecord, 'messages'> {
	messages: ChatExportMessage[]
}

export interface ChatExportZipConversation
	extends Omit<ConversationRecord, 'messages'> {
	messages: ChatExportZipMessage[]
}

export interface ChatExportFile {
	version: number
	exportedAt: number
	media?: Record<string, ChatExportMediaAsset>
	conversation: ChatExportConversation
}

export interface ChatExportZipFile {
	version: typeof CHAT_EXPORT_VERSION
	exportedAt: number
	conversation: ChatExportZipConversation
}

function isStoredMessage(value: unknown): value is StoredMessage {
	if (!value || typeof value !== 'object') {
		return false
	}

	const message = value as StoredMessage
	return (
		typeof message.id === 'string' &&
		(message.role === 'user' || message.role === 'assistant') &&
		typeof message.content === 'string' &&
		typeof message.createdAt === 'number'
	)
}

function isMessageMedia(value: unknown): value is MessageMedia {
	if (!value || typeof value !== 'object') {
		return false
	}

	const media = value as MessageMedia
	return (
		(media.type === 'image' || media.type === 'audio') &&
		typeof media.mimeType === 'string' &&
		typeof media.dataUrl === 'string'
	)
}

function isChatExportMediaRef(value: unknown): value is ChatExportMediaRef {
	if (!value || typeof value !== 'object') {
		return false
	}

	const ref = value as ChatExportMediaRef
	return (
		(ref.type === 'image' || ref.type === 'audio') &&
		typeof ref.mimeType === 'string' &&
		typeof ref.mediaId === 'string'
	)
}

function isChatExportMediaFileRef(value: unknown): value is ChatExportMediaFileRef {
	if (!value || typeof value !== 'object') {
		return false
	}

	const ref = value as ChatExportMediaFileRef
	return (
		(ref.type === 'image' || ref.type === 'audio') &&
		typeof ref.mimeType === 'string' &&
		typeof ref.file === 'string'
	)
}

function isChatExportMessage(value: unknown): value is ChatExportMessage {
	if (!isStoredMessage(value)) {
		return false
	}

	const message = value as ChatExportMessage
	if (message.media === undefined) {
		return true
	}

	if (!Array.isArray(message.media)) {
		return false
	}

	return message.media.every(isChatExportMediaRef)
}

function isChatExportZipMessage(value: unknown): value is ChatExportZipMessage {
	if (!isStoredMessage(value)) {
		return false
	}

	const message = value as ChatExportZipMessage
	if (message.media === undefined) {
		return true
	}

	if (!Array.isArray(message.media)) {
		return false
	}

	return message.media.every(isChatExportMediaFileRef)
}

function isChatExportConversation(value: unknown): value is ChatExportConversation {
	if (!value || typeof value !== 'object') {
		return false
	}

	const conversation = value as ChatExportConversation
	return (
		typeof conversation.id === 'string' &&
		typeof conversation.title === 'string' &&
		typeof conversation.modelId === 'string' &&
		Array.isArray(conversation.messages) &&
		conversation.messages.every(isChatExportMessage) &&
		typeof conversation.createdAt === 'number' &&
		typeof conversation.updatedAt === 'number'
	)
}

function isChatExportZipConversation(
	value: unknown,
): value is ChatExportZipConversation {
	if (!value || typeof value !== 'object') {
		return false
	}

	const conversation = value as ChatExportZipConversation
	return (
		typeof conversation.id === 'string' &&
		typeof conversation.title === 'string' &&
		typeof conversation.modelId === 'string' &&
		Array.isArray(conversation.messages) &&
		conversation.messages.every(isChatExportZipMessage) &&
		typeof conversation.createdAt === 'number' &&
		typeof conversation.updatedAt === 'number'
	)
}

function isConversationRecord(value: unknown): value is ConversationRecord {
	if (!value || typeof value !== 'object') {
		return false
	}

	const conversation = value as ConversationRecord
	return (
		typeof conversation.id === 'string' &&
		typeof conversation.title === 'string' &&
		typeof conversation.modelId === 'string' &&
		Array.isArray(conversation.messages) &&
		conversation.messages.every(isStoredMessage) &&
		typeof conversation.createdAt === 'number' &&
		typeof conversation.updatedAt === 'number'
	)
}

function isLegacyExportFile(
	payload: Partial<ChatExportFile>,
): payload is ChatExportFile & { conversation: ConversationRecord } {
	return (
		payload.version === 1 &&
		isConversationRecord(payload.conversation) &&
		payload.conversation.messages.some((message) =>
			message.media?.some((item) => isMessageMedia(item)),
		)
	)
}

function isChatExportZipFile(value: unknown): value is ChatExportZipFile {
	if (!value || typeof value !== 'object') {
		return false
	}

	const payload = value as Partial<ChatExportZipFile>
	return (
		payload.version === CHAT_EXPORT_VERSION &&
		typeof payload.exportedAt === 'number' &&
		isChatExportZipConversation(payload.conversation)
	)
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } {
	const match = dataUrl.match(/^data:([^;,]+)?(?:;[^;,]+)*;base64,(.+)$/s)
	if (!match) {
		throw new Error('Invalid chat file: media data URL is malformed.')
	}

	const mimeType = match[1] || 'application/octet-stream'
	const binary = atob(match[2])
	const bytes = new Uint8Array(binary.length)
	for (let index = 0; index < binary.length; index += 1) {
		bytes[index] = binary.charCodeAt(index)
	}

	return { mimeType, bytes }
}

function bytesToDataUrl(bytes: Uint8Array, mimeType: string): string {
	let binary = ''
	for (let index = 0; index < bytes.length; index += 1) {
		binary += String.fromCharCode(bytes[index]!)
	}

	return `data:${mimeType};base64,${btoa(binary)}`
}

function buildExportZipBundle(conversation: ConversationRecord): {
	exportFile: ChatExportZipFile
	files: Record<string, Uint8Array>
} {
	const exportedAt = Date.now()
	const mediaFiles: Record<string, Uint8Array> = {}
	const dataUrlToFile = new Map<string, string>()

	const messages = conversation.messages.map((message) => {
		if (!message.media?.length) {
			return message as ChatExportZipMessage
		}

		const mediaRefs = message.media.map((item) => {
			let filePath = dataUrlToFile.get(item.dataUrl)
			if (!filePath) {
				const mediaId = crypto.randomUUID()
				const extension = extensionForMimeType(item.mimeType)
				filePath = `${CHAT_EXPORT_MEDIA_DIR}/${mediaId}.${extension}`
				dataUrlToFile.set(item.dataUrl, filePath)
				mediaFiles[filePath] = parseDataUrl(item.dataUrl).bytes
			}

			return {
				type: item.type,
				mimeType: item.mimeType,
				file: filePath,
			}
		})

		return {
			...message,
			media: mediaRefs,
		}
	})

	return {
		exportFile: {
			version: CHAT_EXPORT_VERSION,
			exportedAt,
			conversation: {
				...conversation,
				messages,
			},
		},
		files: mediaFiles,
	}
}

function rehydrateExportMessage(
	message: ChatExportMessage,
	media: Record<string, ChatExportMediaAsset>,
): StoredMessage {
	if (!message.media?.length) {
		const { media: _mediaRefs, ...rest } = message
		return rest
	}

	return {
		...message,
		media: message.media.map((ref) => {
			const asset = media[ref.mediaId]
			if (!asset) {
				throw new Error(
					`Invalid chat file: missing media asset "${ref.mediaId}".`,
				)
			}

			return {
				type: ref.type,
				mimeType: ref.mimeType || asset.mimeType,
				dataUrl: asset.dataUrl,
			}
		}),
	}
}

function rehydrateZipExportMessage(
	message: ChatExportZipMessage,
	files: Record<string, Uint8Array>,
): StoredMessage {
	if (!message.media?.length) {
		const { media: _mediaRefs, ...rest } = message
		return rest
	}

	return {
		...message,
		media: message.media.map((ref) => {
			const bytes = files[ref.file]
			if (!bytes) {
				throw new Error(`Invalid chat file: missing media file "${ref.file}".`)
			}

			return {
				type: ref.type,
				mimeType: ref.mimeType,
				dataUrl: bytesToDataUrl(bytes, ref.mimeType),
			}
		}),
	}
}

export function createChatExportFile(
	conversation: ConversationRecord,
): ChatExportZipFile {
	return buildExportZipBundle(conversation).exportFile
}

export function createChatExportZip(conversation: ConversationRecord): Uint8Array {
	const { exportFile, files } = buildExportZipBundle(conversation)
	const zipEntries: Record<string, Uint8Array> = {
		[CHAT_EXPORT_JSON_NAME]: new TextEncoder().encode(
			JSON.stringify(exportFile, null, 2),
		),
		...files,
	}

	return zipSync(zipEntries)
}

export function parseChatImportFile(raw: unknown): ConversationRecord {
	if (!raw || typeof raw !== 'object') {
		throw new Error('Invalid chat file: expected a JSON object.')
	}

	const payload = raw as Partial<ChatExportFile> & Partial<ConversationRecord>

	if (isChatExportZipFile(payload)) {
		throw new Error(
			'Invalid chat file: zip exports must be imported from a .zip file.',
		)
	}

	if (isLegacyExportFile(payload)) {
		return normalizeImportedConversation(payload.conversation)
	}

	if (payload.conversation && isChatExportConversation(payload.conversation)) {
		const media = payload.media ?? {}
		const messages = payload.conversation.messages.map((message) =>
			rehydrateExportMessage(message, media),
		)

		return normalizeImportedConversation({
			...payload.conversation,
			messages,
		})
	}

	if (isConversationRecord(payload.conversation)) {
		return normalizeImportedConversation(payload.conversation)
	}

	if (isConversationRecord(payload)) {
		return normalizeImportedConversation(payload)
	}

	throw new Error('Invalid chat file: missing a conversation export.')
}

export function parseChatImportZip(bytes: Uint8Array): ConversationRecord {
	let archive: Record<string, Uint8Array>
	try {
		archive = unzipSync(bytes)
	} catch {
		throw new Error('Invalid chat file: could not read zip archive.')
	}

	const chatJsonBytes = archive[CHAT_EXPORT_JSON_NAME]
	if (!chatJsonBytes) {
		throw new Error(`Invalid chat file: missing "${CHAT_EXPORT_JSON_NAME}".`)
	}

	let raw: unknown
	try {
		raw = JSON.parse(new TextDecoder().decode(chatJsonBytes))
	} catch {
		throw new Error(`Invalid chat file: "${CHAT_EXPORT_JSON_NAME}" is not valid JSON.`)
	}

	if (!isChatExportZipFile(raw)) {
		throw new Error('Invalid chat file: unsupported zip export format.')
	}

	const messages = raw.conversation.messages.map((message) =>
		rehydrateZipExportMessage(message, archive),
	)

	return normalizeImportedConversation({
		...raw.conversation,
		messages,
	})
}

function normalizeImportedConversation(
	conversation: ConversationRecord,
): ConversationRecord {
	return {
		...conversation,
		id: MAIN_CONVERSATION_ID,
		memoryArchiveCursor:
			typeof conversation.memoryArchiveCursor === 'number' &&
			conversation.memoryArchiveCursor >= 0
				? conversation.memoryArchiveCursor
				: 0,
		updatedAt: Date.now(),
	}
}

export function downloadChatExport(conversation: ConversationRecord): void {
	const exportFile = createChatExportFile(conversation)
	const zipBytes = createChatExportZip(conversation)
	downloadBlob(
		new Blob([zipBytes.slice()], { type: 'application/zip' }),
		buildDownloadFilename('chat-export', 'zip', exportFile.exportedAt),
	)
}

export function isChatExportZipFileName(filename: string): boolean {
	return filename.toLowerCase().endsWith('.zip')
}
