import { listMemoryEntries } from '@/services/memory/memoryService'
import type { MemoryEntry } from '@/storage/types'

/** About 3K tokens of memory on every request; the rest is reachable via search_memory. */
const MAX_TOTAL_MEMORY_CHARS = 12_000

const CATEGORY_LABELS: Record<MemoryEntry['category'], string> = {
	preference: 'Preference',
	fact: 'Fact',
	project: 'Project',
	decision: 'Decision',
	other: 'Other',
}

/** Lower number = kept first when the budget is tight. */
const CATEGORY_PRIORITY: Record<MemoryEntry['category'], number> = {
	preference: 0,
	fact: 1,
	decision: 2,
	project: 3,
	other: 4,
}

function formatMemoryEntry(entry: MemoryEntry): string {
	return `- **${CATEGORY_LABELS[entry.category]}:** ${entry.content}`
}

/**
 * Picks which memories go into the prompt. Everything fits for most users;
 * when it doesn't, preferences and facts win over older project notes, and
 * newer entries win within a category.
 */
export function selectMemoryEntriesForContext(
	entries: MemoryEntry[],
	maxChars: number = MAX_TOTAL_MEMORY_CHARS,
): { selected: MemoryEntry[]; omittedCount: number } {
	const ranked = [...entries].sort(
		(a, b) =>
			CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category] ||
			b.createdAt - a.createdAt,
	)

	const selected: MemoryEntry[] = []
	let totalChars = 0
	for (const entry of ranked) {
		const length = formatMemoryEntry(entry).length + 1
		if (totalChars + length > maxChars) {
			continue
		}
		selected.push(entry)
		totalChars += length
	}

	// Present chronologically so the list reads naturally and stays stable for caching.
	selected.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
	return { selected, omittedCount: entries.length - selected.length }
}

export function buildMemoryContext(entries: MemoryEntry[]): string {
	if (entries.length === 0) {
		return [
			'## Long-term memory',
			'',
			'No saved memory yet. Important facts from conversations are archived here automatically.',
		].join('\n')
	}

	const { selected, omittedCount } = selectMemoryEntriesForContext(entries)

	const header = [
		'## Long-term memory',
		'',
		'Facts saved from earlier conversations. Treat them as true unless the user clearly updates something.',
		'',
	].join('\n')

	const omittedNote =
		omittedCount > 0
			? `\n\n_${omittedCount} more memory entr${omittedCount === 1 ? 'y is' : 'ies are'} saved but not shown here. Use search_memory to look them up when the conversation needs them._`
			: ''

	return `${header}${selected.map(formatMemoryEntry).join('\n')}${omittedNote}`
}

export async function buildMemoryContextFromStore(): Promise<string> {
	const entries = await listMemoryEntries()
	return buildMemoryContext(entries)
}
