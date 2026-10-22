import { runCloudflareModel } from '@/services/cloudflare/client'
import { CF_MODELS, estimateTranscriptionNeurons } from '@/services/cloudflare/constants'
import type { UserPreferences } from '@/storage/types'

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			const result = typeof reader.result === 'string' ? reader.result : ''
			const commaIndex = result.indexOf(',')
			resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
		}
		reader.onerror = () => reject(new Error('Failed to read the recording.'))
		reader.readAsDataURL(blob)
	})
}

/** Transcribes a recorded clip with Whisper Large V3 Turbo. */
export async function transcribeWithCloudflare(
	preferences: UserPreferences,
	audio: Blob,
	durationMs: number,
): Promise<string> {
	if (audio.size === 0) {
		throw new Error('No audio was recorded. Try speaking again.')
	}

	const result = await runCloudflareModel<{ text?: string }>(
		preferences,
		CF_MODELS.transcription,
		{ audio: await blobToBase64(audio), vad_filter: true },
		{ feature: 'transcription', neurons: estimateTranscriptionNeurons(durationMs) },
	)

	const text = result.text?.trim() ?? ''
	if (!text) {
		throw new Error('No speech was recognised. Try speaking closer to the microphone.')
	}
	return text
}
