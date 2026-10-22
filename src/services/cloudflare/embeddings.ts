import { runCloudflareModel } from '@/services/cloudflare/client'
import { CF_MODELS, estimateEmbeddingNeurons } from '@/services/cloudflare/constants'
import type { UserPreferences } from '@/storage/types'

export const EMBEDDING_MODEL_ID = CF_MODELS.embeddings
const MAX_BATCH = 50

/** Embeds texts with BGE-M3 (multilingual), in batches. */
export async function embedTexts(
	preferences: UserPreferences,
	texts: string[],
): Promise<number[][]> {
	const vectors: number[][] = []
	for (let start = 0; start < texts.length; start += MAX_BATCH) {
		const batch = texts.slice(start, start + MAX_BATCH)
		const result = await runCloudflareModel<{ data?: number[][]; response?: number[][] }>(
			preferences,
			CF_MODELS.embeddings,
			{ text: batch },
			{
				feature: 'embeddings',
				neurons: estimateEmbeddingNeurons(batch.reduce((sum, text) => sum + text.length, 0)),
			},
		)
		const data = result.data ?? result.response ?? []
		if (data.length !== batch.length) {
			throw new Error('Cloudflare returned an unexpected number of embeddings.')
		}
		vectors.push(...data)
	}
	return vectors
}

export function cosineSimilarity(a: number[], b: number[]): number {
	let dot = 0
	let normA = 0
	let normB = 0
	for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
		dot += a[index]! * b[index]!
		normA += a[index]! * a[index]!
		normB += b[index]! * b[index]!
	}
	return normA && normB ? dot / Math.sqrt(normA * normB) : 0
}
