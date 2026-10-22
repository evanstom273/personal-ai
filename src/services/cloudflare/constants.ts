/**
 * Cloudflare Workers AI models and prices, from developers.cloudflare.com/workers-ai
 * (pricing page updated 2026-10-20, checked 2026-10-22). Neuron costs are used
 * only for local estimates; Cloudflare does not expose remaining allocation.
 */
export const CF_API_BASE = 'https://api.cloudflare.com/client/v4/accounts'

/** Free allocation per account, reset daily at 00:00 UTC. */
export const CF_FREE_NEURONS_PER_DAY = 10_000
/** Stop a little early, because local estimates can lag what Cloudflare counts. */
export const CF_LOCAL_NEURON_CAP = 9_500

export const CF_MODELS = {
	image: '@cf/black-forest-labs/flux-1-schnell',
	transcription: '@cf/openai/whisper-large-v3-turbo',
	speech: '@cf/myshell-ai/melotts',
	embeddings: '@cf/baai/bge-m3',
} as const

export const CF_NEURONS = {
	/** flux-1-schnell: per 512x512 tile and per diffusion step. Output is 1024x1024 (4 tiles). */
	imageTile: 4.8,
	imageStep: 9.6,
	imageTiles: 4,
	imageSteps: 4,
	/** whisper-large-v3-turbo: per audio minute. */
	transcriptionMinute: 46.63,
	/** melotts: per audio minute. */
	speechMinute: 18.63,
	/** bge-m3: per million input tokens. */
	embeddingsPerMillionTokens: 1075,
} as const

export function estimateImageNeurons(): number {
	return CF_NEURONS.imageTiles * CF_NEURONS.imageTile + CF_NEURONS.imageSteps * CF_NEURONS.imageStep
}

export function estimateTranscriptionNeurons(durationMs: number): number {
	return Math.max(durationMs / 60_000, 1 / 60) * CF_NEURONS.transcriptionMinute
}

/** About 15 spoken characters per second. */
export function estimateSpeechNeurons(characters: number): number {
	return (characters / 900) * CF_NEURONS.speechMinute
}

export function estimateEmbeddingNeurons(characters: number): number {
	return (Math.ceil(characters / 3) / 1_000_000) * CF_NEURONS.embeddingsPerMillionTokens
}

export type CloudflareFeature = 'image' | 'transcription' | 'speech' | 'embeddings'
