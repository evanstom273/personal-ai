import type Anthropic from '@anthropic-ai/sdk'
import {
	addMemoryEntries,
	isMemoryCategory,
	listMemoryEntries,
} from '@/services/memory/memoryService'
import {
	filterDuplicateMemories,
	isSemanticMemoryAvailable,
	searchMemorySemantically,
} from '@/services/memory/semanticMemory'
import type { MemoryEntry, UserPreferences } from '@/storage/types'

const MAX_SEARCH_RESULTS = 15

export interface MemoryToolResult {
	name: string
	response: Record<string, unknown>
}

export const MEMORY_TOOL_DECLARATIONS = [
	{
		name: 'search_memory',
		description:
			"Search the user's saved long-term memory for facts that are not shown in the memory section of the system prompt.",
		input_schema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Keywords to look for, e.g. "allergies" or "sister birthday".',
				},
				category: {
					type: 'string',
					description: 'Optional filter: preference, fact, project, decision, or other.',
				},
			},
			required: ['query'],
		},
	},
	{
		name: 'save_memory',
		description:
			'Save a durable fact to long-term memory. Only use this when the user explicitly asks you to remember something.',
		input_schema: {
			type: 'object',
			properties: {
				content: {
					type: 'string',
					description: 'The fact to remember, written as a short standalone sentence.',
				},
				category: {
					type: 'string',
					description: 'One of: preference, fact, project, decision, other.',
				},
			},
			required: ['content'],
		},
	},
] satisfies Anthropic.Tool[]

const MEMORY_TOOL_NAMES = new Set<string>(
	MEMORY_TOOL_DECLARATIONS.map((tool) => tool.name),
)

export function isMemoryToolName(name: string): boolean {
	return MEMORY_TOOL_NAMES.has(name)
}

function scoreEntry(entry: MemoryEntry, terms: string[]): number {
	const haystack = entry.content.toLowerCase()
	let score = 0
	for (const term of terms) {
		if (haystack.includes(term)) {
			score += term.length > 3 ? 2 : 1
		}
	}
	return score
}

export async function executeMemoryToolCall(
	name: string,
	args: Record<string, unknown>,
	preferences: UserPreferences,
): Promise<MemoryToolResult> {
	switch (name) {
		case 'search_memory': {
			const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : ''
			const category = typeof args.category === 'string' ? args.category : ''
			const terms = query.split(/\s+/).filter((term) => term.length > 1)
			if (terms.length === 0) {
				return { name, response: { error: 'query is required.' } }
			}

			if (isSemanticMemoryAvailable(preferences)) {
				try {
					const semantic = await searchMemorySemantically(
						preferences,
						typeof args.query === 'string' ? args.query : query,
						MAX_SEARCH_RESULTS,
					)
					return {
						name,
						response: {
							query,
							search: 'semantic',
							matches: semantic
								.filter(({ entry }) => !category || entry.category === category)
								.map(({ entry, score }) => ({
									content: entry.content,
									category: entry.category,
									relevance: Math.round(score * 100) / 100,
									saved_at: new Date(entry.createdAt).toISOString(),
								})),
						},
					}
				} catch {
					// Fall back to keyword search below.
				}
			}

			const entries = await listMemoryEntries()
			const matches = entries
				.filter((entry) => !category || entry.category === category)
				.map((entry) => ({ entry, score: scoreEntry(entry, terms) }))
				.filter(({ score }) => score > 0)
				.sort((a, b) => b.score - a.score || b.entry.createdAt - a.entry.createdAt)
				.slice(0, MAX_SEARCH_RESULTS)

			return {
				name,
				response: {
					query,
					matches: matches.map(({ entry }) => ({
						content: entry.content,
						category: entry.category,
						saved_at: new Date(entry.createdAt).toISOString(),
					})),
				},
			}
		}
		case 'save_memory': {
			const content = typeof args.content === 'string' ? args.content.trim() : ''
			if (!content) {
				return { name, response: { error: 'content is required.' } }
			}
			const categoryValue = typeof args.category === 'string' ? args.category : 'fact'
			let candidates = [
				{
					content,
					category: isMemoryCategory(categoryValue) ? categoryValue : 'fact',
					archivedFromMessageCount: 0,
				},
			]
			if (isSemanticMemoryAvailable(preferences)) {
				try {
					candidates = await filterDuplicateMemories(preferences, candidates)
				} catch {
					// Save without an embedding; it is added on the next semantic search.
				}
				if (candidates.length === 0) {
					return { name, response: { saved: false, reason: 'A memory with the same meaning already exists.' } }
				}
			}
			const [saved] = await addMemoryEntries(candidates)
			return {
				name,
				response: saved
					? { saved: true, id: saved.id, content: saved.content, category: saved.category }
					: { error: 'Nothing was saved.' },
			}
		}
		default:
			return { name, response: { error: `Unknown memory tool: ${name}` } }
	}
}
