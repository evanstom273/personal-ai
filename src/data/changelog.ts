export const APP_VERSION = '3.1.0'

export interface ChangelogEntry {
	version: string
	releasedAt: string
	summary: string
	changes: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '3.1.0',
		releasedAt: '2026-10-22',
		summary: 'Cloudflare Workers AI extras',
		changes: [
			'Optional Cloudflare Workers AI integration (Settings → API) on the free daily allowance. It works in the Android app only, because Cloudflare blocks requests from web pages.',
			'Ask JARVIS for an image and it creates one with FLUX.1 [schnell]. Images appear in the chat, open full screen with a Download button, and are saved to Library → Images.',
			'Voice input can use Whisper Large V3 Turbo, which brings the mic back in the Android app. Conversation Mode keeps silence detection and the manual "done speaking" button.',
			'Read-aloud can use Cloudflare MeloTTS, and replies now have Pause/Resume next to Stop.',
			'Semantic memory: memories are searched by meaning, and near-duplicates are skipped when archiving.',
			'Settings → Usage shows Cloudflare requests, estimated neurons and remaining allowance separately from Claude. Features pause when the allowance runs out; paid inference is never used.',
		],
	},
	{
		version: '3.0.0',
		releasedAt: '2026-10-22',
		summary: 'Powered by Claude Haiku 5.5',
		changes: [
			'Chat, memory archiving, document AI, and the scratchpad now use Claude Haiku 5.5 through your own Anthropic API key. Gemini has been removed.',
			'Image, music, and video generation and the model pickers are gone. Uploading images, PDFs, text, and code files for Claude to read still works — PDFs are now read natively, including scanned pages.',
			'Web search and page reading use Anthropic\'s built-in tools, on by default, with numbered citations and a sources list under each reply. Toggle it from the + menu or Settings → API.',
			'Multiple conversations: create, switch, rename, and delete chats, with optional per-conversation instructions. Your existing chat is kept as one of them; imports are added as new conversations.',
			'Regenerate the latest reply; stopping a reply keeps what was written so far.',
			'New Settings → Usage tab: estimated cost per reply, daily and monthly totals, and optional local spending limits with warnings.',
			'Lower running costs: prompt caching, a leaner always-on context (older memories are searched on demand), capped web lookups, and image downscaling.',
			'Voice input and read-aloud now use your device\'s built-in speech features instead of a paid API.',
			'Existing conversations, documents, projects, reminders, and memories are kept. Old Gemini API keys and model settings are removed from storage.',
		],
	},
	{
		version: '2.1.5',
		releasedAt: '2026-08-12',
		summary: 'Paid and free API key slots',
		changes: [
			'Settings stores separate paid and free Gemini API keys with a dropdown to switch which one the app uses.',
			'Existing single-key setups migrate automatically into the paid key slot.',
		],
	},
	{
		version: '2.1.4',
		releasedAt: '2026-08-12',
		summary: 'Free-tier Flash-Lite chat models',
		changes: [
			'Chat model picker adds Gemini 3.5 Flash Lite and 3.1 Flash Lite — separate daily quotas for failover.',
			'Voice transcription, memory archival, and document AI follow your Flash-Lite chat model on free keys.',
		],
	},
	{
		version: '2.1.3',
		releasedAt: '2026-08-12',
		summary: 'Gemini API cost optimizations',
		changes: [
			'Chat system context is built once per message instead of on every tool step.',
			'Document library in chat is metadata and previews only — use read_document for full text.',
			'Chat history capped at 40 messages; project context and read_document responses are size-limited.',
			'Memory archival, transcription, document AI, and scratchpad always use Gemini 3.6 Flash.',
			'Codebase inspection off by default; default music model is Lyria Clip; tool loops capped at 5.',
			'TTS no longer double-bills when streaming partially succeeds; memory archival errors surface in Settings.',
		],
	},
	{
		version: '2.1.2',
		releasedAt: '2026-08-12',
		summary: 'Live document updates',
		changes: [
			'Documents refresh in the editor when the assistant updates them — no need to leave and reopen.',
		],
	},
	{
		version: '2.1.1',
		releasedAt: '2026-08-12',
		summary: 'Split-screen keeps chat pinned',
		changes: [
			'Dual-pane mode always keeps chat on the left; library, documents, projects, and settings open on the right.',
			'Opening a document from library in split-screen no longer replaces the chat pane.',
			'Bottom nav in split-screen routes secondary tabs to the right pane only.',
		],
	},
	{
		version: '2.0.12',
		releasedAt: '2026-08-12',
		summary: 'Dev Studio Qwen 3.6 Plus (free preview)',
		changes: [
			'New Dev Studio model: Qwen 3.6 Plus via OpenRouter free preview for coding only.',
			'OpenRouter API key setting under Settings → App → Dev Studio (main chat still uses Gemini).',
		],
	},
	{
		version: '2.0.11',
		releasedAt: '2026-08-12',
		summary: 'Fix dual-pane crash on wide screens',
		changes: [
			'Fix blank app on desktop/wide viewports caused by nested React Router in the secondary pane.',
		],
	},
	{
		version: '2.0.10',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio wall-clock safety',
		changes: [
			'Long agent runs show a warning after 5 minutes.',
			'Runs auto-stop after 15 minutes; staged changes are kept and Resume is available.',
		],
	},
	{
		version: '2.0.9',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio resilience and safety',
		changes: [
			'Tiered tool step limits: 64 (2.5 Flash), 128 (3.6 Flash), 256 (3.1 Pro).',
			'Task status badges on Diff — Ready, Drafting, or Incomplete with push guard.',
			'Resume task button when a run is stopped or hits the step limit.',
			'Optional auto-continue (up to 3 rounds) in Settings → App → Dev Studio.',
		],
	},
	{
		version: '2.0.8',
		releasedAt: '2026-08-11',
		summary: 'Fix GitHub Pages build',
		changes: [
			'Restore DevStudioModelSelector after a partial edit broke the TypeScript build.',
			'Tiered tool iteration limits (32 / 64 / 96) from #80 remain in place.',
		],
	},
	{
		version: '2.0.7',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio inline agent activity',
		changes: [
			'Agent reasoning and tool steps show inline in the chat stream instead of covering the composer.',
			'Capped scroll heights on reasoning and tool lists during long runs.',
		],
	},
	{
		version: '2.0.6',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio code agent upgrades',
		changes: [
			'Model selector in Dev Studio: 2.5 Flash (Haiku), 3.6 Flash default (Sonnet), 3.1 Pro deep (Opus).',
			'Live activity feed shows reasoning, tool steps, and an elapsed timer while the agent works.',
			'Stop button to cancel generation mid-task.',
			'Agent uses thinking mode and up to 20 tool iterations for more reliable multi-file edits.',
		],
	},
	{
		version: '2.0.5',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio merge feedback',
		changes: [
			'Git tab Merge button switches to Merged after a successful in-app merge.',
			'Recently merged PRs stay visible in the Git tab until you switch repositories.',
			'Last push card shows the same Merge / Merged state for the PR you just opened.',
			'Agent staging no longer jumps to Diff when a task finishes — stay on chat until you review.',
		],
	},
	{
		version: '2.0.3',
		releasedAt: '2026-08-11',
		summary: 'Auto-generated PR titles and commit messages',
		changes: [
			'Diff tab auto-suggests commit message and PR title from staged files and timestamp.',
			'Regenerate button refreshes suggestions; fields remain editable before push.',
			'Agent push_staged_changes can omit titles — they are auto-generated from staged edits.',
			'PR body lists each staged file with status and source (agent/user).',
		],
	},
	{
		version: '2.0.2',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio chat UX and PR actions',
		changes: [
			'Dev Studio chat uses the same scrolling, streaming, and markdown presentation as main chat.',
			'Agent PR tools: list, push staged changes, merge, and close pull requests.',
			'Merge button on open PRs in the Git tab.',
			'Clearer PAT permission errors when push or merge fails.',
		],
	},
	{
		version: '2.0.1',
		releasedAt: '2026-08-11',
		summary: 'Chat input newline on Enter',
		changes: [
			'Pressing Enter in chat inserts a new line instead of sending.',
			'Use the send button to submit messages (physical and mobile keyboards).',
		],
	},
	{
		version: '2.0.0',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio v2 — IDE, agent tools, push & PR',
		changes: [
			'CodeMirror IDE: open files from the tree, edit, and stage changes.',
			'Gemini code agent with workspace tools: list, read, search, and stage files.',
			'Real staged diff review with before/after panels.',
			'Push staged changes via GitHub Git API: new branch, commit, and open PR.',
			'IndexedDB persistence for staged changes, file SHAs, and chat per repo.',
			'Editor tab on mobile and wide layout; Diff tab for review before push.',
		],
	},
	{
		version: '1.9.2',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio repo list fixes',
		changes: [
			'Newly created repos appear in the header dropdown immediately.',
			'Repo list retries after create so GitHub indexing lag is handled.',
			'Empty repos connect with a helpful notice instead of failing silently.',
			'Refresh reloads both workspace and repository list.',
		],
	},
	{
		version: '1.9.1',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio repo picker & create',
		changes: [
			'Repository dropdown in Settings and Dev Studio header.',
			'Switch repos from the header without opening Settings.',
			'Create new GitHub repositories from Dev Studio (+ in header).',
			'GitHub rate limit shows remaining calls and hourly reset time.',
		],
	},
	{
		version: '1.9.0',
		releasedAt: '2026-08-11',
		summary: 'Dev Studio scaffold',
		changes: [
			'New Dev tab with Cursor-style split layout on wide screens.',
			'Mobile tabs for Chat, Diff, Files, and Git.',
			'GitHub PAT and repository settings for workspace hydration.',
			'Repository dropdown loads all repos your token can access.',
			'Switch repos from the Dev Studio header dropdown.',
			'Create new GitHub repositories from Dev Studio (+ button in header).',
			'Repository file tree and open PR list via GitHub REST API.',
			'Staged diff review UI scaffold with sample change preview.',
		],
	},
	{
		version: '1.8.0',
		releasedAt: '2026-08-11',
		summary: 'Scratchpad & document templates',
		changes: [
			'Global scratchpad for quick capture from any tab, with auto-save.',
			'Scratchpad actions: organise into document, convert to project tasks, save draft, clear with undo.',
			'Document template picker when creating new documents in Library.',
			'Built-in templates for GDD, planning, daily check-in, research, and meeting notes.',
			'Save any document as a reusable custom template.',
		],
	},
	{
		version: '1.7.0',
		releasedAt: '2026-08-11',
		summary: 'Home dashboard & conversation pauses',
		changes: [
			'Home tab: todos, upcoming reminders, ongoing projects, and recent documents.',
			'Home todo list with daily review reminder linked to Schedule.',
			'AI tools to list, add, update, and replace home todos from chat.',
			'Conversation Mode waits longer for natural pauses before sending.',
			'Fixed @ document mention menu being clipped in chat input.',
			'Conversation Mode: Done speaking button to send without waiting for silence.',
		],
	},
	{
		version: '1.6.6',
		releasedAt: '2026-08-11',
		summary: 'Conversation Mode only',
		changes: [
			'Removed Live Mode (headphones); kept hands-free Conversation Mode (phone icon).',
		],
	},
	{
		version: '1.6.5',
		releasedAt: '2026-08-11',
		summary: 'Voice mode fixes',
		changes: [
			'Fixed Conversation Mode staying on Idle after mic permission.',
			'Fixed Live Mode stuck on Connecting (removed in 1.6.6).',
		],
	},
	{
		version: '1.6.4',
		releasedAt: '2026-08-11',
		summary: 'Chat layout restored',
		changes: [
			'Restored call icons without breaking chat layout.',
			'Reverted chat UI regressions and removed swipe fade opacity.',
		],
	},
	{
		version: '1.6.3',
		releasedAt: '2026-08-11',
		summary: 'Android black screen fixes',
		changes: [
			'Fixed chat window going blank on Android PWA after voice mode work.',
		],
	},
	{
		version: '1.6.2',
		releasedAt: '2026-08-11',
		summary: 'Chat header declutter',
		changes: [
			'Combined import/export/delete into a dropdown menu.',
			'Moved model selector to the + attach menu only.',
		],
	},
	{
		version: '1.6.1',
		releasedAt: '2026-08-11',
		summary: 'Voice UX polish',
		changes: [
			'Phone and headphones icons in the chat header with start confirmations.',
		],
	},
	{
		version: '1.6.0',
		releasedAt: '2026-08-11',
		summary: 'Voice conversation',
		changes: [
			'Added Conversation Mode (STT → chat → TTS loop) and Gemini Live sessions.',
		],
	},
	{
		version: '1.5.4',
		releasedAt: '2026-08-11',
		summary: 'Personalized images',
		changes: ['Image generation now uses memory and profile context for likeness.'],
	},
	{
		version: '1.5.3',
		releasedAt: '2026-08-11',
		summary: 'Music intent routing',
		changes: ['Fixed natural-language prompts routing to music generation.'],
	},
	{
		version: '1.5.2',
		releasedAt: '2026-08-11',
		summary: 'Image generation fix',
		changes: ['Removed unsupported personGeneration field breaking image API calls.'],
	},
	{
		version: '1.5.1',
		releasedAt: '2026-08-11',
		summary: 'Memory tab actions',
		changes: ['Clear memory and manual archive buttons in Settings → Memory.'],
	},
	{
		version: '1.5.0',
		releasedAt: '2026-08-11',
		summary: 'App reference & codebase tools',
		changes: [
			'Injected app reference doc into AI context.',
			'Read-only codebase inspection tools for the assistant.',
		],
	},
	{
		version: '1.4.2',
		releasedAt: '2026-08-10',
		summary: 'Document toolbar',
		changes: ['Moved document editor toolbar to the bottom above the nav dock.'],
	},
	{
		version: '1.4.1',
		releasedAt: '2026-08-10',
		summary: 'Silent autosave',
		changes: [
			'Documents and kanban tasks save silently without UI flicker.',
		],
	},
	{
		version: '1.4.0',
		releasedAt: '2026-08-10',
		summary: 'Document editor AI',
		changes: [
			'Richer document formatting and inline AI writing assistance in the editor.',
		],
	},
	{
		version: '1.3.2',
		releasedAt: '2026-08-10',
		summary: 'Kanban auto-save',
		changes: ['Kanban task edits save automatically without a Save button.'],
	},
	{
		version: '1.3.1',
		releasedAt: '2026-08-10',
		summary: 'Kanban UX',
		changes: [
			'Vertical columns with drag-and-drop.',
			'Reversed swipe direction and fade transition on page navigation.',
		],
	},
	{
		version: '1.3.0',
		releasedAt: '2026-08-10',
		summary: 'Projects kanban',
		changes: ['Kanban project boards and swipe navigation between main tabs.'],
	},
	{
		version: '1.2.0',
		releasedAt: '2026-08-10',
		summary: 'Android app',
		changes: [
			'Capacitor Android build.',
			'One-shot reminders delete themselves after firing.',
		],
	},
	{
		version: '1.1.3',
		releasedAt: '2026-08-10',
		summary: 'PWA auto-update',
		changes: ['PWA picks up new deploys immediately via service worker update.'],
	},
	{
		version: '1.1.2',
		releasedAt: '2026-08-10',
		summary: 'Chat input polish',
		changes: [
			'Auto-expanding message input and simplified placeholder.',
			'Fixed chat scroll during streaming and position across tabs.',
			'GitHub Pages deploy fallback.',
		],
	},
	{
		version: '1.1.1',
		releasedAt: '2026-08-10',
		summary: 'Background reminders',
		changes: ['PWA background reminder notifications via Notification Triggers.'],
	},
	{
		version: '1.1.0',
		releasedAt: '2026-08-10',
		summary: 'Reminders & schedule',
		changes: [
			'Reminders and schedule in Library with chat tools and notifications.',
		],
	},
	{
		version: '1.0.0',
		releasedAt: '2026-08-10',
		summary: 'UI overhaul',
		changes: [
			'Bottom navigation, glass/texture theme, floating nav island.',
			'Tabbed Settings (Profile, Memory, API, Voice, App).',
		],
	},
	{
		version: '0.10.2',
		releasedAt: '2026-08-10',
		summary: 'TTS playback fix',
		changes: ['Fixed TTS silently aborting after the API returned audio.'],
	},
	{
		version: '0.10.1',
		releasedAt: '2026-08-10',
		summary: 'Gemini TTS',
		changes: ['Text-to-speech for assistant replies with streaming playback.'],
	},
	{
		version: '0.10.0',
		releasedAt: '2026-08-10',
		summary: 'Edit & resend',
		changes: [
			'Edit and resend user messages.',
			'Preserve typed text during voice input.',
		],
	},
	{
		version: '0.9.1',
		releasedAt: '2026-08-10',
		summary: 'ZIP chat export',
		changes: ['Export chat as ZIP with separate media files instead of inline base64.'],
	},
	{
		version: '0.9.0',
		releasedAt: '2026-08-10',
		summary: 'Chat export v2',
		changes: [
			'Deduplicated media in chat export format.',
			'Export filename uses export time, not conversation updatedAt.',
		],
	},
	{
		version: '0.8.3',
		releasedAt: '2026-08-10',
		summary: 'Mobile drawer fixes',
		changes: [
			'Drawer overlays header correctly with accurate nav state.',
			'Prevented chat content overflowing viewport width on mobile.',
		],
	},
	{
		version: '0.8.2',
		releasedAt: '2026-08-10',
		summary: 'Editable uploads',
		changes: ['Uploaded documents editable by user and AI.'],
	},
	{
		version: '0.8.1',
		releasedAt: '2026-08-10',
		summary: 'PDF extraction',
		changes: ['Preserve PDF structure and fix ligatures in document extraction.'],
	},
	{
		version: '0.8.0',
		releasedAt: '2026-08-10',
		summary: 'PDF upload',
		changes: ['PDF uploads in chat document attach.'],
	},
	{
		version: '0.7.1',
		releasedAt: '2026-08-10',
		summary: 'Multi-select uploads',
		changes: ['Multi-select for image and document uploads in chat.'],
	},
	{
		version: '0.7.0',
		releasedAt: '2026-08-10',
		summary: 'Mature content & mobile nav',
		changes: [
			'Mature language toggle and relaxed Gemini safety filters.',
			'Chat button and drawer swipe for mobile navigation.',
		],
	},
	{
		version: '0.6.5',
		releasedAt: '2026-08-10',
		summary: 'Android transcription',
		changes: [
			'Gemini transcription for Android voice input.',
			'Block mic button while transcription is in progress.',
		],
	},
	{
		version: '0.6.4',
		releasedAt: '2026-08-10',
		summary: 'Video removed',
		changes: ['Removed video generation (Veo) from the app.'],
	},
	{
		version: '0.6.3',
		releasedAt: '2026-08-10',
		summary: 'Conversational routing',
		changes: [
			'Route conversational follow-ups to generation with context.',
			'Full-screen library media viewer.',
		],
	},
	{
		version: '0.6.2',
		releasedAt: '2026-08-10',
		summary: 'Background generation',
		changes: [
			'Background chat generation with completion notices.',
			'Android system notifications via service worker.',
			'Inline media previews in chat.',
		],
	},
	{
		version: '0.6.1',
		releasedAt: '2026-08-10',
		summary: 'Android STT',
		changes: [
			'Android speech-to-text reliability improvements.',
			'Removed duplicate thinking indicator during streaming.',
		],
	},
	{
		version: '0.6.0',
		releasedAt: '2026-08-10',
		summary: 'Streaming chat',
		changes: ['Stream chat responses and add date/time awareness.'],
	},
	{
		version: '0.5.1',
		releasedAt: '2026-08-10',
		summary: 'Memory system',
		changes: [
			'Story Engine–style memory archival and Memory index.',
			'Full document library injected into AI context on every message.',
		],
	},
	{
		version: '0.5.0',
		releasedAt: '2026-08-10',
		summary: 'Markdown documents',
		changes: [
			'Read-only uploads, markdown documents, AI markdown output.',
		],
	},
	{
		version: '0.4.2',
		releasedAt: '2026-08-10',
		summary: 'Mobile polish',
		changes: [
			'Mobile spacing, chat import/export, document formats.',
			'PWA menu, speech input, and mobile scale fixes.',
			'Image request routing and clear chat.',
		],
	},
	{
		version: '0.4.1',
		releasedAt: '2026-08-10',
		summary: 'Android chat bar',
		changes: ['Keep chat input visible on Android PWA.'],
	},
	{
		version: '0.4.0',
		releasedAt: '2026-08-10',
		summary: 'Model pickers',
		changes: ['Per-category model pickers in the + attach menu.'],
	},
	{
		version: '0.3.1',
		releasedAt: '2026-08-10',
		summary: 'Web search',
		changes: ['Optional Google Search grounding for chat.'],
	},
	{
		version: '0.3.0',
		releasedAt: '2026-08-10',
		summary: 'Attach menu & library',
		changes: [
			'+ attach menu, generation modes, PWA safe-area input.',
			'Unified Library for documents, images, music, and videos.',
		],
	},
	{
		version: '0.2.2',
		releasedAt: '2026-08-10',
		summary: 'Markdown chat UI',
		changes: ['ChatGPT-style markdown chat messages with copy/select.'],
	},
	{
		version: '0.2.1',
		releasedAt: '2026-08-10',
		summary: 'Image routing',
		changes: ['Image generation intent routing and per-message copy.'],
	},
	{
		version: '0.2.0',
		releasedAt: '2026-08-10',
		summary: 'Documents & identity',
		changes: [
			'Shared documents library, Gemini document tools, identity settings.',
			'@ document mention picker in chat input.',
		],
	},
	{
		version: '0.1.1',
		releasedAt: '2026-08-10',
		summary: 'Transcript fixes',
		changes: [
			'User messages appear in transcript.',
			'Viewport anchoring improvements.',
			'Single chat thread, drawer nav, intent-based generation.',
		],
	},
	{
		version: '0.1.0',
		releasedAt: '2026-08-10',
		summary: 'Personal AI launch',
		changes: [
			'Gemini BYOK chat dashboard with PWA and IndexedDB storage.',
		],
	},
	{
		version: '0.0.5',
		releasedAt: '2026-07-31',
		summary: 'Dashboard widgets (abandoned)',
		changes: ['Edit dashboard mode, dense grid layout, and widget identity.'],
	},
	{
		version: '0.0.4',
		releasedAt: '2026-07-31',
		summary: 'Dashboard theme (abandoned)',
		changes: ['Dark #101010 base with gold accents.'],
	},
	{
		version: '0.0.3',
		releasedAt: '2026-07-31',
		summary: 'Dashboard PWA (abandoned)',
		changes: ['PWA manifest and service worker for widget dashboard.'],
	},
	{
		version: '0.0.2',
		releasedAt: '2026-07-31',
		summary: 'Dashboard scaffold (abandoned)',
		changes: ['Modular personal dashboard foundation.'],
	},
	{
		version: '0.0.1',
		releasedAt: '2026-07-31',
		summary: 'Initial commit',
		changes: ['Repository created.'],
	},
]

export function formatChangelogDate(isoDate: string): string {
	const [year, month, day] = isoDate.split('-').map(Number)
	const date = new Date(year!, month! - 1, day)
	return date.toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	})
}

export function formatChangelogMarkdown(): string {
	const lines = [
		'# Personal AI Changelog',
		'',
		`Current version: **v${APP_VERSION}**`,
		'',
	]

	for (const entry of CHANGELOG) {
		lines.push(`## v${entry.version} — ${formatChangelogDate(entry.releasedAt)}`)
		lines.push('')
		lines.push(`*${entry.summary}*`)
		lines.push('')
		for (const change of entry.changes) {
			lines.push(`- ${change}`)
		}
		lines.push('')
	}

	return lines.join('\n').trimEnd() + '\n'
}

export function formatAppVersionLabel(): string {
	return `v${APP_VERSION}`
}
