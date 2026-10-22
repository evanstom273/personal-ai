import {
	Bell,
	Brain,
	Columns,
	Download,
	ExternalLink,
	Gauge,
	Globe,
	KeyRound,
	Mic,
	PlugZap,
	RefreshCw,
	Save,
	Sparkles,
	Trash2,
	UserRound,
	Volume2,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UsageSettings } from '@/components/settings/UsageSettings'
import { usePreferencesContext, useTextToSpeechContext, useConversationsContext, useChatGenerationContext } from '@/providers/ChatProvider'
import type { SpeechVoiceOption } from '@/hooks/useTextToSpeech'
import { CLAUDE_MODEL_ID, CLAUDE_MODEL_NAME } from '@/services/claude/constants'
import { validateApiKey } from '@/services/claude/validate'
import {
	requestBackgroundReminderNotificationPermission,
	syncBackgroundReminderNotifications,
} from '@/services/reminders/reminderBackgroundNotifications'
import { canUseNotificationTriggers } from '@/services/reminders/reminderNotificationTriggers'
import {
	MEMORY_ARCHIVE_INTERVAL_OPTIONS,
	type ClaudeEffort,
	type MemoryArchiveInterval,
	type TtsReadAloudMode,
} from '@/storage/types'
import { isVoiceInputSupported } from '@/utils/speechRecognition'
import {
	canUseNotifications,
	getNotificationPermission,
	isStandaloneDisplayMode,
	requestNotificationPermission,
} from '@/utils/notifications'
import { isCapacitorNativePlatform } from '@/utils/capacitor'
import { cn } from '@/utils/cn'
import { downloadAppReferenceMarkdown, downloadChangelogMarkdown } from '@/utils/downloads'
import {
	APP_VERSION,
	CHANGELOG,
	formatChangelogDate,
} from '@/data/changelog'
import { clearAllMemory } from '@/services/memory/memoryService'
import {
	getUnarchivedMessages,
	runManualMemoryArchive,
} from '@/services/memory/memoryArchive'
import {
	resolveSettingsTabFromParams,
	type SettingsTab,
} from '@/navigation/swipeNav'

const SETTINGS_TABS = [
	{ id: 'profile', label: 'Profile', icon: UserRound },
	{ id: 'memory', label: 'Memory', icon: Brain },
	{ id: 'api', label: 'API', icon: KeyRound },
	{ id: 'usage', label: 'Usage', icon: Gauge },
	{ id: 'voice', label: 'Voice', icon: Volume2 },
	{ id: 'app', label: 'App', icon: Bell },
] as const

const MANUAL_ARCHIVE_CONFIRM_BATCHES = 3

export function SettingsPage() {
	const [searchParams, setSearchParams] = useSearchParams()
	const activeTab = resolveSettingsTabFromParams(searchParams)

	const { preferences, savePreferences, isLoading } = usePreferencesContext()
	const { conversation, setMemoryArchiveCursor } = useConversationsContext()
	const {
		previewVoice,
		status: speechStatus,
		voices,
		isSupported: isSpeechOutputSupported,
	} = useTextToSpeechContext()
	const { memoryArchiveError, clearMemoryArchiveError } =
		useChatGenerationContext()
	const [apiKey, setApiKey] = useState('')
	const [userName, setUserName] = useState('')
	const [aiName, setAiName] = useState('')
	const [aiBehaviorInstructions, setAiBehaviorInstructions] = useState('')
	const [allowMatureContent, setAllowMatureContent] = useState(true)
	const [memoryArchiveInterval, setMemoryArchiveInterval] =
		useState<MemoryArchiveInterval>(20)
	const [ttsReadAloudMode, setTtsReadAloudMode] =
		useState<TtsReadAloudMode>('never')
	const [ttsVoiceName, setTtsVoiceName] = useState('')
	const [savedApiKey, setSavedApiKey] = useState(false)
	const [savedIdentity, setSavedIdentity] = useState(false)
	const [isSavingApiKey, setIsSavingApiKey] = useState(false)
	const [isSavingIdentity, setIsSavingIdentity] = useState(false)
	const [isValidating, setIsValidating] = useState(false)
	const [validationMessage, setValidationMessage] = useState<string | null>(null)
	const [validationOk, setValidationOk] = useState<boolean | null>(null)
	const [notificationPermission, setNotificationPermission] = useState(
		getNotificationPermission(),
	)
	const [notificationMessage, setNotificationMessage] = useState<string | null>(
		null,
	)
	const [allowCodebaseInspection, setAllowCodebaseInspection] = useState(false)
	const [enableFoldableDualPane, setEnableFoldableDualPane] = useState(true)
	const [forceDualPaneMode, setForceDualPaneMode] = useState(false)
	const [customHingeGap, setCustomHingeGap] = useState(0)
	const [dualPaneMinWidth, setDualPaneMinWidth] = useState(900)
	const [memoryActionMessage, setMemoryActionMessage] = useState<string | null>(
		null,
	)
	const [isClearingMemory, setIsClearingMemory] = useState(false)
	const [isArchivingMemory, setIsArchivingMemory] = useState(false)

	useEffect(() => {
		if (!isLoading) {
			setApiKey(preferences.anthropicApiKey)
			setUserName(preferences.userName)
			setAiName(preferences.aiName)
			setAiBehaviorInstructions(preferences.aiBehaviorInstructions)
			setAllowMatureContent(preferences.allowMatureContent ?? true)
			setMemoryArchiveInterval(preferences.memoryArchiveInterval)
			setTtsReadAloudMode(preferences.ttsReadAloudMode)
			setTtsVoiceName(preferences.ttsVoiceName)
			setAllowCodebaseInspection(preferences.allowCodebaseInspection ?? false)
			setEnableFoldableDualPane(preferences.enableFoldableDualPane ?? true)
			setForceDualPaneMode(preferences.forceDualPaneMode ?? false)
			setCustomHingeGap(preferences.customHingeGap ?? 0)
			setDualPaneMinWidth(preferences.dualPaneMinWidth ?? 900)
		}
	}, [isLoading, preferences])

	function setActiveTab(tab: SettingsTab): void {
		setSearchParams(tab === 'profile' ? {} : { tab })
	}

	async function handleSaveApiKey(): Promise<void> {
		setIsSavingApiKey(true)
		setSavedApiKey(false)
		try {
			await savePreferences({
				...preferences,
				anthropicApiKey: apiKey.trim(),
			})
			setSavedApiKey(true)
		} finally {
			setIsSavingApiKey(false)
		}
	}

	async function handleClaudeEffortChange(value: ClaudeEffort): Promise<void> {
		await savePreferences({ ...preferences, claudeEffort: value })
	}

	async function handleWebSearchChange(value: boolean): Promise<void> {
		await savePreferences({ ...preferences, webSearchEnabled: value })
	}

	async function handleSaveIdentity(): Promise<void> {
		setIsSavingIdentity(true)
		setSavedIdentity(false)
		try {
			await savePreferences({
				...preferences,
				userName: userName.trim(),
				aiName: aiName.trim(),
				aiBehaviorInstructions: aiBehaviorInstructions.trim(),
				allowMatureContent,
			})
			setSavedIdentity(true)
		} finally {
			setIsSavingIdentity(false)
		}
	}

	async function handleMemoryIntervalChange(value: number): Promise<void> {
		const interval = MEMORY_ARCHIVE_INTERVAL_OPTIONS.includes(
			value as MemoryArchiveInterval,
		)
			? (value as MemoryArchiveInterval)
			: 20
		setMemoryArchiveInterval(interval)
		await savePreferences({
			...preferences,
			memoryArchiveInterval: interval,
		})
	}

	async function handleTtsReadAloudModeChange(value: TtsReadAloudMode): Promise<void> {
		setTtsReadAloudMode(value)
		await savePreferences({
			...preferences,
			ttsReadAloudMode: value,
		})
	}

	async function handleTtsVoiceChange(value: string): Promise<void> {
		setTtsVoiceName(value)
		await savePreferences({
			...preferences,
			ttsVoiceName: value,
		})
	}

	async function handleAllowCodebaseInspectionChange(value: boolean): Promise<void> {
		setAllowCodebaseInspection(value)
		await savePreferences({
			...preferences,
			allowCodebaseInspection: value,
		})
	}

	async function handleFoldablePreferenceChange(
		updates: Partial<{
			enableFoldableDualPane: boolean
			forceDualPaneMode: boolean
			customHingeGap: number
			dualPaneMinWidth: number
		}>,
	): Promise<void> {
		if (updates.enableFoldableDualPane !== undefined) setEnableFoldableDualPane(updates.enableFoldableDualPane)
		if (updates.forceDualPaneMode !== undefined) setForceDualPaneMode(updates.forceDualPaneMode)
		if (updates.customHingeGap !== undefined) setCustomHingeGap(updates.customHingeGap)
		if (updates.dualPaneMinWidth !== undefined) setDualPaneMinWidth(updates.dualPaneMinWidth)

		await savePreferences({
			...preferences,
			...updates,
		})
	}

	async function handleClearMemory(): Promise<void> {
		if (
			!window.confirm(
				'Clear all archived memory? This cannot be undone. Chat messages are not deleted.',
			)
		) {
			return
		}

		setIsClearingMemory(true)
		setMemoryActionMessage(null)
		try {
			await clearAllMemory()
			setMemoryActionMessage('All memory entries cleared.')
		} catch (error) {
			setMemoryActionMessage(
				error instanceof Error ? error.message : 'Could not clear memory.',
			)
		} finally {
			setIsClearingMemory(false)
		}
	}

	async function handleManualMemoryArchive(): Promise<void> {
		if (!conversation) {
			setMemoryActionMessage('No chat history to archive yet.')
			return
		}

		const unarchivedCount = getUnarchivedMessages(conversation).length
		if (unarchivedCount === 0) {
			setMemoryActionMessage('No unarchived chat messages left to process.')
			return
		}

		const batchSize = Math.max(1, memoryArchiveInterval)
		const estimatedBatches = Math.ceil(unarchivedCount / batchSize)
		if (estimatedBatches > MANUAL_ARCHIVE_CONFIRM_BATCHES) {
			const confirmed = window.confirm(
				`Archive now will run about ${estimatedBatches} Claude API calls to scan ${unarchivedCount} messages. Continue?`,
			)
			if (!confirmed) {
				return
			}
		}

		setIsArchivingMemory(true)
		setMemoryActionMessage(null)
		clearMemoryArchiveError()
		try {
			const { conversation: updated, result } = await runManualMemoryArchive(
				preferences.anthropicApiKey,
				conversation,
				preferences,
			)

			if (
				updated.memoryArchiveCursor !== (conversation.memoryArchiveCursor ?? 0)
			) {
				await setMemoryArchiveCursor(updated.id, updated.memoryArchiveCursor)
			}

			if (result.messagesArchived === 0) {
				setMemoryActionMessage('No chat messages were archived.')
			} else if (result.memoriesAdded === 0) {
				setMemoryActionMessage(
					`Processed ${result.messagesArchived} message${result.messagesArchived === 1 ? '' : 's'} — nothing new worth saving.`,
				)
			} else {
				setMemoryActionMessage(
					`Archived ${result.memoriesAdded} fact${result.memoriesAdded === 1 ? '' : 's'} from ${result.messagesArchived} message${result.messagesArchived === 1 ? '' : 's'}.`,
				)
			}
		} catch (error) {
			setMemoryActionMessage(
				error instanceof Error ? error.message : 'Memory archive failed.',
			)
		} finally {
			setIsArchivingMemory(false)
		}
	}

	async function handleEnableNotifications(): Promise<void> {
		setNotificationMessage(null)

		if (isCapacitorNativePlatform()) {
			const granted = await requestBackgroundReminderNotificationPermission()
			setNotificationPermission(granted ? 'granted' : 'denied')

			if (granted) {
				await syncBackgroundReminderNotifications(preferences)
				setNotificationMessage(
					'Notifications enabled. Scheduled reminders can alert you while the Android app is closed.',
				)
				return
			}

			setNotificationMessage(
				'Notifications are blocked. Enable them in Android settings for Personal AI.',
			)
			return
		}

		if (!canUseNotifications()) {
			setNotificationMessage('Notifications are not supported in this browser.')
			return
		}

		const permission = await requestNotificationPermission()
		setNotificationPermission(permission)

		if (permission === 'granted') {
			await syncBackgroundReminderNotifications(preferences)
			setNotificationMessage(
				canUseNotificationTriggers() && isStandaloneDisplayMode()
					? 'Notifications enabled. Chat replies and scheduled reminders can alert you while the app is closed on this Android install.'
					: 'Notifications enabled. You will get system alerts when a reply finishes in the background.',
			)
			return
		}

		if (permission === 'denied') {
			setNotificationMessage(
				'Notifications are blocked. Enable them in Android app settings for this PWA or Chrome.',
			)
			return
		}

		setNotificationMessage('Notification permission was not granted.')
	}

	async function handleValidate(): Promise<void> {
		setIsValidating(true)
		setValidationMessage(null)
		setValidationOk(null)
		try {
			const result = await validateApiKey(apiKey)
			setValidationOk(result.ok)
			setValidationMessage(result.message)
		} finally {
			setIsValidating(false)
		}
	}

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<header className="shrink-0 border-b border-border/80 px-4 py-3 md:px-6">
				<div className="library-section-tabs flex gap-1 overflow-x-auto rounded-xl p-1">
					{SETTINGS_TABS.map(({ id, label, icon: Icon }) => (
						<button
							key={id}
							type="button"
							onClick={() => setActiveTab(id)}
							className={cn(
								'inline-flex min-w-[4.5rem] flex-1 items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors sm:text-sm',
								activeTab === id
									? 'surface-tab-active text-foreground'
									: 'text-muted-foreground hover:text-foreground',
							)}
						>
							<Icon className="h-4 w-4 shrink-0" />
							<span className="truncate">{label}</span>
						</button>
					))}
				</div>
			</header>

			<ScrollArea className="min-h-0 flex-1">
				<div className="mx-auto w-full max-w-2xl px-4 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] md:px-6 md:py-6">
					{activeTab === 'profile' ? (
						<ProfileTab
							userName={userName}
							aiName={aiName}
							aiBehaviorInstructions={aiBehaviorInstructions}
							allowMatureContent={allowMatureContent}
							savedIdentity={savedIdentity}
							isSavingIdentity={isSavingIdentity}
							onUserNameChange={(value) => {
								setUserName(value)
								setSavedIdentity(false)
							}}
							onAiNameChange={(value) => {
								setAiName(value)
								setSavedIdentity(false)
							}}
							onBehaviorChange={(value) => {
								setAiBehaviorInstructions(value)
								setSavedIdentity(false)
							}}
							onAllowMatureContentChange={(value) => {
								setAllowMatureContent(value)
								setSavedIdentity(false)
							}}
							onSave={() => void handleSaveIdentity()}
						/>
					) : null}

					{activeTab === 'memory' ? (
						<MemoryTab
							memoryArchiveInterval={memoryArchiveInterval}
							unarchivedMessageCount={
								conversation ? getUnarchivedMessages(conversation).length : 0
							}
							hasApiKey={preferences.anthropicApiKey.trim().length > 0}
							isClearingMemory={isClearingMemory}
							isArchivingMemory={isArchivingMemory}
							actionMessage={memoryActionMessage}
							memoryArchiveError={memoryArchiveError}
							onDismissArchiveError={clearMemoryArchiveError}
							onIntervalChange={(value) => void handleMemoryIntervalChange(value)}
							onClearMemory={() => void handleClearMemory()}
							onManualArchive={() => void handleManualMemoryArchive()}
						/>
					) : null}

					{activeTab === 'api' ? (
						<ApiTab
							apiKey={apiKey}
							savedApiKey={savedApiKey}
							isSavingApiKey={isSavingApiKey}
							isValidating={isValidating}
							validationMessage={validationMessage}
							validationOk={validationOk}
							claudeEffort={preferences.claudeEffort}
							webSearchEnabled={preferences.webSearchEnabled}
							onApiKeyChange={(value) => {
								setApiKey(value)
								setSavedApiKey(false)
								setValidationMessage(null)
								setValidationOk(null)
							}}
							onSave={() => void handleSaveApiKey()}
							onValidate={() => void handleValidate()}
							onClaudeEffortChange={(value) => void handleClaudeEffortChange(value)}
							onWebSearchChange={(value) => void handleWebSearchChange(value)}
						/>
					) : null}

					{activeTab === 'usage' ? <UsageSettings /> : null}

					{activeTab === 'voice' ? (
						<VoiceTab
							ttsReadAloudMode={ttsReadAloudMode}
							ttsVoiceName={ttsVoiceName}
							voices={voices}
							isSpeechOutputSupported={isSpeechOutputSupported}
							speechStatus={speechStatus}
							onReadAloudModeChange={(value) =>
								void handleTtsReadAloudModeChange(value)
							}
							onVoiceChange={(value) => void handleTtsVoiceChange(value)}
							onPreview={() => void previewVoice(ttsVoiceName)}
						/>
					) : null}

					{activeTab === 'app' ? (
						<AppTab
							notificationPermission={notificationPermission}
							notificationMessage={notificationMessage}
							allowCodebaseInspection={allowCodebaseInspection}
							enableFoldableDualPane={enableFoldableDualPane}
							forceDualPaneMode={forceDualPaneMode}
							customHingeGap={customHingeGap}
							dualPaneMinWidth={dualPaneMinWidth}
							onEnableNotifications={() => void handleEnableNotifications()}
							onAllowCodebaseInspectionChange={(value) =>
								void handleAllowCodebaseInspectionChange(value)
							}
							onFoldableChange={(updates) =>
								void handleFoldablePreferenceChange(updates)
							}
						/>
					) : null}
				</div>
			</ScrollArea>
		</div>
	)
}

function ProfileTab({
	userName,
	aiName,
	aiBehaviorInstructions,
	allowMatureContent,
	savedIdentity,
	isSavingIdentity,
	onUserNameChange,
	onAiNameChange,
	onBehaviorChange,
	onAllowMatureContentChange,
	onSave,
}: {
	userName: string
	aiName: string
	aiBehaviorInstructions: string
	allowMatureContent: boolean
	savedIdentity: boolean
	isSavingIdentity: boolean
	onUserNameChange: (value: string) => void
	onAiNameChange: (value: string) => void
	onBehaviorChange: (value: string) => void
	onAllowMatureContentChange: (value: boolean) => void
	onSave: () => void
}) {
	return (
		<div className="space-y-5">
			<TabIntro
				title="Profile & personality"
				description="How you and your assistant are named, and how replies should feel."
			/>

			<section className="surface-panel space-y-5 rounded-xl p-5">
				<div className="grid gap-5 sm:grid-cols-2">
					<FieldGroup
						icon={UserRound}
						label="Your name"
						hint="What the assistant should call you."
					>
						<input
							value={userName}
							onChange={(event) => onUserNameChange(event.target.value)}
							placeholder="Your name"
							className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
						/>
					</FieldGroup>

					<FieldGroup
						icon={Sparkles}
						label="AI name"
						hint="Shown in the app and used in the assistant's instructions."
					>
						<input
							value={aiName}
							onChange={(event) => onAiNameChange(event.target.value)}
							placeholder="Assistant"
							className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
						/>
					</FieldGroup>
				</div>

				<FieldGroup
					label="How should your AI respond?"
					hint='Traits like "Warm, witty, direct, British English" — or a longer custom prompt.'
				>
					<textarea
						value={aiBehaviorInstructions}
						onChange={(event) => onBehaviorChange(event.target.value)}
						rows={6}
						placeholder="Warm, conversational, witty, direct, British English"
						className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
					/>
				</FieldGroup>

				<label className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm">
					<input
						type="checkbox"
						checked={allowMatureContent}
						onChange={(event) => onAllowMatureContentChange(event.target.checked)}
						className="mt-0.5"
					/>
					<span>
						<span className="block font-medium">Allow mature content</span>
						<span className="mt-1 block text-muted-foreground">
							Lets the assistant match your tone, including swearing and mature
							themes. Anthropic&apos;s usage policies still apply. Turn off for a
							cleaner, more neutral tone.
						</span>
					</span>
				</label>

				<div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
					<Button onClick={onSave} disabled={isSavingIdentity}>
						<Save className="h-4 w-4" />
						{isSavingIdentity ? 'Saving…' : 'Save profile'}
					</Button>
					{savedIdentity ? (
						<span className="text-sm text-primary">Profile saved</span>
					) : null}
				</div>
			</section>
		</div>
	)
}

function MemoryTab({
	memoryArchiveInterval,
	unarchivedMessageCount,
	hasApiKey,
	isClearingMemory,
	isArchivingMemory,
	actionMessage,
	memoryArchiveError,
	onDismissArchiveError,
	onIntervalChange,
	onClearMemory,
	onManualArchive,
}: {
	memoryArchiveInterval: MemoryArchiveInterval
	unarchivedMessageCount: number
	hasApiKey: boolean
	isClearingMemory: boolean
	isArchivingMemory: boolean
	actionMessage: string | null
	memoryArchiveError: string | null
	onDismissArchiveError: () => void
	onIntervalChange: (value: number) => void
	onClearMemory: () => void
	onManualArchive: () => void
}) {
	return (
		<div className="space-y-5">
			<TabIntro
				title="Memory"
				description="Control how often chat facts get archived for future conversations."
			/>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<p className="text-sm text-muted-foreground">
					After this many new chat messages, the assistant reads the batch and
					archives durable facts into Memory. Lower values update more often;
					higher values wait for more context per pass. Archival uses {CLAUDE_MODEL_NAME}
					at low effort — typically a fraction of a cent per batch. Only the
					current conversation is scanned.
				</p>

				<div className="space-y-3">
					<div className="flex items-center justify-between text-sm">
						<span className="text-muted-foreground">Archive every</span>
						<span className="font-medium">{memoryArchiveInterval} messages</span>
					</div>
					<input
						type="range"
						min={0}
						max={MEMORY_ARCHIVE_INTERVAL_OPTIONS.length - 1}
						step={1}
						value={Math.max(
							0,
							MEMORY_ARCHIVE_INTERVAL_OPTIONS.indexOf(memoryArchiveInterval),
						)}
						onChange={(event) => {
							const index = Number(event.target.value)
							const next = MEMORY_ARCHIVE_INTERVAL_OPTIONS[index] ?? 20
							onIntervalChange(next)
						}}
						className="w-full accent-primary"
					/>
					<div className="flex justify-between text-xs text-muted-foreground">
						{MEMORY_ARCHIVE_INTERVAL_OPTIONS.map((option) => (
							<span key={option}>{option}</span>
						))}
					</div>
				</div>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<h3 className="text-sm font-medium">Manual actions</h3>
				<p className="text-sm text-muted-foreground">
					{unarchivedMessageCount > 0
						? `${unarchivedMessageCount} chat message${unarchivedMessageCount === 1 ? '' : 's'} not yet scanned for memory.`
						: 'All chat messages have already been scanned.'}
				</p>
				<div className="flex flex-wrap gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={onManualArchive}
						disabled={isArchivingMemory || !hasApiKey || unarchivedMessageCount === 0}
					>
						<RefreshCw
							className={cn('h-4 w-4', isArchivingMemory && 'animate-spin')}
						/>
						{isArchivingMemory ? 'Archiving…' : 'Archive now'}
					</Button>
					<Button
						type="button"
						variant="outline"
						className="text-destructive hover:text-destructive"
						onClick={onClearMemory}
						disabled={isClearingMemory}
					>
						<Trash2 className="h-4 w-4" />
						{isClearingMemory ? 'Clearing…' : 'Clear memory'}
					</Button>
				</div>
				{!hasApiKey ? (
					<p className="text-xs text-muted-foreground">
						Add your Anthropic API key in the API tab to run manual archive.
					</p>
				) : null}
				{actionMessage ? (
					<p className="text-sm text-muted-foreground">{actionMessage}</p>
				) : null}
				{memoryArchiveError ? (
					<div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
						<p>Automatic memory archival failed: {memoryArchiveError}</p>
						<p className="mt-1 text-muted-foreground">
							Chat history may be growing larger until this succeeds. Try Archive
							now or check your API key and quota.
						</p>
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="mt-2 h-7 px-2 text-destructive"
							onClick={onDismissArchiveError}
						>
							Dismiss
						</Button>
					</div>
				) : null}
			</section>

			<section className="surface-panel rounded-xl p-5">
				<p className="text-sm text-muted-foreground">
					<Link
						to="/memory"
						className="font-medium text-primary underline-offset-4 hover:underline"
					>
						Open Memory
					</Link>{' '}
					to browse archived facts from chat.
				</p>
			</section>
		</div>
	)
}

const EFFORT_LABELS: Record<ClaudeEffort, { label: string; description: string }> = {
	low: { label: 'Low (recommended)', description: 'Fastest and cheapest. Good for everyday chat.' },
	medium: { label: 'Medium', description: 'More careful reasoning; uses more output tokens.' },
	high: { label: 'High', description: 'Most thorough; slower and costs more per reply.' },
}

function ApiTab({
	apiKey,
	savedApiKey,
	isSavingApiKey,
	isValidating,
	validationMessage,
	validationOk,
	claudeEffort,
	webSearchEnabled,
	onApiKeyChange,
	onSave,
	onValidate,
	onClaudeEffortChange,
	onWebSearchChange,
}: {
	apiKey: string
	savedApiKey: boolean
	isSavingApiKey: boolean
	isValidating: boolean
	validationMessage: string | null
	validationOk: boolean | null
	claudeEffort: ClaudeEffort
	webSearchEnabled: boolean
	onApiKeyChange: (value: string) => void
	onSave: () => void
	onValidate: () => void
	onClaudeEffortChange: (value: ClaudeEffort) => void
	onWebSearchChange: (value: boolean) => void
}) {
	return (
		<div className="space-y-5">
			<TabIntro
				title="API & model"
				description="Your Anthropic API key and how the assistant uses it."
			/>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<FieldGroup
					icon={KeyRound}
					label="Anthropic API key"
					hint="Used for chat, memory archiving, document AI, and the scratchpad."
				>
					<input
						type="password"
						value={apiKey}
						onChange={(event) => onApiKeyChange(event.target.value)}
						placeholder="sk-ant-..."
						autoComplete="off"
						spellCheck={false}
						className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
					/>
				</FieldGroup>

				<p className="text-xs text-muted-foreground">
					Create a key in the{' '}
					<a
						href="https://platform.claude.com/settings/keys"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 text-primary hover:underline"
					>
						Claude Console
						<ExternalLink className="h-3.5 w-3.5" />
					</a>
					. The key is stored only on this device (in the browser&apos;s IndexedDB)
					and is sent directly to api.anthropic.com — there is no server in
					between. Anyone with access to this device and browser profile could
					read it, so use a key you can revoke, ideally in its own workspace with a
					spend limit.
				</p>

				<div className="flex flex-wrap items-center gap-3">
					<Button onClick={onSave} disabled={isSavingApiKey}>
						<Save className="h-4 w-4" />
						{isSavingApiKey ? 'Saving…' : 'Save key'}
					</Button>
					<Button
						variant="outline"
						onClick={onValidate}
						disabled={isValidating || !apiKey.trim()}
					>
						<PlugZap className="h-4 w-4" />
						{isValidating ? 'Checking…' : 'Test key'}
					</Button>
					{savedApiKey ? (
						<span className="text-sm text-primary">Key saved</span>
					) : null}
				</div>

				{validationMessage ? (
					<p
						className={
							validationOk ? 'text-sm text-primary' : 'text-sm text-destructive'
						}
					>
						{validationMessage}
					</p>
				) : null}
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Sparkles className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Model</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					Every conversation uses{' '}
					<span className="font-medium text-foreground">{CLAUDE_MODEL_NAME}</span>{' '}
					(<code className="text-xs">{CLAUDE_MODEL_ID}</code>) — fast, low-cost, and able
					to read images, PDFs, and code.
				</p>
				<div className="space-y-2">
					<label htmlFor="claude-effort" className="text-sm font-medium">
						Reasoning effort
					</label>
					<select
						id="claude-effort"
						value={claudeEffort}
						onChange={(event) => onClaudeEffortChange(event.target.value as ClaudeEffort)}
						className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
					>
						{(Object.keys(EFFORT_LABELS) as ClaudeEffort[]).map((effort) => (
							<option key={effort} value={effort}>
								{EFFORT_LABELS[effort].label}
							</option>
						))}
					</select>
					<p className="text-xs text-muted-foreground">
						{EFFORT_LABELS[claudeEffort].description}
					</p>
				</div>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Globe className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Web search</h3>
				</div>
				<label className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm">
					<input
						type="checkbox"
						checked={webSearchEnabled}
						onChange={(event) => onWebSearchChange(event.target.checked)}
						className="mt-0.5"
					/>
					<span>
						<span className="block font-medium">Let Claude search the web</span>
						<span className="mt-1 block text-muted-foreground">
							Claude decides when a question needs current information, then
							searches and reads pages using Anthropic&apos;s built-in web tools, with
							sources linked under the reply. You can also toggle this from the +
							menu in chat.
						</span>
					</span>
				</label>
				<p className="text-xs text-muted-foreground">
					Searches cost $10 per 1,000 (about one cent each) plus the tokens of the
					results; reading a page costs only its tokens. The app allows up to 5
					searches and 3 page reads per reply.
				</p>
			</section>
		</div>
	)
}

function VoiceTab({
	ttsReadAloudMode,
	ttsVoiceName,
	voices,
	isSpeechOutputSupported,
	speechStatus,
	onReadAloudModeChange,
	onVoiceChange,
	onPreview,
}: {
	ttsReadAloudMode: TtsReadAloudMode
	ttsVoiceName: string
	voices: SpeechVoiceOption[]
	isSpeechOutputSupported: boolean
	speechStatus: string
	onReadAloudModeChange: (value: TtsReadAloudMode) => void
	onVoiceChange: (value: string) => void
	onPreview: () => void
}) {
	const voiceInputSupported = isVoiceInputSupported()

	return (
		<div className="space-y-5">
			<TabIntro
				title="Voice"
				description="Speech input and read-aloud, using your device's built-in speech features."
			/>

			<section className="surface-panel space-y-3 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Mic className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Voice input</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					{voiceInputSupported
						? 'Tap the mic, speak, then tap Continue. Speech is recognised by your browser, so it costs nothing extra.'
						: 'Speech recognition is not available in this browser or app, so the mic button is hidden. Chrome and Edge support it; some Android app views do not.'}
				</p>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Volume2 className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Read replies aloud</h3>
				</div>
				{isSpeechOutputSupported ? (
					<>
						<p className="text-sm text-muted-foreground">
							Uses your device&apos;s text-to-speech voices — free, offline-capable on
							most devices. Chat text is always shown; speech is optional on top.
						</p>

						<div className="space-y-2">
							<label htmlFor="tts-read-aloud-mode" className="text-sm font-medium">
								Read responses aloud
							</label>
							<select
								id="tts-read-aloud-mode"
								value={ttsReadAloudMode}
								onChange={(event) => {
									onReadAloudModeChange(event.target.value as TtsReadAloudMode)
								}}
								className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
							>
								<option value="never">Never</option>
								<option value="after_speech">When I use the microphone</option>
								<option value="always">Always</option>
							</select>
						</div>

						<div className="space-y-2">
							<label htmlFor="tts-voice-name" className="text-sm font-medium">
								Speaking voice
							</label>
							<div className="flex flex-wrap items-center gap-3">
								<select
									id="tts-voice-name"
									value={ttsVoiceName}
									onChange={(event) => onVoiceChange(event.target.value)}
									className="min-w-0 flex-1 rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
								>
									<option value="">Device default</option>
									{voices.map((voice) => (
										<option key={voice.id} value={voice.id}>
											{voice.name} ({voice.lang})
										</option>
									))}
								</select>
								<Button
									type="button"
									variant="outline"
									disabled={speechStatus === 'playing'}
									onClick={onPreview}
								>
									<Volume2 className="h-4 w-4" />
									Preview
								</Button>
							</div>
							<p className="text-sm text-muted-foreground">
								Tap Listen under a reply to hear it.
							</p>
						</div>
					</>
				) : (
					<p className="text-sm text-muted-foreground">
						Text-to-speech is not available in this browser or app view.
					</p>
				)}
			</section>

			<section className="surface-panel space-y-3 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Mic className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Voice conversation</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					When your device supports both speech input and read-aloud, a phone icon
					next to your assistant&apos;s name starts hands-free Conversation Mode.
				</p>
			</section>
		</div>
	)
}

function AppTab({
	notificationPermission,
	notificationMessage,
	allowCodebaseInspection,
	enableFoldableDualPane,
	forceDualPaneMode,
	customHingeGap,
	dualPaneMinWidth,
	onEnableNotifications,
	onAllowCodebaseInspectionChange,
	onFoldableChange,
}: {
	notificationPermission: NotificationPermission
	notificationMessage: string | null
	allowCodebaseInspection: boolean
	enableFoldableDualPane: boolean
	forceDualPaneMode: boolean
	customHingeGap: number
	dualPaneMinWidth: number
	onEnableNotifications: () => void
	onAllowCodebaseInspectionChange: (value: boolean) => void
	onFoldableChange: (updates: Partial<{
		enableFoldableDualPane: boolean
		forceDualPaneMode: boolean
		customHingeGap: number
		dualPaneMinWidth: number
	}>) => void
}) {
	return (
		<div className="space-y-5">
			<TabIntro
				title="App behaviour"
				description="Notifications, Dual-Pane & Foldables, and background settings."
			/>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Columns className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Foldable & Split Screen Dual-Pane View</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					Enables dynamic side-by-side multi-pane layouts on wide screens, foldable screens (Galaxy Z Fold, Surface Duo, Pixel Fold), and tablets.
				</p>

				<div className="space-y-3">
					<label className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm">
						<input
							type="checkbox"
							checked={enableFoldableDualPane}
							onChange={(e) => onFoldableChange({ enableFoldableDualPane: e.target.checked })}
							className="mt-0.5"
						/>
						<span>
							<span className="block font-medium">Auto-enable Dual-Pane View</span>
							<span className="mt-1 block text-muted-foreground">
								Automatically switch to split view when on foldable screens or screens wider than the min-width threshold.
							</span>
						</span>
					</label>

					<label className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm">
						<input
							type="checkbox"
							checked={forceDualPaneMode}
							onChange={(e) => onFoldableChange({ forceDualPaneMode: e.target.checked })}
							className="mt-0.5"
						/>
						<span>
							<span className="block font-medium">Force Dual-Pane Mode</span>
							<span className="mt-1 block text-muted-foreground">
								Always split the screen regardless of device size or viewport orientation (ideal for testing multi-pane).
							</span>
						</span>
					</label>

					<div className="space-y-2 pt-2">
						<div className="flex items-center justify-between text-sm">
							<span className="font-medium">Min-Width Activation Threshold</span>
							<span className="font-mono text-xs text-muted-foreground">{dualPaneMinWidth}px</span>
						</div>
						<input
							type="range"
							min={600}
							max={1400}
							step={50}
							value={dualPaneMinWidth}
							onChange={(e) => onFoldableChange({ dualPaneMinWidth: Number(e.target.value) })}
							className="w-full accent-primary"
						/>
					</div>

					<div className="space-y-2 pt-2">
						<div className="flex items-center justify-between text-sm">
							<span className="font-medium">Custom Physical Hinge Gap Offset</span>
							<span className="font-mono text-xs text-muted-foreground">{customHingeGap}px</span>
						</div>
						<input
							type="range"
							min={0}
							max={40}
							step={2}
							value={customHingeGap}
							onChange={(e) => onFoldableChange({ customHingeGap: Number(e.target.value) })}
							className="w-full accent-primary"
						/>
					</div>
				</div>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Bell className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">System notifications</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					Get a phone notification when a chat reply finishes while you are in
					another app or browsing elsewhere in the PWA. Tap it to jump back to
					chat.
				</p>
				<p className="text-sm text-muted-foreground">
					Status:{' '}
					<span className="font-medium text-foreground">
						{notificationPermission === 'granted'
							? 'Enabled'
							: notificationPermission === 'denied'
								? 'Blocked'
								: 'Not enabled yet'}
					</span>
				</p>
				{notificationPermission !== 'granted' ? (
					<Button variant="outline" onClick={onEnableNotifications}>
						<Bell className="h-4 w-4" />
						Enable notifications
					</Button>
				) : null}
				{notificationMessage ? (
					<p className="text-sm text-muted-foreground">{notificationMessage}</p>
				) : null}
			</section>

			<section className="surface-panel space-y-3 rounded-xl p-5">
				<h3 className="text-sm font-medium">Scheduled reminders</h3>
				<p className="text-sm text-muted-foreground">
					Library → Schedule stores reminders on this device. When one is due,
					the assistant posts a chat message and can show a system notification.
				</p>
				<p className="text-sm text-muted-foreground">
					{isCapacitorNativePlatform()
						? notificationPermission === 'granted'
							? 'The Android app can fire reminder alerts while it is closed. Tap the notification to open chat and deliver the message.'
							: 'Enable notifications above so scheduled reminders can alert you while the app is closed.'
						: canUseNotificationTriggers() && isStandaloneDisplayMode()
							? notificationPermission === 'granted'
								? 'This Android install can fire reminder alerts while the PWA is closed. Tap the notification or reopen the app to deliver the chat message.'
								: 'Enable notifications above to schedule background reminder alerts on Android.'
							: 'For reliable background reminders, install the Android app (Capacitor). In the browser, keep the app open for on-time delivery.'}
				</p>
			</section>

			<section className="surface-panel space-y-3 rounded-xl p-5">
				<h3 className="text-sm font-medium">Background replies</h3>
				<p className="text-sm text-muted-foreground">
					Chat keeps generating if you switch tabs. You will see an in-app banner
					while a reply is in progress. With notifications enabled, Android also
					shows a system tray alert when the reply is ready.
				</p>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-1">
						<div className="flex items-center gap-2">
							<RefreshCw className="h-5 w-5 text-primary" />
							<h3 className="text-sm font-medium">Changelog</h3>
						</div>
						<p className="text-sm text-muted-foreground">
							Current version:{' '}
							<span className="font-medium text-foreground">v{APP_VERSION}</span>
						</p>
					</div>
					<Button type="button" variant="outline" size="sm" onClick={downloadChangelogMarkdown}>
						<Download className="h-4 w-4" />
						Export changelog (.md)
					</Button>
				</div>
				<div className="max-h-[min(28rem,50vh)] space-y-3 overflow-y-auto overscroll-contain rounded-lg border border-border/60 p-3">
					{CHANGELOG.map((entry) => (
						<article
							key={entry.version}
							className="border-b border-border/50 pb-3 last:border-b-0 last:pb-0"
						>
							<div className="flex flex-wrap items-baseline justify-between gap-2">
								<h4 className="text-sm font-medium">v{entry.version}</h4>
								<time
									className="text-xs text-muted-foreground"
									dateTime={entry.releasedAt}
								>
									{formatChangelogDate(entry.releasedAt)}
								</time>
							</div>
							<p className="mt-0.5 text-xs text-muted-foreground">{entry.summary}</p>
							<ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-muted-foreground">
								{entry.changes.map((change) => (
									<li key={change}>{change}</li>
								))}
							</ul>
						</article>
					))}
				</div>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Sparkles className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">App reference for the AI</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					A comprehensive markdown guide describing how this app works — architecture,
					storage, tools, pages, and constraints. It is injected into the assistant&apos;s
					context on every chat message so the AI always knows how itself and the app work.
				</p>
				<Button type="button" variant="outline" onClick={downloadAppReferenceMarkdown}>
					<Download className="h-4 w-4" />
					Download app reference (.md)
				</Button>
			</section>

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<h3 className="text-sm font-medium">Codebase inspection</h3>
				<p className="text-sm text-muted-foreground">
					When enabled, the assistant can use read-only tools to list, read, and search
					bundled source files when you ask how something is implemented. It cannot
					modify code — only inspect the version shipped with this app.
				</p>
				<label className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm">
					<input
						type="checkbox"
						checked={allowCodebaseInspection}
						onChange={(event) =>
							onAllowCodebaseInspectionChange(event.target.checked)
						}
						className="mt-0.5"
					/>
					<span>
						<span className="block font-medium">Allow AI to inspect source code</span>
						<span className="mt-1 block text-muted-foreground">
							Ask in chat: &quot;How does document autosave work?&quot; or
							&quot;Show me the reminder scheduler code.&quot;
						</span>
					</span>
				</label>
			</section>
		</div>
	)
}

function TabIntro({
	title,
	description,
}: {
	title: string
	description: string
}) {
	return (
		<div>
			<h2 className="text-lg font-semibold">{title}</h2>
			<p className="mt-1 text-sm text-muted-foreground">{description}</p>
		</div>
	)
}

function FieldGroup({
	icon: Icon,
	label,
	hint,
	children,
}: {
	icon?: typeof UserRound
	label: string
	hint?: ReactNode
	children: ReactNode
}) {
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				{Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
				<label className="text-sm font-medium">{label}</label>
			</div>
			{hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
			{children}
		</div>
	)
}
