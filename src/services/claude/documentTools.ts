import type Anthropic from '@anthropic-ai/sdk'
import {
	createDocument,
	deleteDocument,
	findDocumentByTitle,
	getDocument,
	listDocuments,
	renameDocument,
	resolveDocumentRef,
	updateDocument,
} from '@/services/documents/documentService'
import {
	htmlToMarkdown,
	htmlToPlainText,
	normalizeMarkdownContent,
} from '@/utils/documentContent'
import { truncateDocumentTextForTool } from '@/services/claude/documentContext'

export interface DocumentToolResult {
	name: string
	response: Record<string, unknown>
	pendingDeleteConfirmation?: {
		documentId: string
		documentTitle: string
	}
}

export const DOCUMENT_TOOL_DECLARATIONS = [
	{
		name: 'list_documents',
		description:
			'List documents in the shared library, optionally filtered by title search query.',
		input_schema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Optional case-insensitive title search filter.',
				},
			},
		},
	},
	{
		name: 'read_document',
		description:
			'Read the current content of a document by ID or exact title.',
		input_schema: {
			type: 'object',
			properties: {
				document_id: {
					type: 'string',
					description: 'Stable document ID if known.',
				},
				title: {
					type: 'string',
					description: 'Exact document title if ID is unknown.',
				},
			},
		},
	},
	{
		name: 'create_document',
		description: 'Create a new document in the shared library.',
		input_schema: {
			type: 'object',
			properties: {
				title: { type: 'string', description: 'Document title.' },
				content: {
					type: 'string',
					description:
						'Document body in Markdown (headings, lists, bold, links, code blocks).',
				},
			},
			required: ['title', 'content'],
		},
	},
	{
		name: 'update_document',
		description:
			'Update an existing document. Read it first when unsure of current content.',
		input_schema: {
			type: 'object',
			properties: {
				document_id: { type: 'string' },
				title: { type: 'string', description: 'Exact title if ID is unknown.' },
				content: {
					type: 'string',
					description: 'Replacement document body in Markdown.',
				},
				new_title: {
					type: 'string',
					description: 'Optional new title while updating content.',
				},
			},
		},
	},
	{
		name: 'rename_document',
		description: 'Rename an existing document.',
		input_schema: {
			type: 'object',
			properties: {
				document_id: { type: 'string' },
				title: { type: 'string', description: 'Current title if ID is unknown.' },
				new_title: { type: 'string', description: 'New document title.' },
			},
			required: ['new_title'],
		},
	},
	{
		name: 'delete_document',
		description:
			'Request deletion of a document. Requires user confirmation in the app before it is permanently removed.',
		input_schema: {
			type: 'object',
			properties: {
				document_id: { type: 'string' },
				title: { type: 'string', description: 'Exact title if ID is unknown.' },
			},
		},
	},
] satisfies Anthropic.Tool[]

export async function executeDocumentToolCall(
	name: string,
	args: Record<string, unknown>,
): Promise<DocumentToolResult> {
	switch (name) {
		case 'list_documents': {
			const query = typeof args.query === 'string' ? args.query : undefined
			const documents = await listDocuments(query)
			return {
				name,
				response: {
					documents: documents.map((document) => ({
						id: document.id,
						title: document.title,
						createdAt: document.createdAt,
						updatedAt: document.updatedAt,
					})),
				},
			}
		}
		case 'read_document': {
			const document = await resolveDocumentRef({
				documentId:
					typeof args.document_id === 'string' ? args.document_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!document) {
				return { name, response: { error: 'Document not found.' } }
			}

			const rawContent =
				document.contentFormat === 'markdown'
					? document.content
					: htmlToPlainText(document.content)
			const rawMarkdown =
				document.contentFormat === 'markdown'
					? document.content
					: htmlToMarkdown(document.content)
			const truncatedContent = truncateDocumentTextForTool(rawContent)
			const truncatedMarkdown = truncateDocumentTextForTool(rawMarkdown)

			return {
				name,
				response: {
					id: document.id,
					title: document.title,
					content: truncatedContent.text,
					markdown: truncatedMarkdown.text,
					truncated:
						truncatedContent.truncated || truncatedMarkdown.truncated,
					createdAt: document.createdAt,
					updatedAt: document.updatedAt,
					readOnly: document.readOnly,
				},
			}
		}
		case 'create_document': {
			const title = typeof args.title === 'string' ? args.title : 'Untitled document'
			const content =
				typeof args.content === 'string'
					? normalizeMarkdownContent(args.content)
					: ''
			const document = await createDocument(title, content, {
				source: 'assistant',
				contentFormat: 'markdown',
				readOnly: false,
			})
			return {
				name,
				response: {
					id: document.id,
					title: document.title,
					createdAt: document.createdAt,
					updatedAt: document.updatedAt,
				},
			}
		}
		case 'update_document': {
			const document = await resolveDocumentRef({
				documentId:
					typeof args.document_id === 'string' ? args.document_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!document) {
				return { name, response: { error: 'Document not found.' } }
			}

			if (document.readOnly) {
				return {
					name,
					response: {
						error:
							'This document is read-only and cannot be updated.',
					},
				}
			}

			const updated = await updateDocument(document.id, {
				title:
					typeof args.new_title === 'string' ? args.new_title : undefined,
				content:
					typeof args.content === 'string'
						? normalizeMarkdownContent(args.content)
						: undefined,
			})

			return {
				name,
				response: {
					id: updated.id,
					title: updated.title,
					updatedAt: updated.updatedAt,
				},
			}
		}
		case 'rename_document': {
			const newTitle =
				typeof args.new_title === 'string' ? args.new_title.trim() : ''
			if (!newTitle) {
				return { name, response: { error: 'new_title is required.' } }
			}

			const document = await resolveDocumentRef({
				documentId:
					typeof args.document_id === 'string' ? args.document_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!document) {
				return { name, response: { error: 'Document not found.' } }
			}

			const renamed = await renameDocument(document.id, newTitle)
			return {
				name,
				response: {
					id: renamed.id,
					title: renamed.title,
					updatedAt: renamed.updatedAt,
				},
			}
		}
		case 'delete_document': {
			const document = await resolveDocumentRef({
				documentId:
					typeof args.document_id === 'string' ? args.document_id : undefined,
				title: typeof args.title === 'string' ? args.title : undefined,
			})

			if (!document) {
				return { name, response: { error: 'Document not found.' } }
			}

			return {
				name,
				response: {
					status: 'confirmation_required',
					message:
						'Deletion requires user confirmation in the app before the document is permanently removed.',
					document_id: document.id,
					title: document.title,
				},
				pendingDeleteConfirmation: {
					documentId: document.id,
					documentTitle: document.title,
				},
			}
		}
		default:
			return { name, response: { error: `Unknown tool: ${name}` } }
	}
}

export async function confirmDocumentDeletion(documentId: string): Promise<boolean> {
	const document = await getDocument(documentId)
	if (!document) {
		return false
	}

	await deleteDocument(documentId)
	return true
}

export async function findDocumentCandidates(title: string) {
	return findDocumentByTitle(title)
}
