import {
	deleteValue,
	getAllValues,
	getValue,
	setValue,
} from '@/storage/storageService'
import type { MemoryCategory, MemoryEntry } from '@/storage/types'

const listeners = new Set<() => void>()

export function subscribeMemoryChanged(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function notifyMemoryChanged(): void {
	for (const listener of listeners) {
		listener()
	}
}

function sortMemoryEntries(entries: MemoryEntry[]): MemoryEntry[] {
	return [...entries].sort((a, b) => b.createdAt - a.createdAt)
}

export async function listMemoryEntries(): Promise<MemoryEntry[]> {
	const entries = await getAllValues<MemoryEntry>('memories')
	return sortMemoryEntries(entries)
}

export async function getMemoryEntry(
	id: string,
): Promise<MemoryEntry | undefined> {
	return getValue<MemoryEntry>('memories', id)
}

function normalizeForComparison(text: string): string {
	return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export async function addMemoryEntries(
	entries: Array<
		Pick<MemoryEntry, 'content' | 'category' | 'archivedFromMessageCount'> &
			Partial<Pick<MemoryEntry, 'embedding' | 'embeddingModel'>>
	>,
): Promise<MemoryEntry[]> {
	const now = Date.now()
	// Exact duplicates (ignoring case and punctuation) are never stored twice.
	const seen = new Set((await listMemoryEntries()).map((entry) => normalizeForComparison(entry.content)))
	const created = entries.flatMap((entry) => {
		const key = normalizeForComparison(entry.content)
		if (!key || seen.has(key)) {
			return []
		}
		seen.add(key)
		const record: MemoryEntry = {
			id: crypto.randomUUID(),
			content: entry.content.trim(),
			category: entry.category,
			archivedFromMessageCount: entry.archivedFromMessageCount,
			createdAt: now,
			...(entry.embedding ? { embedding: entry.embedding, embeddingModel: entry.embeddingModel } : {}),
		}
		return [record]
	})

	for (const entry of created) {
		if (entry.content) {
			await setValue('memories', entry.id, entry)
		}
	}

	if (created.some((entry) => entry.content)) {
		notifyMemoryChanged()
	}

	return created.filter((entry) => entry.content)
}

export async function saveMemoryEmbeddings(
	updates: Array<{ id: string; embedding: number[]; model: string }>,
): Promise<void> {
	for (const update of updates) {
		const entry = await getMemoryEntry(update.id)
		if (entry) {
			await setValue('memories', entry.id, {
				...entry,
				embedding: update.embedding,
				embeddingModel: update.model,
			})
		}
	}
}

export async function clearAllMemory(): Promise<void> {
	const entries = await listMemoryEntries()
	await Promise.all(entries.map((entry) => deleteValue('memories', entry.id)))
	notifyMemoryChanged()
}

export function isMemoryCategory(value: string): value is MemoryCategory {
	return (
		value === 'preference' ||
		value === 'fact' ||
		value === 'project' ||
		value === 'decision' ||
		value === 'other'
	)
}
