import { getCloudflareAvailability } from '@/services/cloudflare/client'
import {
	EMBEDDING_MODEL_ID,
	cosineSimilarity,
	embedTexts,
} from '@/services/cloudflare/embeddings'
import { listMemoryEntries, saveMemoryEmbeddings } from '@/services/memory/memoryService'
import type { MemoryEntry, UserPreferences } from '@/storage/types'

/** Above this similarity a new memory counts as a duplicate of an existing one. */
const DUPLICATE_THRESHOLD = 0.92
/** Below this similarity a memory is not relevant enough to return from a search. */
const RELEVANCE_THRESHOLD = 0.4

export function isSemanticMemoryAvailable(preferences: UserPreferences): boolean {
	return preferences.cfSemanticMemory && getCloudflareAvailability(preferences).ok
}

function hasCurrentEmbedding(entry: MemoryEntry): entry is MemoryEntry & { embedding: number[] } {
	return Array.isArray(entry.embedding) && entry.embeddingModel === EMBEDDING_MODEL_ID
}

/** Embeds only memories that have no embedding yet, so unchanged entries are never re-sent. */
export async function ensureMemoryEmbeddings(preferences: UserPreferences): Promise<MemoryEntry[]> {
	const entries = await listMemoryEntries()
	const missing = entries.filter((entry) => !hasCurrentEmbedding(entry))
	if (missing.length === 0) {
		return entries
	}

	const vectors = await embedTexts(preferences, missing.map((entry) => entry.content))
	await saveMemoryEmbeddings(
		missing.map((entry, index) => ({ id: entry.id, embedding: vectors[index]!, model: EMBEDDING_MODEL_ID })),
	)
	return listMemoryEntries()
}

export async function searchMemorySemantically(
	preferences: UserPreferences,
	query: string,
	limit: number,
): Promise<Array<{ entry: MemoryEntry; score: number }>> {
	const entries = await ensureMemoryEmbeddings(preferences)
	const [queryVector] = await embedTexts(preferences, [query])
	return entries
		.filter(hasCurrentEmbedding)
		.map((entry) => ({ entry, score: cosineSimilarity(queryVector!, entry.embedding) }))
		.filter(({ score }) => score >= RELEVANCE_THRESHOLD)
		.sort((a, b) => b.score - a.score)
		.slice(0, limit)
}

/**
 * Embeds candidate memories and drops any that mean the same as an existing
 * memory (or each other). Returns the survivors with their embeddings.
 */
export async function filterDuplicateMemories<T extends { content: string }>(
	preferences: UserPreferences,
	candidates: T[],
): Promise<Array<T & { embedding: number[]; embeddingModel: string }>> {
	if (candidates.length === 0) {
		return []
	}
	const existing = (await ensureMemoryEmbeddings(preferences)).filter(hasCurrentEmbedding)
	const vectors = await embedTexts(preferences, candidates.map((candidate) => candidate.content))
	const kept: Array<T & { embedding: number[]; embeddingModel: string }> = []

	candidates.forEach((candidate, index) => {
		const vector = vectors[index]!
		const pool = [...existing.map((entry) => entry.embedding), ...kept.map((entry) => entry.embedding)]
		if (pool.some((other) => cosineSimilarity(vector, other) >= DUPLICATE_THRESHOLD)) {
			return
		}
		kept.push({ ...candidate, embedding: vector, embeddingModel: EMBEDDING_MODEL_ID })
	})

	return kept
}
