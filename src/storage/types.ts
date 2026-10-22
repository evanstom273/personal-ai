export type StoreName =
	| 'preferences'
	| 'conversations'
	| 'cache'
	| 'documents'
	| 'libraryMedia'
	| 'memories'
	| 'reminders'
	| 'projects'
	| 'usage'

export const PROJECT_TASK_STATUS_OPTIONS = ['todo', 'doing', 'done'] as const

export type ProjectTaskStatus = (typeof PROJECT_TASK_STATUS_OPTIONS)[number]

export type ProjectSource = 'user' | 'assistant'

export interface ProjectChecklistItem {
	id: string
	label: string
	checked: boolean
}

export interface ProjectTaskRecord {
	id: string
	title: string
	note?: string
	status: ProjectTaskStatus
	position: number
	checklist: ProjectChecklistItem[]
	documentIds: string[]
	reminderId?: string
	createdAt: number
	updatedAt: number
}

export interface ProjectRecord {
	id: string
	title: string
	description?: string
	documentIds: string[]
	tasks: ProjectTaskRecord[]
	source: ProjectSource
	createdAt: number
	updatedAt: number
}

export const REMINDER_RECURRENCE_OPTIONS = [
	'none',
	'daily',
	'weekly',
	'monthly',
	'yearly',
] as const

export type ReminderRecurrence = (typeof REMINDER_RECURRENCE_OPTIONS)[number]

export type ReminderSource = 'user' | 'assistant'

export interface ReminderRecord {
	id: string
	title: string
	note?: string
	deliveryMessage?: string
	scheduledAt: number
	recurrence: ReminderRecurrence
	enabled: boolean
	source: ReminderSource
	createdAt: number
	updatedAt: number
	lastFiredAt?: number
}

export type MemoryCategory =
	| 'preference'
	| 'fact'
	| 'project'
	| 'decision'
	| 'other'

export interface MemoryEntry {
	id: string
	content: string
	category: MemoryCategory
	archivedFromMessageCount: number
	createdAt: number
	/** Cloudflare embedding for semantic search; recomputed only if the model changes. */
	embedding?: number[]
	embeddingModel?: string
}

export const MEMORY_ARCHIVE_INTERVAL_OPTIONS = [5, 10, 15, 20] as const

export type MemoryArchiveInterval =
	(typeof MEMORY_ARCHIVE_INTERVAL_OPTIONS)[number]

export const TTS_READ_ALOUD_MODE_OPTIONS = [
	'never',
	'after_speech',
	'always',
] as const

export type TtsEngine = 'device' | 'cloudflare'

export type TtsReadAloudMode = (typeof TTS_READ_ALOUD_MODE_OPTIONS)[number]

export type ChatInputMethod = 'typed' | 'speech'

export type LibraryMediaKind = 'image' | 'audio'

export interface LibraryMediaRecord {
	id: string
	title: string
	kind: LibraryMediaKind
	mimeType: string
	dataUrl: string
	source: 'upload' | 'generated'
	prompt?: string
	createdAt: number
	updatedAt: number
}

export const CLAUDE_EFFORT_OPTIONS = ['low', 'medium', 'high'] as const

export type ClaudeEffort = (typeof CLAUDE_EFFORT_OPTIONS)[number]

export interface UserPreferences {
	anthropicApiKey: string
	webSearchEnabled: boolean
	claudeEffort: ClaudeEffort
	/** 0 means no limit. */
	dailySpendLimitUsd: number
	/** 0 means no limit. */
	monthlySpendLimitUsd: number
	spendWarningsEnabled: boolean
	cloudflareAccountId: string
	cloudflareApiToken: string
	cfImageGeneration: boolean
	cfTranscription: boolean
	cfSemanticMemory: boolean
	ttsEngine: TtsEngine
	userName: string
	aiName: string
	aiBehaviorInstructions: string
	allowMatureContent: boolean
	memoryArchiveInterval: MemoryArchiveInterval
	ttsReadAloudMode: TtsReadAloudMode
	ttsVoiceName: string
	allowCodebaseInspection: boolean
	scratchpadContent: string
	enableFoldableDualPane: boolean
	forceDualPaneMode: boolean
	customHingeGap: number
	dualPaneMinWidth: number
	dualPaneSplitRatio: number
}

export const DEFAULT_PREFERENCES: UserPreferences = {
	anthropicApiKey: '',
	webSearchEnabled: true,
	claudeEffort: 'low',
	dailySpendLimitUsd: 0,
	monthlySpendLimitUsd: 0,
	spendWarningsEnabled: true,
	cloudflareAccountId: '',
	cloudflareApiToken: '',
	cfImageGeneration: true,
	cfTranscription: true,
	cfSemanticMemory: true,
	ttsEngine: 'device',
	userName: '',
	aiName: '',
	aiBehaviorInstructions: '',
	allowMatureContent: true,
	memoryArchiveInterval: 20,
	ttsReadAloudMode: 'never',
	ttsVoiceName: '',
	allowCodebaseInspection: false,
	scratchpadContent: '',
	enableFoldableDualPane: true,
	forceDualPaneMode: false,
	customHingeGap: 0,
	dualPaneMinWidth: 900,
	dualPaneSplitRatio: 50,
}

export interface DocumentRecord {
	id: string
	title: string
	content: string
	source: DocumentSource
	contentFormat: DocumentContentFormat
	readOnly: boolean
	createdAt: number
	updatedAt: number
}

export type DocumentSource = 'upload' | 'user' | 'assistant'

export type DocumentContentFormat = 'markdown' | 'html'

export interface HomeTodoItem {
	id: string
	text: string
	checked: boolean
	position: number
	createdAt: number
	updatedAt: number
}

export interface HomeTodoListState {
	items: HomeTodoItem[]
	dailyReviewReminderId?: string
	updatedAt: number
}

export interface ConversationRecord {
	id: string
	title: string
	modelId: string
	messages: StoredMessage[]
	memoryArchiveCursor: number
	/** Extra instructions that apply only to this conversation. */
	instructions?: string
	createdAt: number
	updatedAt: number
}

export interface StoredMessage {
	id: string
	role: 'user' | 'assistant'
	content: string
	media?: MessageMedia[]
	attachments?: MessageFileAttachment[]
	documentLinks?: MessageDocumentLink[]
	pendingDeleteConfirmation?: PendingDeleteConfirmation
	web?: MessageWebActivity
	usage?: MessageUsage
	/** Shown under a reply that stopped early (length limit, refusal, user stop). */
	stopNote?: string
	createdAt: number
}

/** A PDF or text file sent to Claude alongside a user message. */
export interface MessageFileAttachment {
	kind: 'pdf' | 'text'
	name: string
	mimeType: string
	/** Base64 for PDFs, raw text for text files. */
	data: string
	documentId?: string
}

export interface MessageSource {
	url: string
	title: string
}

export interface MessageWebActivity {
	searchQueries: string[]
	fetchedUrls: string[]
	sources: MessageSource[]
	failures: string[]
}

export interface UsageTotals {
	inputTokens: number
	outputTokens: number
	cacheReadTokens: number
	cacheWriteTokens: number
	webSearches: number
	webFetches: number
	requests: number
	costUsd: number
}

export type MessageUsage = UsageTotals

export type UsageFeature = 'chat' | 'memory' | 'documents' | 'scratchpad'

export interface UsageDayRecord extends UsageTotals {
	/** Local calendar day, YYYY-MM-DD. */
	day: string
	costByFeature: Partial<Record<UsageFeature, number>>
}

export interface PendingDeleteConfirmation {
	documentId: string
	documentTitle: string
}

export interface MessageMedia {
	type: 'image' | 'audio'
	mimeType: string
	dataUrl: string
}

export type MessageDocumentLinkAction = 'created' | 'updated'

export interface MessageDocumentLink {
	id: string
	title: string
	action: MessageDocumentLinkAction
}
