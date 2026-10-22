import { useCallback, useEffect, useRef, useState } from 'react'
import { CLAUDE_MODEL_ID, MAIN_CONVERSATION_ID } from '@/services/claude/constants'
import { getDb } from '@/storage/db'
import { getValue, setValue } from '@/storage/storageService'
import {
	CLAUDE_EFFORT_OPTIONS,
	DEFAULT_PREFERENCES,
	MEMORY_ARCHIVE_INTERVAL_OPTIONS,
	TTS_READ_ALOUD_MODE_OPTIONS,
	type ClaudeEffort,
	type ConversationRecord,
	type MemoryArchiveInterval,
	type StoredMessage,
	type TtsReadAloudMode,
	type UserPreferences,
} from '@/storage/types'

const PREFERENCES_KEY = 'user'
const ACTIVE_CONVERSATION_KEY = 'activeConversationId'
const CONVERSATION_INDEX_KEY = 'conversationIndex'
const NEW_CONVERSATION_TITLE = 'New chat'

/** Settings from the Gemini version that no longer apply. Dropped on load. */
const LEGACY_PREFERENCE_KEYS = [
	'geminiApiKey',
	'geminiApiKeyPaid',
	'geminiApiKeyFree',
	'activeGeminiApiKeySlot',
	'defaultModelId',
	'defaultImageModelId',
	'defaultMusicModelId',
] as const

type StoredPreferences = Partial<UserPreferences> &
	Partial<Record<(typeof LEGACY_PREFERENCE_KEYS)[number], unknown>>

function normalizeSpendLimit(value: unknown): number {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.round(value * 10_000) / 10_000
		: 0
}

function normalizePreferences(stored: StoredPreferences | undefined): UserPreferences {
	const cleaned: StoredPreferences = { ...stored }
	for (const key of LEGACY_PREFERENCE_KEYS) {
		delete cleaned[key]
	}

	return {
		...DEFAULT_PREFERENCES,
		...cleaned,
		anthropicApiKey:
			typeof cleaned.anthropicApiKey === 'string' ? cleaned.anthropicApiKey : '',
		webSearchEnabled:
			typeof cleaned.webSearchEnabled === 'boolean'
				? cleaned.webSearchEnabled
				: DEFAULT_PREFERENCES.webSearchEnabled,
		claudeEffort: normalizeClaudeEffort(cleaned.claudeEffort),
		dailySpendLimitUsd: normalizeSpendLimit(cleaned.dailySpendLimitUsd),
		monthlySpendLimitUsd: normalizeSpendLimit(cleaned.monthlySpendLimitUsd),
		spendWarningsEnabled:
			typeof cleaned.spendWarningsEnabled === 'boolean'
				? cleaned.spendWarningsEnabled
				: DEFAULT_PREFERENCES.spendWarningsEnabled,
		cloudflareAccountId:
			typeof cleaned.cloudflareAccountId === 'string' ? cleaned.cloudflareAccountId : '',
		cloudflareApiToken:
			typeof cleaned.cloudflareApiToken === 'string' ? cleaned.cloudflareApiToken : '',
		cfImageGeneration: cleaned.cfImageGeneration !== false,
		cfTranscription: cleaned.cfTranscription !== false,
		cfSemanticMemory: cleaned.cfSemanticMemory !== false,
		ttsEngine: cleaned.ttsEngine === 'cloudflare' ? 'cloudflare' : 'device',
		memoryArchiveInterval: normalizeMemoryArchiveInterval(
			cleaned.memoryArchiveInterval,
		),
		ttsReadAloudMode: normalizeTtsReadAloudMode(cleaned.ttsReadAloudMode),
		ttsVoiceName: typeof cleaned.ttsVoiceName === 'string' ? cleaned.ttsVoiceName : '',
	}
}

function normalizeClaudeEffort(value: unknown): ClaudeEffort {
	return typeof value === 'string' &&
		CLAUDE_EFFORT_OPTIONS.includes(value as ClaudeEffort)
		? (value as ClaudeEffort)
		: DEFAULT_PREFERENCES.claudeEffort
}

function normalizeMemoryArchiveInterval(value: unknown): MemoryArchiveInterval {
	if (
		typeof value === 'number' &&
		MEMORY_ARCHIVE_INTERVAL_OPTIONS.includes(value as MemoryArchiveInterval)
	) {
		return value as MemoryArchiveInterval
	}

	return DEFAULT_PREFERENCES.memoryArchiveInterval
}

function normalizeTtsReadAloudMode(value: unknown): TtsReadAloudMode {
	if (
		typeof value === 'string' &&
		TTS_READ_ALOUD_MODE_OPTIONS.includes(value as TtsReadAloudMode)
	) {
		return value as TtsReadAloudMode
	}

	return DEFAULT_PREFERENCES.ttsReadAloudMode
}

function normalizeConversation(
	conversation: ConversationRecord,
): ConversationRecord {
	return {
		...conversation,
		title: conversation.title?.trim() || 'Chat',
		messages: Array.isArray(conversation.messages) ? conversation.messages : [],
		memoryArchiveCursor:
			typeof conversation.memoryArchiveCursor === 'number' &&
			conversation.memoryArchiveCursor >= 0
				? conversation.memoryArchiveCursor
				: 0,
	}
}

function createConversationRecord(id: string, title: string): ConversationRecord {
	const now = Date.now()
	return {
		id,
		title,
		modelId: CLAUDE_MODEL_ID,
		messages: [],
		memoryArchiveCursor: 0,
		createdAt: now,
		updatedAt: now,
	}
}

/** Titles a new chat from its first message, so naming costs no API call. */
function deriveTitleFromText(text: string): string {
	const singleLine = text
		.replace(/@\[[^\]]+\]/g, '')
		.replace(/\s+/g, ' ')
		.trim()
	if (!singleLine) {
		return NEW_CONVERSATION_TITLE
	}
	return singleLine.length > 48 ? `${singleLine.slice(0, 45).trimEnd()}…` : singleLine
}

export interface ConversationSummary {
	id: string
	title: string
	messageCount: number
	createdAt: number
	updatedAt: number
}

function toSummary(conversation: ConversationRecord): ConversationSummary {
	return {
		id: conversation.id,
		title: conversation.title,
		messageCount: conversation.messages.length,
		createdAt: conversation.createdAt,
		updatedAt: conversation.updatedAt,
	}
}

function sortSummaries(summaries: ConversationSummary[]): ConversationSummary[] {
	return [...summaries].sort((a, b) => b.updatedAt - a.updatedAt)
}

async function readConversation(id: string): Promise<ConversationRecord | null> {
	const stored = await getValue<ConversationRecord>('conversations', id)
	return stored ? normalizeConversation(stored) : null
}

/** Writes a conversation and its index entry in one transaction. */
async function writeConversation(conversation: ConversationRecord): Promise<ConversationSummary[]> {
	const db = await getDb()
	const tx = db.transaction(['conversations', 'cache'], 'readwrite')
	const index =
		((await tx.objectStore('cache').get(CONVERSATION_INDEX_KEY)) as
			| ConversationSummary[]
			| undefined) ?? []
	const nextIndex = sortSummaries([
		toSummary(conversation),
		...index.filter((entry) => entry.id !== conversation.id),
	])
	await tx.objectStore('conversations').put(conversation, conversation.id)
	await tx.objectStore('cache').put(nextIndex, CONVERSATION_INDEX_KEY)
	await tx.done
	return nextIndex
}

async function removeConversation(id: string): Promise<ConversationSummary[]> {
	const db = await getDb()
	const tx = db.transaction(['conversations', 'cache'], 'readwrite')
	const index =
		((await tx.objectStore('cache').get(CONVERSATION_INDEX_KEY)) as
			| ConversationSummary[]
			| undefined) ?? []
	const nextIndex = index.filter((entry) => entry.id !== id)
	await tx.objectStore('conversations').delete(id)
	await tx.objectStore('cache').put(nextIndex, CONVERSATION_INDEX_KEY)
	await tx.done
	return nextIndex
}

/** Loads the conversation index, building it once from existing records if needed. */
async function loadConversationIndex(): Promise<ConversationSummary[]> {
	const cached = await getValue<ConversationSummary[]>('cache', CONVERSATION_INDEX_KEY)
	if (Array.isArray(cached)) {
		return sortSummaries(cached)
	}

	const db = await getDb()
	const keys = await db.getAllKeys('conversations')
	const summaries: ConversationSummary[] = []
	for (const key of keys) {
		const record = await readConversation(String(key))
		if (record) {
			summaries.push(toSummary(record))
		}
	}
	const sorted = sortSummaries(summaries)
	await setValue('cache', CONVERSATION_INDEX_KEY, sorted)
	return sorted
}

export function usePreferences() {
	const [preferences, setPreferencesState] =
		useState<UserPreferences>(DEFAULT_PREFERENCES)
	const [isLoading, setIsLoading] = useState(true)

	useEffect(() => {
		let cancelled = false

		async function load(): Promise<void> {
			const stored = await getValue<StoredPreferences>(
				'preferences',
				PREFERENCES_KEY,
			)
			if (!cancelled) {
				setPreferencesState(normalizePreferences(stored))
				setIsLoading(false)
			}
		}

		void load()

		return () => {
			cancelled = true
		}
	}, [])

	const savePreferences = useCallback(
		async (next: UserPreferences): Promise<void> => {
			const normalized = normalizePreferences(next)
			setPreferencesState(normalized)
			await setValue('preferences', PREFERENCES_KEY, normalized)
		},
		[],
	)

	return {
		preferences,
		savePreferences,
		isLoading,
	}
}

/**
 * Multiple conversations stored in IndexedDB. The original single "main"
 * conversation is kept as-is and simply becomes one entry in the list.
 */
export function useConversations() {
	const [conversation, setConversation] = useState<ConversationRecord | null>(
		null,
	)
	const [conversations, setConversations] = useState<ConversationSummary[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const activeIdRef = useRef<string>(MAIN_CONVERSATION_ID)

	const activate = useCallback(async (record: ConversationRecord) => {
		activeIdRef.current = record.id
		setConversation(record)
		await setValue('preferences', ACTIVE_CONVERSATION_KEY, record.id)
	}, [])

	useEffect(() => {
		let cancelled = false

		async function load(): Promise<void> {
			const index = await loadConversationIndex()
			const storedActiveId = await getValue<string>(
				'preferences',
				ACTIVE_CONVERSATION_KEY,
			)
			const candidateId =
				storedActiveId && index.some((entry) => entry.id === storedActiveId)
					? storedActiveId
					: (index[0]?.id ?? MAIN_CONVERSATION_ID)

			let active = await readConversation(candidateId)
			let nextIndex = index
			if (!active) {
				active = createConversationRecord(candidateId, 'Chat')
				nextIndex = await writeConversation(active)
			}

			if (!cancelled) {
				activeIdRef.current = active.id
				setConversation(active)
				setConversations(nextIndex)
				setIsLoading(false)
			}
		}

		void load()

		return () => {
			cancelled = true
		}
	}, [])

	/** Persists a conversation and refreshes state if it is the one on screen. */
	const persistConversation = useCallback(
		async (next: ConversationRecord): Promise<void> => {
			const normalized = normalizeConversation(next)
			const nextIndex = await writeConversation(normalized)
			setConversations(nextIndex)
			if (normalized.id === activeIdRef.current) {
				setConversation(normalized)
			}
		},
		[],
	)

	const loadOrCreate = useCallback(
		async (conversationId?: string): Promise<ConversationRecord> => {
			const id = conversationId ?? activeIdRef.current
			const existing = await readConversation(id)
			if (existing) {
				return existing
			}
			const created = createConversationRecord(id, 'Chat')
			await persistConversation(created)
			return created
		},
		[persistConversation],
	)

	const ensureConversation = useCallback(
		async (conversationId?: string): Promise<ConversationRecord> =>
			loadOrCreate(conversationId),
		[loadOrCreate],
	)

	const appendMessages = useCallback(
		async (
			newMessages: StoredMessage[],
			conversationId?: string,
		): Promise<ConversationRecord> => {
			const existing = await loadOrCreate(conversationId)
			const firstUserMessage = newMessages.find((message) => message.role === 'user')
			const shouldRetitle =
				existing.title === NEW_CONVERSATION_TITLE &&
				existing.messages.length === 0 &&
				firstUserMessage

			const updated: ConversationRecord = {
				...existing,
				title: shouldRetitle
					? deriveTitleFromText(firstUserMessage.content)
					: existing.title,
				modelId: CLAUDE_MODEL_ID,
				messages: [...existing.messages, ...newMessages],
				updatedAt: Date.now(),
			}
			await persistConversation(updated)
			return updated
		},
		[loadOrCreate, persistConversation],
	)

	const updateMessage = useCallback(
		async (
			messageId: string,
			patch: Partial<StoredMessage>,
			conversationId?: string,
		): Promise<ConversationRecord> => {
			const existing = await loadOrCreate(conversationId)
			const updated: ConversationRecord = {
				...existing,
				messages: existing.messages.map((message) =>
					message.id === messageId ? { ...message, ...patch } : message,
				),
				updatedAt: Date.now(),
			}
			await persistConversation(updated)
			return updated
		},
		[loadOrCreate, persistConversation],
	)

	const truncateMessagesFrom = useCallback(
		async (messageId: string, conversationId?: string): Promise<ConversationRecord> => {
			const existing = await loadOrCreate(conversationId)
			const messageIndex = existing.messages.findIndex(
				(message) => message.id === messageId,
			)
			if (messageIndex === -1) {
				throw new Error('Message not found.')
			}

			const updated: ConversationRecord = {
				...existing,
				messages: existing.messages.slice(0, messageIndex),
				memoryArchiveCursor: Math.min(
					existing.memoryArchiveCursor,
					messageIndex,
				),
				updatedAt: Date.now(),
			}
			await persistConversation(updated)
			return updated
		},
		[loadOrCreate, persistConversation],
	)

	const clearConversation = useCallback(async (): Promise<ConversationRecord> => {
		const existing = await loadOrCreate()
		const cleared: ConversationRecord = {
			...existing,
			messages: [],
			memoryArchiveCursor: 0,
			updatedAt: Date.now(),
		}
		await persistConversation(cleared)
		return cleared
	}, [loadOrCreate, persistConversation])

	const createConversation = useCallback(
		async (title = NEW_CONVERSATION_TITLE): Promise<ConversationRecord> => {
			const created = createConversationRecord(crypto.randomUUID(), title)
			await persistConversation(created)
			await activate(created)
			return created
		},
		[activate, persistConversation],
	)

	const switchConversation = useCallback(
		async (conversationId: string): Promise<void> => {
			const record = await readConversation(conversationId)
			if (record) {
				await activate(record)
			}
		},
		[activate],
	)

	const renameConversation = useCallback(
		async (conversationId: string, title: string): Promise<void> => {
			const trimmed = title.trim()
			const existing = await readConversation(conversationId)
			if (!existing || !trimmed) {
				return
			}
			await persistConversation({ ...existing, title: trimmed })
		},
		[persistConversation],
	)

	/** Moves only the archive cursor, so messages added meanwhile are never overwritten. */
	const setMemoryArchiveCursor = useCallback(
		async (conversationId: string, cursor: number): Promise<void> => {
			const existing = await readConversation(conversationId)
			if (!existing || cursor <= existing.memoryArchiveCursor) {
				return
			}
			await persistConversation({
				...existing,
				memoryArchiveCursor: Math.min(cursor, existing.messages.length),
			})
		},
		[persistConversation],
	)

	const setConversationInstructions = useCallback(
		async (conversationId: string, instructions: string): Promise<void> => {
			const existing = await readConversation(conversationId)
			if (!existing) {
				return
			}
			await persistConversation({
				...existing,
				instructions: instructions.trim() || undefined,
			})
		},
		[persistConversation],
	)

	const deleteConversation = useCallback(
		async (conversationId: string): Promise<void> => {
			const nextIndex = await removeConversation(conversationId)
			setConversations(nextIndex)

			if (conversationId !== activeIdRef.current) {
				return
			}

			const fallback = nextIndex[0] ? await readConversation(nextIndex[0].id) : null
			if (fallback) {
				await activate(fallback)
				return
			}

			const created = createConversationRecord(crypto.randomUUID(), NEW_CONVERSATION_TITLE)
			setConversations(await writeConversation(created))
			await activate(created)
		},
		[activate],
	)

	/** Imports a chat export as a new conversation, leaving existing ones untouched. */
	const importConversation = useCallback(
		async (imported: ConversationRecord): Promise<ConversationRecord> => {
			const record = normalizeConversation({
				...imported,
				id: crypto.randomUUID(),
				title: imported.title?.trim() ? imported.title : 'Imported chat',
				memoryArchiveCursor: 0,
				updatedAt: Date.now(),
			})
			await persistConversation(record)
			await activate(record)
			return record
		},
		[activate, persistConversation],
	)

	return {
		conversation,
		conversations,
		isLoading,
		appendMessages,
		updateMessage,
		truncateMessagesFrom,
		ensureConversation,
		clearConversation,
		createConversation,
		switchConversation,
		renameConversation,
		setConversationInstructions,
		setMemoryArchiveCursor,
		deleteConversation,
		importConversation,
	}
}
