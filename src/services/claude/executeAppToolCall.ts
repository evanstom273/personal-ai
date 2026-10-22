import type Anthropic from '@anthropic-ai/sdk'
import {
	DOCUMENT_TOOL_DECLARATIONS,
	executeDocumentToolCall,
} from '@/services/claude/documentTools'
import {
	CODEBASE_TOOL_DECLARATIONS,
	executeCodebaseToolCall,
	isCodebaseToolName,
} from '@/services/claude/codebaseTools'
import {
	WEB_FETCH_MAX_CONTENT_TOKENS,
	WEB_FETCH_MAX_USES,
	WEB_SEARCH_MAX_USES,
} from '@/services/claude/constants'
import {
	executeProjectToolCall,
	isProjectToolName,
	PROJECT_TOOL_DECLARATIONS,
} from '@/services/projects/projectTools'
import {
	executeHomeTodoToolCall,
	HOME_TODO_TOOL_DECLARATIONS,
	isHomeTodoToolName,
} from '@/services/home/homeTodoTools'
import {
	executeMemoryToolCall,
	isMemoryToolName,
	MEMORY_TOOL_DECLARATIONS,
} from '@/services/memory/memoryTools'
import {
	executeReminderToolCall,
	isReminderToolName,
	REMINDER_TOOL_DECLARATIONS,
} from '@/services/reminders/reminderTools'
import type { PendingDeleteConfirmation } from '@/storage/types'
import type { MessageDocumentLink } from '@/storage/types'
import { extractDocumentLinkFromToolResult } from '@/utils/messageAttachments'

export interface AppToolCallResult {
	name: string
	response: Record<string, unknown>
	pendingDeleteConfirmation?: PendingDeleteConfirmation
	documentLink?: MessageDocumentLink
}

function approximateUserLocation(): Anthropic.UserLocation | undefined {
	const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
	return timezone && /^[A-Za-z]+\/[A-Za-z0-9_+\-/]+$/.test(timezone)
		? { type: 'approximate', timezone }
		: undefined
}

/**
 * Tools for the main chat, in a fixed order so the prompt cache stays valid.
 * Web search and fetch are Anthropic server tools: the API runs them and
 * returns results inline, so they never reach executeAppToolCall.
 */
export function buildChatTools(options: {
	webAccess: boolean
	allowCodebaseInspection: boolean
}): Anthropic.ToolUnion[] {
	const tools: Anthropic.ToolUnion[] = [
		...DOCUMENT_TOOL_DECLARATIONS,
		...PROJECT_TOOL_DECLARATIONS,
		...REMINDER_TOOL_DECLARATIONS,
		...HOME_TODO_TOOL_DECLARATIONS,
		...MEMORY_TOOL_DECLARATIONS,
		...(options.allowCodebaseInspection ? CODEBASE_TOOL_DECLARATIONS : []),
	]

	if (options.webAccess) {
		const userLocation = approximateUserLocation()
		tools.push(
			{
				type: 'web_search_20250305',
				name: 'web_search',
				max_uses: WEB_SEARCH_MAX_USES,
				...(userLocation ? { user_location: userLocation } : {}),
			},
			{
				type: 'web_fetch_20250910',
				name: 'web_fetch',
				max_uses: WEB_FETCH_MAX_USES,
				max_content_tokens: WEB_FETCH_MAX_CONTENT_TOKENS,
				citations: { enabled: true },
			},
		)
	}

	return tools
}

export async function executeAppToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<AppToolCallResult> {
	if (isCodebaseToolName(name)) {
		return executeCodebaseToolCall(name, args)
	}

	if (isReminderToolName(name)) {
		return executeReminderToolCall(name, args)
	}

	if (isProjectToolName(name)) {
		return executeProjectToolCall(name, args)
	}

	if (isHomeTodoToolName(name)) {
		return executeHomeTodoToolCall(name, args)
	}

	if (isMemoryToolName(name)) {
		return executeMemoryToolCall(name, args)
	}

	const toolResult = await executeDocumentToolCall(name, args)
	const documentLink = extractDocumentLinkFromToolResult(
		name,
		toolResult.response,
	)

	return {
		name: toolResult.name,
		response: toolResult.response,
		pendingDeleteConfirmation: toolResult.pendingDeleteConfirmation,
		documentLink: documentLink ?? undefined,
	}
}
