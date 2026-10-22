import { listDocuments } from '@/services/documents/documentService'
import type { DocumentRecord } from '@/storage/types'
import {
	htmlToMarkdown,
	normalizeDocumentRecord,
} from '@/utils/documentContent'
import { buildAppReferenceContext } from '@/services/claude/appReferenceContext'
import { buildMemoryContextFromStore } from '@/services/claude/memoryContext'
import { buildProjectContextFromStore } from '@/services/claude/projectContext'
import { buildScheduleContextFromStore } from '@/services/claude/scheduleContext'
import {
	buildChatCapabilitiesInstruction,
	buildSystemInstruction,
} from '@/services/claude/systemInstruction'
import type { ConversationRecord, UserPreferences } from '@/storage/types'
import { formatCurrentDateContext } from '@/utils/dateTime'

const MAX_READ_DOCUMENT_CHARS = 12_000
const MAX_CATALOG_PREVIEW_CHARS = 140
const MAX_TOTAL_CATALOG_CHARS = 12_000

export function truncateDocumentTextForTool(text: string): {
	text: string
	truncated: boolean
} {
	if (text.length <= MAX_READ_DOCUMENT_CHARS) {
		return { text, truncated: false }
	}

	return {
		text: `${text.slice(0, MAX_READ_DOCUMENT_CHARS)}\n\n[Document truncated for context length. Use read_document with line ranges if needed.]`,
		truncated: true,
	}
}

function documentBodyForContext(document: DocumentRecord): string {
	if (document.contentFormat === 'markdown') {
		return document.content
	}

	return htmlToMarkdown(document.content)
}

function formatDocumentCatalogEntry(document: DocumentRecord): string {
	const normalized = normalizeDocumentRecord(document)
	const body = documentBodyForContext(normalized)
	const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0
	const preview = body.replace(/\s+/g, ' ').trim().slice(0, MAX_CATALOG_PREVIEW_CHARS)
	const accessLabel =
		normalized.source === 'upload' ? 'uploaded' : normalized.source

	return `- **${normalized.title}** (id: ${normalized.id}, ${accessLabel}, ${normalized.contentFormat}, ~${wordCount} words, updated ${new Date(normalized.updatedAt).toISOString()}): ${preview}${body.length > MAX_CATALOG_PREVIEW_CHARS ? '…' : ''}`
}

export function buildDocumentLibraryContext(
	documents: DocumentRecord[],
): string {
	if (documents.length === 0) {
		return [
			'## Document library catalog',
			'',
			'No documents yet. Use document tools to create one.',
		].join('\n')
	}

	const sorted = [...documents].sort((a, b) => b.updatedAt - a.updatedAt)
	const entries: string[] = []
	let totalChars = 0
	let omittedCount = 0

	for (const document of sorted) {
		const entry = formatDocumentCatalogEntry(document)
		if (totalChars + entry.length > MAX_TOTAL_CATALOG_CHARS) {
			omittedCount += 1
			continue
		}

		entries.push(entry)
		totalChars += entry.length
	}

	const header = [
		'## Document library catalog',
		'',
		'Metadata and short previews only — use read_document for full text before editing.',
		'',
	].join('\n')

	const omittedNote =
		omittedCount > 0
			? `\n\n_${omittedCount} additional document${omittedCount === 1 ? '' : 's'} omitted from the catalog. Use list_documents to see titles._`
			: ''

	return `${header}${entries.join('\n')}${omittedNote}`
}

export interface ChatSystemPrompt {
	/** Persona, capabilities, and app reference. Changes only when settings change. */
	stable: string
	/** Today's date, memory, and library catalogs. Changes when the user's data does. */
	context: string
}

/**
 * Builds the chat system prompt in two cacheable parts. The current time is not
 * included here (each user message carries its own timestamp), so the prompt
 * cache survives from one message to the next.
 */
export async function buildFullSystemInstruction(
	preferences: UserPreferences,
	conversation?: Pick<ConversationRecord, 'title' | 'instructions'> | null,
): Promise<ChatSystemPrompt> {
	const [documents, memoryContext, scheduleContext, projectContext] =
		await Promise.all([
			listDocuments(),
			buildMemoryContextFromStore(),
			buildScheduleContextFromStore(),
			buildProjectContextFromStore(),
		])

	const stable = [
		buildSystemInstruction(preferences),
		buildChatCapabilitiesInstruction(),
		buildAppReferenceContext(),
	].join('\n\n')

	const conversationInstructions = conversation?.instructions?.trim()
	const contextSections = [
		`Today's date: ${formatCurrentDateContext()}.`,
		conversationInstructions
			? [
					`## Instructions for this conversation ("${conversation?.title ?? 'Chat'}")`,
					'',
					conversationInstructions,
				].join('\n')
			: null,
		memoryContext,
		scheduleContext,
		projectContext,
		buildDocumentLibraryContext(documents),
	].filter((section): section is string => Boolean(section))

	return { stable, context: contextSections.join('\n\n') }
}
