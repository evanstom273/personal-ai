export const MAIN_CONVERSATION_ID = 'main'

/** The only model this app uses. */
export const CLAUDE_MODEL_ID = 'claude-haiku-5-5'
export const CLAUDE_MODEL_NAME = 'Claude Haiku 5.5'

/** Most recent unarchived messages sent with each chat request. */
export const MAX_CHAT_HISTORY_MESSAGES = 40
/** Rough character budget for replayed chat history (about 15K tokens). */
export const MAX_CHAT_HISTORY_CHARS = 60_000
/** Only the most recent user messages carry their images and files; older ones get a placeholder. */
export const MAX_MESSAGES_WITH_ATTACHMENTS = 6

/** Client-tool round trips per reply. Each one is a separate API request. */
export const MAX_TOOL_ITERATIONS = 6
/** Server-side pause_turn continuations allowed per reply. */
export const MAX_PAUSE_CONTINUATIONS = 2
export const MAX_CHAT_OUTPUT_TOKENS = 16_000
export const MAX_BACKGROUND_OUTPUT_TOKENS = 4_096

/** Per-request caps on Anthropic's server-side web tools. */
export const WEB_SEARCH_MAX_USES = 5
export const WEB_FETCH_MAX_USES = 3
export const WEB_FETCH_MAX_CONTENT_TOKENS = 16_000

/** Attachment limits, kept well inside the API's 32 MB request cap. */
export const MAX_PDF_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const MAX_PDF_ATTACHMENT_PAGES = 40
export const MAX_TEXT_ATTACHMENT_CHARS = 60_000
export const MAX_IMAGE_PIXELS = 1_150_000
export const MAX_IMAGE_EDGE_PX = 1_568
