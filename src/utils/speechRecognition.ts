export function getSpeechRecognitionConstructor():
	| SpeechRecognitionConstructor
	| null {
	if (typeof window === 'undefined') {
		return null
	}

	return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null
}

export function isSpeechRecognitionSupported(): boolean {
	return getSpeechRecognitionConstructor() !== null
}

export function isAndroidDevice(): boolean {
	if (typeof navigator === 'undefined') {
		return false
	}

	return /Android/i.test(navigator.userAgent)
}

/** Voice input uses the browser's speech recognition; it is unavailable in some WebViews. */
export function isVoiceInputSupported(): boolean {
	return isSpeechRecognitionSupported()
}

export interface SpeechRecognitionProfile {
	continuous: boolean
	interimResults: boolean
	restartDelayMs: number
	requireMicrophoneStream: boolean
	maxSilentRestarts: number
}

export function getSpeechRecognitionProfile(): SpeechRecognitionProfile {
	if (isAndroidDevice()) {
		return {
			continuous: false,
			interimResults: true,
			restartDelayMs: 250,
			requireMicrophoneStream: true,
			maxSilentRestarts: 8,
		}
	}

	return {
		continuous: true,
		interimResults: true,
		restartDelayMs: 200,
		requireMicrophoneStream: true,
		maxSilentRestarts: 6,
	}
}

export async function openMicrophoneStream(): Promise<
	{ ok: true; stream: MediaStream } | { ok: false; message: string }
> {
	if (!navigator.mediaDevices?.getUserMedia) {
		return {
			ok: false,
			message: 'Microphone access is not available in this browser.',
		}
	}

	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
		return { ok: true, stream }
	} catch (error) {
		const name =
			error instanceof DOMException
				? error.name
				: error instanceof Error
					? error.name
					: 'UnknownError'

		if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
			return {
				ok: false,
				message:
					'Microphone access was denied. Allow the mic in your browser or app settings, then try again.',
			}
		}

		if (name === 'NotFoundError') {
			return {
				ok: false,
				message: 'No microphone was found on this device.',
			}
		}

		return {
			ok: false,
			message: 'Could not access the microphone.',
		}
	}
}

export function releaseMicrophoneStream(stream: MediaStream | null): void {
	if (!stream) {
		return
	}

	for (const track of stream.getTracks()) {
		track.stop()
	}
}

export function getSpeechRecognitionErrorMessage(error: string): string {
	switch (error) {
		case 'not-allowed':
		case 'service-not-allowed':
			return 'Microphone or speech recognition is blocked. Allow access in app settings or try Chrome.'
		case 'audio-capture':
			return 'Could not capture audio. Check that no other app is using the microphone.'
		case 'network':
			return 'Speech recognition needs an internet connection.'
		case 'no-speech':
			return 'No speech was detected. Try speaking closer to the microphone.'
		case 'aborted':
			return 'Speech recognition was stopped.'
		default:
			return `Speech recognition error: ${error}`
	}
}

export function getAndroidSpeechHelpMessage(): string {
	return 'Voice input uses your device\'s speech recognition. If it keeps failing, check the microphone permission, or open the site in Chrome instead of the home-screen app.'
}
