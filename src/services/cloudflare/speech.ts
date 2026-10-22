import { runCloudflareModel } from '@/services/cloudflare/client'
import { CF_MODELS, estimateSpeechNeurons } from '@/services/cloudflare/constants'
import type { UserPreferences } from '@/storage/types'

/** Speaks one chunk of text with MeloTTS and returns a playable MP3 data URL. */
export async function synthesizeWithCloudflare(
	preferences: UserPreferences,
	text: string,
): Promise<string> {
	const result = await runCloudflareModel<{ audio?: string }>(
		preferences,
		CF_MODELS.speech,
		{ prompt: text, lang: 'en' },
		{ feature: 'speech', neurons: estimateSpeechNeurons(text.length) },
	)

	if (!result.audio) {
		throw new Error('Cloudflare returned no audio.')
	}
	return `data:audio/mpeg;base64,${result.audio}`
}
