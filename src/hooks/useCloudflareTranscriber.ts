import { useMemo } from 'react'
import { usePreferencesContext } from '@/providers/ChatProvider'
import { getCloudflareAvailability } from '@/services/cloudflare/client'
import { transcribeWithCloudflare } from '@/services/cloudflare/transcription'
import { isAudioRecordingSupported } from '@/utils/audioRecorder'

export type Transcriber = (audio: Blob, durationMs: number) => Promise<string>

/**
 * Whisper transcription via Cloudflare when it can be used (Android app,
 * credentials set, setting on). Otherwise null, and voice input falls back to
 * the browser's own speech recognition.
 */
export function useCloudflareTranscriber(): Transcriber | null {
	const { preferences } = usePreferencesContext()
	return useMemo(() => {
		if (
			!preferences.cfTranscription ||
			!isAudioRecordingSupported() ||
			!getCloudflareAvailability(preferences).ok
		) {
			return null
		}
		return (audio: Blob, durationMs: number) =>
			transcribeWithCloudflare(preferences, audio, durationMs)
	}, [preferences])
}
