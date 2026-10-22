import { completeJson } from '@/services/claude/complete'
import {
	buildSystemInstruction,
	getConfiguredUserName,
} from '@/services/claude/systemInstruction'
import type { UserPreferences } from '@/storage/types'

export interface OrganizedScratchpadDocument {
	title: string
	content: string
}

export interface ExtractedScratchpadTasks {
	projectTitle: string
	tasks: Array<{ title: string; note?: string }>
}

const ORGANIZED_DOCUMENT_SCHEMA = {
	type: 'object',
	properties: {
		title: { type: 'string' },
		content: { type: 'string' },
	},
	required: ['title', 'content'],
	additionalProperties: false,
}

const EXTRACTED_TASKS_SCHEMA = {
	type: 'object',
	properties: {
		projectTitle: { type: 'string' },
		tasks: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					title: { type: 'string' },
					note: { type: 'string' },
				},
				required: ['title', 'note'],
				additionalProperties: false,
			},
		},
	},
	required: ['projectTitle', 'tasks'],
	additionalProperties: false,
}

async function generateScratchpadJson<T>(
	request: {
		apiKey: string
		preferences: UserPreferences
		prompt: string
		schema: Record<string, unknown>
	},
): Promise<T> {
	const systemInstruction = [
		buildSystemInstruction(request.preferences),
		`You help ${getConfiguredUserName(request.preferences)} organize quick-capture scratchpad notes.`,
	].join('\n\n')

	return completeJson<T>({
		apiKey: request.apiKey,
		preferences: request.preferences,
		feature: 'scratchpad',
		system: systemInstruction,
		prompt: request.prompt,
		schema: request.schema,
	})
}

export async function organizeScratchpadIntoDocument(request: {
	apiKey: string
	preferences: UserPreferences
	rawText: string
}): Promise<OrganizedScratchpadDocument> {
	const rawText = request.rawText.trim()
	if (!rawText) {
		throw new Error('Scratchpad is empty.')
	}

	const prompt = [
		'Turn the following raw scratchpad notes into a structured Markdown document.',
		'Use clear headings, bullet lists, and short paragraphs where appropriate.',
		'Preserve all important details; do not invent facts.',
		'Give the document a short title. The content field must be Markdown only.',
		'',
		'Scratchpad notes:',
		rawText,
	].join('\n')

	const parsed = await generateScratchpadJson<{
		title?: string
		content?: string
	}>({
		apiKey: request.apiKey,
		preferences: request.preferences,
		prompt,
		schema: ORGANIZED_DOCUMENT_SCHEMA,
	})

	const title = parsed.title?.trim() || 'Organized notes'
	const content = parsed.content?.trim()
	if (!content) {
		throw new Error('AI did not return document content.')
	}

	return { title, content }
}

export async function extractScratchpadTasks(request: {
	apiKey: string
	preferences: UserPreferences
	rawText: string
}): Promise<ExtractedScratchpadTasks> {
	const rawText = request.rawText.trim()
	if (!rawText) {
		throw new Error('Scratchpad is empty.')
	}

	const prompt = [
		'Extract actionable tasks from the following scratchpad notes.',
		'Infer a short project title that groups these tasks.',
		'Each task title should be a concise action item. Use an empty note when there is nothing to add.',
		'Include at least one task when any action is implied.',
		'',
		'Scratchpad notes:',
		rawText,
	].join('\n')

	const parsed = await generateScratchpadJson<{
		projectTitle?: string
		tasks?: Array<{ title?: string; note?: string }>
	}>({
		apiKey: request.apiKey,
		preferences: request.preferences,
		prompt,
		schema: EXTRACTED_TASKS_SCHEMA,
	})

	const tasks = (parsed.tasks ?? [])
		.map((task) => ({
			title: task.title?.trim() ?? '',
			note: task.note?.trim() || undefined,
		}))
		.filter((task) => task.title.length > 0)

	if (tasks.length === 0) {
		throw new Error('No tasks could be extracted from the scratchpad.')
	}

	return {
		projectTitle: parsed.projectTitle?.trim() || 'Scratchpad tasks',
		tasks,
	}
}
