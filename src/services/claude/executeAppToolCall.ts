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
import { getCloudflareAvailability } from '@/services/cloudflare/client'
import { generateImageWithCloudflare } from '@/services/cloudflare/imageGeneration'
import type { MessageMedia, PendingDeleteConfirmation, UserPreferences } from '@/storage/types'
import type { MessageDocumentLink } from '@/storage/types'
import { extractDocumentLinkFromToolResult } from '@/utils/messageAttachments'

export interface AppToolCallResult {
	name: string
	response: Record<string, unknown>
	pendingDeleteConfirmation?: PendingDeleteConfirmation
	documentLink?: MessageDocumentLink
	generatedMedia?: MessageMedia
}

const IMAGE_TOOL: Anthropic.Tool = {
	name: 'generate_image',
	description:
		'Generate a 1024×1024 image with FLUX.1 [schnell] on Cloudflare. Only call this when the user explicitly asks you to create, draw, or generate an image. Write a detailed visual prompt in English (subject, style, lighting, composition).',
	input_schema: {
		type: 'object',
		properties: {
			prompt: { type: 'string', description: 'Detailed image description, under 2,000 characters.' },
		},
		required: ['prompt'],
	},
}

/** Image generation is offered only in the Android app with Cloudflare set up and enabled. */
export function isImageGenerationAvailable(preferences: UserPreferences): boolean {
	return preferences.cfImageGeneration && getCloudflareAvailability(preferences).ok
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
	imageGeneration: boolean
}): Anthropic.ToolUnion[] {
	const tools: Anthropic.ToolUnion[] = [
		...DOCUMENT_TOOL_DECLARATIONS,
		...PROJECT_TOOL_DECLARATIONS,
		...REMINDER_TOOL_DECLARATIONS,
		...HOME_TODO_TOOL_DECLARATIONS,
		...MEMORY_TOOL_DECLARATIONS,
		...(options.allowCodebaseInspection ? CODEBASE_TOOL_DECLARATIONS : []),
		...(options.imageGeneration ? [IMAGE_TOOL] : []),
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
	preferences: UserPreferences,
): Promise<AppToolCallResult> {
	if (name === IMAGE_TOOL.name) {
		const prompt = typeof args.prompt === 'string' ? args.prompt : ''
		try {
			const media = await generateImageWithCloudflare(preferences, prompt)
			return {
				name,
				response: {
					status: 'generated',
					size: '1024x1024',
					note: 'The image is shown to the user under your reply. You cannot see it, so do not describe details beyond the prompt.',
				},
				generatedMedia: media,
			}
		} catch (error) {
			return {
				name,
				response: { error: error instanceof Error ? error.message : 'Image generation failed.' },
			}
		}
	}

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
		return executeMemoryToolCall(name, args, preferences)
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
