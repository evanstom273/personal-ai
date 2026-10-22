import { completeText } from '@/services/claude/complete'
import {
	buildSystemInstruction,
	getConfiguredAiName,
	getConfiguredUserName,
} from '@/services/claude/systemInstruction'
import type { UserPreferences } from '@/storage/types'

export type DocumentWritingAction =
	| 'expand'
	| 'rewrite'
	| 'shorten'
	| 'clarify'
	| 'continue'
	| 'custom'

export interface DocumentWritingRequest {
	apiKey: string
	preferences: UserPreferences
	documentTitle: string
	selectedText: string
	contextBefore: string
	contextAfter: string
	action: DocumentWritingAction
	customInstruction?: string
}

function buildActionInstruction(
	action: DocumentWritingAction,
	customInstruction?: string,
): string {
	switch (action) {
		case 'expand':
			return 'Expand the focus text with additional useful detail while preserving its original meaning, tone, and context.'
		case 'rewrite':
			return 'Rewrite the focus text while preserving its intended meaning and tone.'
		case 'shorten':
			return 'Make the focus text more concise without losing important information.'
		case 'clarify':
			return 'Improve clarity and readability while preserving the original content and facts.'
		case 'continue':
			return 'Continue writing naturally from the preceding document content. Do not repeat what already exists. Write only the new continuation text.'
		case 'custom':
			return customInstruction?.trim() || 'Improve the focus text.'
		default:
			return 'Improve the focus text.'
	}
}

function buildDocumentWritingPrompt(request: DocumentWritingRequest): string {
	const actionInstruction = buildActionInstruction(
		request.action,
		request.customInstruction,
	)

	const sections = [
		`Document title: ${request.documentTitle}`,
		request.contextBefore
			? `Content before the focus:\n${request.contextBefore}`
			: 'Content before the focus: (start of document)',
		request.action === 'continue'
			? 'Focus: continue from the end of the preceding content.'
			: request.selectedText
				? `Focus text to edit:\n${request.selectedText}`
				: 'Focus text: (cursor position — continue writing)',
		request.contextAfter && request.action !== 'continue'
			? `Content after the focus:\n${request.contextAfter}`
			: null,
		`Instruction: ${actionInstruction}`,
		'Return only the replacement or continuation text.',
		'Do not include explanations, labels, quotes, markdown code fences, or commentary.',
		'Match the document tone and formatting style.',
		request.action === 'continue'
			? 'Output only the new text to append.'
			: 'Output only the revised version of the focus text.',
	]

	return sections.filter(Boolean).join('\n\n')
}

export async function generateDocumentWritingSuggestion(
	request: DocumentWritingRequest,
): Promise<string> {
	const systemInstruction = [
		buildSystemInstruction(request.preferences),
		`You are helping ${getConfiguredUserName(request.preferences)} edit a document titled "${request.documentTitle}".`,
		`${getConfiguredAiName(request.preferences)} writing assistant mode: produce direct document text only.`,
	].join('\n\n')

	const text = await completeText({
		apiKey: request.apiKey,
		preferences: request.preferences,
		feature: 'documents',
		system: systemInstruction,
		prompt: buildDocumentWritingPrompt(request),
	})

	return text.replace(/^```[\w]*\n?|\n?```$/g, '').trim()
}

export function extractDocumentContextSlices(
	fullText: string,
	selectionStart: number,
	selectionEnd: number,
	maxBefore = 4000,
	maxAfter = 1200,
): {
	selectedText: string
	contextBefore: string
	contextAfter: string
} {
	const selectedText = fullText.slice(selectionStart, selectionEnd).trim()
	const before = fullText.slice(0, selectionStart).trim()
	const after = fullText.slice(selectionEnd).trim()

	return {
		selectedText,
		contextBefore: before.length > maxBefore ? before.slice(-maxBefore) : before,
		contextAfter: after.length > maxAfter ? after.slice(0, maxAfter) : after,
	}
}
