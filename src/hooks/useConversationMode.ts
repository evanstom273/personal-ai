import { useCallback, useRef, useState } from 'react'
import type { Transcriber } from '@/hooks/useCloudflareTranscriber'
import type { ChatSubmitPayload } from '@/types/chat'
import { startAudioRecording, type ActiveRecording } from '@/utils/audioRecorder'
import {
	getSpeechRecognitionConstructor,
	getSpeechRecognitionProfile,
	openMicrophoneStream,
	releaseMicrophoneStream,
} from '@/utils/speechRecognition'

export type ConversationModeStatus =
	| 'idle'
	| 'listening'
	| 'transcribing'
	| 'thinking'
	| 'speaking'

const SILENCE_MS = 5500
/** Recording mode: microphone level that counts as speech. */
const SPEECH_RMS_THRESHOLD = 0.018

interface UseConversationModeOptions {
	onSubmit: (payload: ChatSubmitPayload) => Promise<void>
	onStopSpeaking: () => void
	/** Cloudflare Whisper transcription; when absent, browser speech recognition is used. */
	transcribe?: Transcriber | null
}

export function useConversationMode({
	onSubmit,
	onStopSpeaking,
	transcribe = null,
}: UseConversationModeOptions) {
	const [isActive, setIsActive] = useState(false)
	const [isMuted, setIsMuted] = useState(false)
	const [status, setStatus] = useState<ConversationModeStatus>('idle')
	const [liveTranscript, setLiveTranscript] = useState('')
	const [error, setError] = useState<string | null>(null)

	const recognitionRef = useRef<SpeechRecognition | null>(null)
	const micStreamRef = useRef<MediaStream | null>(null)
	const recordingRef = useRef<ActiveRecording | null>(null)
	const hasSpeechRef = useRef(false)
	const committedRef = useRef('')
	const interimRef = useRef('')
	const lastSpeechAtRef = useRef(0)
	const silenceTimerRef = useRef<number | null>(null)
	const isActiveRef = useRef(false)
	const isMutedRef = useRef(false)
	const statusRef = useRef<ConversationModeStatus>('idle')
	const beginListeningRef = useRef<() => Promise<void>>(async () => {})

	const setConversationStatus = useCallback((next: ConversationModeStatus) => {
		statusRef.current = next
		setStatus(next)
	}, [])

	const clearSilenceTimer = useCallback(() => {
		if (silenceTimerRef.current !== null) {
			window.clearTimeout(silenceTimerRef.current)
			silenceTimerRef.current = null
		}
	}, [])

	const releaseMicrophone = useCallback(() => {
		releaseMicrophoneStream(micStreamRef.current)
		micStreamRef.current = null
	}, [])

	const stopRecognition = useCallback(() => {
		recordingRef.current?.cancel()
		recordingRef.current = null
		const active = recognitionRef.current
		recognitionRef.current = null
		if (active) {
			try {
				active.abort()
			} catch {
				// ignore
			}
		}
	}, [])

	const submitTranscript = useCallback(async () => {
		if (!isActiveRef.current || isMutedRef.current) {
			return
		}

		clearSilenceTimer()
		const recording = recordingRef.current
		recordingRef.current = null
		stopRecognition()
		setConversationStatus('transcribing')

		let transcript = `${committedRef.current} ${interimRef.current}`.trim()
		if (recording && transcribe) {
			const audio = await recording.stop()
			releaseMicrophone()
			if (audio && hasSpeechRef.current) {
				try {
					transcript = `${transcript} ${await transcribe(audio.blob, audio.durationMs)}`.trim()
				} catch (transcriptionError) {
					setError(
						transcriptionError instanceof Error
							? transcriptionError.message
							: 'Transcription failed.',
					)
					setConversationStatus('listening')
					void beginListeningRef.current()
					return
				}
			}
		} else {
			releaseMicrophone()
		}

		committedRef.current = ''
		interimRef.current = ''
		setLiveTranscript('')

		if (!transcript) {
			setConversationStatus('listening')
			void beginListeningRef.current()
			return
		}

		setConversationStatus('thinking')
		await onSubmit({
			text: transcript,
			attachments: [],
			inputMethod: 'speech',
		})
	}, [
		clearSilenceTimer,
		onSubmit,
		releaseMicrophone,
		stopRecognition,
		setConversationStatus,
		transcribe,
	])

	const scheduleSilenceSubmit = useCallback(() => {
		clearSilenceTimer()
		silenceTimerRef.current = window.setTimeout(() => {
			if (
				!isActiveRef.current ||
				isMutedRef.current ||
				statusRef.current !== 'listening'
			) {
				return
			}
			if (Date.now() - lastSpeechAtRef.current < SILENCE_MS - 100) {
				return
			}
			void submitTranscript()
		}, SILENCE_MS)
	}, [clearSilenceTimer, submitTranscript])

	const beginListening = useCallback(async () => {
		if (!isActiveRef.current || isMutedRef.current) {
			return
		}

		if (transcribe) {
			const microphone = await openMicrophoneStream()
			if (!microphone.ok) {
				setError(microphone.message)
				return
			}
			releaseMicrophone()
			micStreamRef.current = microphone.stream

			try {
				recordingRef.current = startAudioRecording(microphone.stream)
			} catch {
				releaseMicrophone()
				setError('Could not start audio recording on this device.')
				return
			}

			const audioContext = new AudioContext()
			await audioContext.resume()
			const analyser = audioContext.createAnalyser()
			analyser.fftSize = 2048
			audioContext.createMediaStreamSource(microphone.stream).connect(analyser)

			committedRef.current = ''
			interimRef.current = ''
			hasSpeechRef.current = false
			setLiveTranscript('')
			setError(null)
			setConversationStatus('listening')
			lastSpeechAtRef.current = Date.now()

			// Submit after a pause in speech, judged from the microphone level.
			const samples = new Uint8Array(analyser.fftSize)
			const pollSilence = () => {
				if (!isActiveRef.current || statusRef.current !== 'listening' || !recordingRef.current) {
					void audioContext.close()
					return
				}
				analyser.getByteTimeDomainData(samples)
				let sum = 0
				for (let index = 0; index < samples.length; index += 1) {
					const value = (samples[index]! - 128) / 128
					sum += value * value
				}
				if (Math.sqrt(sum / samples.length) > SPEECH_RMS_THRESHOLD) {
					hasSpeechRef.current = true
					lastSpeechAtRef.current = Date.now()
				} else if (hasSpeechRef.current && Date.now() - lastSpeechAtRef.current > SILENCE_MS) {
					void audioContext.close()
					void submitTranscript()
					return
				}
				window.setTimeout(pollSilence, 200)
			}
			pollSilence()
			return
		}

		const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
		if (!SpeechRecognitionCtor) {
			setError('Speech recognition is not supported in this browser.')
			return
		}

		const profile = getSpeechRecognitionProfile()
		if (profile.requireMicrophoneStream) {
			const microphone = await openMicrophoneStream()
			if (!microphone.ok) {
				setError(microphone.message)
				return
			}
			releaseMicrophone()
			micStreamRef.current = microphone.stream
		}

		stopRecognition()
		committedRef.current = ''
		interimRef.current = ''
		setLiveTranscript('')
		setError(null)
		setConversationStatus('listening')
		lastSpeechAtRef.current = Date.now()

		const recognition = new SpeechRecognitionCtor()
		recognition.continuous = true
		recognition.interimResults = true
		recognition.lang = navigator.language || 'en-US'

		recognition.onresult = (event: SpeechRecognitionEvent) => {
			let interim = ''
			for (let index = event.resultIndex; index < event.results.length; index += 1) {
				const result = event.results[index]
				const spoken = result[0]?.transcript ?? ''
				if (result.isFinal) {
					committedRef.current = `${committedRef.current} ${spoken}`.trim()
					lastSpeechAtRef.current = Date.now()
				} else {
					interim = `${interim} ${spoken}`.trim()
					lastSpeechAtRef.current = Date.now()
				}
			}
			interimRef.current = interim
			setLiveTranscript(`${committedRef.current} ${interim}`.trim())
			scheduleSilenceSubmit()
		}

		recognition.onerror = () => {
			setError('Speech recognition error. End the conversation and try again.')
		}

		recognitionRef.current = recognition
		recognition.start()
	}, [
		releaseMicrophone,
		scheduleSilenceSubmit,
		stopRecognition,
		setConversationStatus,
		submitTranscript,
		transcribe,
	])

	beginListeningRef.current = beginListening

	const startConversation = useCallback(async () => {
		isActiveRef.current = true
		isMutedRef.current = false
		setIsActive(true)
		setIsMuted(false)
		setError(null)
		setConversationStatus('listening')
		await beginListening()
	}, [beginListening, setConversationStatus])

	const endConversation = useCallback(async () => {
		isActiveRef.current = false
		isMutedRef.current = false
		setIsActive(false)
		clearSilenceTimer()
		stopRecognition()
		releaseMicrophone()
		onStopSpeaking()
		setConversationStatus('idle')
		setLiveTranscript('')
		committedRef.current = ''
		interimRef.current = ''
	}, [
		clearSilenceTimer,
		onStopSpeaking,
		releaseMicrophone,
		setConversationStatus,
		stopRecognition,
	])

	const resumeListening = useCallback(async () => {
		if (!isActiveRef.current) {
			return
		}
		setConversationStatus('listening')
		await beginListening()
	}, [beginListening, setConversationStatus])

	const finishSpeaking = useCallback(() => {
		if (
			!isActiveRef.current ||
			isMutedRef.current ||
			statusRef.current !== 'listening'
		) {
			return
		}

		// A manual "done speaking" always sends the recording, even if it was quiet.
		hasSpeechRef.current = true
		void submitTranscript()
	}, [submitTranscript])

	const interruptSpeaking = useCallback(() => {
		onStopSpeaking()
		void resumeListening()
	}, [onStopSpeaking, resumeListening])

	const toggleMute = useCallback(() => {
		setIsMuted((current) => {
			const next = !current
			isMutedRef.current = next
			if (next) {
				clearSilenceTimer()
				stopRecognition()
				releaseMicrophone()
			} else if (isActiveRef.current) {
				void beginListening()
			}
			return next
		})
	}, [beginListening, clearSilenceTimer, releaseMicrophone, stopRecognition])

	return {
		isActive,
		isMuted,
		status,
		liveTranscript,
		error,
		startConversation,
		endConversation,
		finishSpeaking,
		interruptSpeaking,
		toggleMute,
		resumeListening,
		setStatus: setConversationStatus,
		clearError: () => setError(null),
	}
}
