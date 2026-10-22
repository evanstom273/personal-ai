import { runCloudflareModel } from '@/services/cloudflare/client'
import { CF_MODELS, CF_NEURONS, estimateImageNeurons } from '@/services/cloudflare/constants'
import type { MessageMedia, UserPreferences } from '@/storage/types'

/** FLUX.1 [schnell] produces 1024×1024 images; it takes no size or aspect-ratio parameters. */
export async function generateImageWithCloudflare(
	preferences: UserPreferences,
	prompt: string,
): Promise<MessageMedia> {
	const trimmed = prompt.trim().slice(0, 2048)
	if (!trimmed) {
		throw new Error('An image prompt is required.')
	}

	const result = await runCloudflareModel<{ image?: string }>(
		preferences,
		CF_MODELS.image,
		{ prompt: trimmed, steps: CF_NEURONS.imageSteps },
		{ feature: 'image', neurons: estimateImageNeurons() },
	)

	if (!result.image) {
		throw new Error('Cloudflare returned no image.')
	}

	return { type: 'image', mimeType: 'image/jpeg', dataUrl: `data:image/jpeg;base64,${result.image}` }
}
