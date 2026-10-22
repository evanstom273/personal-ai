import { useCallback, useEffect, useRef, useState } from 'react'
import {
	getAndroidSpeechHelpMessage,
	getSpeechRecognitionConstructor,
	getSpeechRecognitionErrorMessage,
	getSpeechRecognitionProfile,
	isAndroidDevice,
	isVoiceInputSupported,
	openMicrophoneStream,
	releaseMicrophoneStream,
} from '@/utils/speechRecognition'

export type SpeechRecognitionStatus = 'idle' | 'listening' | 'transcribing' | 'review'

interface UseSpeechRecognitionOptions {
	onTranscriptChange?: (transcript: string) => void
}

interface UseSpeechRecognitionResult {
	isSupported: boolean
	status: SpeechRecognitionStatus
	transcript: string
	error: string | null
	hint: string | null
	startListening: (baseText?: string) => Promise<void>
	continueListening: () => Promise<string>
	cancelListening: () => void
}

export function useSpeechRecognition(
	options: UseSpeechRecognitionOptions = {},
): UseSpeechRecognitionResult {
	const { onTranscriptChange } = options
	const profile = getSpeechRecognitionProfile()
	const [isSupported] = useState(isVoiceInputSupported)
	const [status, setStatus] = useState<SpeechRecognitionStatus>('idle')
	const [transcript, setTranscript] = useState('')
	const [error, setError] = useState<string | null>(null)
	const [hint, setHint] = useState<string | null>(null)

	const recognitionRef = useRef<SpeechRecognition | null>(null)
	const micStreamRef = useRef<MediaStream | null>(null)
	const committedRef = useRef('')
	const baseTextRef = useRef('')
	const statusRef = useRef<SpeechRecognitionStatus>('idle')
	const restartTimeoutRef = useRef<number | null>(null)
	const silentRestartCountRef = useRef(0)
	const sessionHadResultRef = useRef(false)
	const sessionHadAudioRef = useRef(false)

	statusRef.current = status

	const updateTranscript = useCallback(
		(next: string) => {
			setTranscript(next)
			onTranscriptChange?.(next)
		},
		[onTranscriptChange],
	)

	const clearRestartTimeout = useCallback(() => {
		if (restartTimeoutRef.current !== null) {
			window.clearTimeout(restartTimeoutRef.current)
			restartTimeoutRef.current = null
		}
	}, [])

	const releaseMicrophone = useCallback(() => {
		releaseMicrophoneStream(micStreamRef.current)
		micStreamRef.current = null
	}, [])

	const stopRecognition = useCallback(() => {
		clearRestartTimeout()
		const active = recognitionRef.current
		recognitionRef.current = null
		if (active) {
			try {
				active.abort()
			} catch {
				// ignore abort errors during teardown
			}
		}
	}, [clearRestartTimeout])

	const resetSessionState = useCallback(() => {
		silentRestartCountRef.current = 0
		sessionHadResultRef.current = false
		sessionHadAudioRef.current = false
	}, [])

	const cancelListening = useCallback(() => {
		stopRecognition()
		releaseMicrophone()
		committedRef.current = ''
		baseTextRef.current = ''
		resetSessionState()
		setHint(null)
		setError(null)
		setStatus('idle')
		updateTranscript('')
	}, [releaseMicrophone, resetSessionState, stopRecognition, updateTranscript])

	const bindRecognition = useCallback(
		(recognition: SpeechRecognition, restart: () => void) => {
			recognition.onstart = () => {
				sessionHadResultRef.current = false
				sessionHadAudioRef.current = false
			}

			recognition.onaudiostart = () => {
				sessionHadAudioRef.current = true
				setHint(null)
			}

			recognition.onresult = (event: SpeechRecognitionEvent) => {
				sessionHadResultRef.current = true
				silentRestartCountRef.current = 0
				setHint(null)

				let interim = ''

				for (let index = event.resultIndex; index < event.results.length; index += 1) {
					const result = event.results[index]
					const spoken = result[0]?.transcript ?? ''

					if (result.isFinal) {
						committedRef.current = joinTranscriptParts(
							committedRef.current,
							spoken,
						)
					} else {
						interim = joinTranscriptParts(interim, spoken)
					}
				}

				updateTranscript(joinTranscriptParts(committedRef.current, interim))
			}

			recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
				if (event.error === 'aborted') {
					return
				}

				if (event.error === 'no-speech' && statusRef.current === 'listening') {
					if (!sessionHadResultRef.current) {
						silentRestartCountRef.current += 1
					}
					if (silentRestartCountRef.current >= profile.maxSilentRestarts) {
						setError(getSpeechRecognitionErrorMessage('no-speech'))
						if (isAndroidDevice()) {
							setHint(getAndroidSpeechHelpMessage())
						}
						setStatus('review')
						stopRecognition()
					}
					return
				}

				setError(
					event.message || getSpeechRecognitionErrorMessage(event.error),
				)
				if (isAndroidDevice()) {
					setHint(getAndroidSpeechHelpMessage())
				}
				setStatus('review')
				stopRecognition()
			}

			recognition.onend = () => {
				if (recognitionRef.current === recognition) {
					recognitionRef.current = null
				}

				if (statusRef.current !== 'listening') {
					return
				}

				if (!sessionHadResultRef.current) {
					silentRestartCountRef.current += 1
				}

				if (silentRestartCountRef.current >= profile.maxSilentRestarts) {
					setError(
						sessionHadAudioRef.current
							? getSpeechRecognitionErrorMessage('no-speech')
							: 'Speech recognition ended before audio was captured.',
					)
					if (isAndroidDevice()) {
						setHint(getAndroidSpeechHelpMessage())
					}
					setStatus('review')
					return
				}

				clearRestartTimeout()
				restartTimeoutRef.current = window.setTimeout(() => {
					if (statusRef.current === 'listening') {
						restart()
					}
				}, profile.restartDelayMs)
			}
		},
		[
			clearRestartTimeout,
			profile.maxSilentRestarts,
			profile.restartDelayMs,
			stopRecognition,
			updateTranscript,
		],
	)

	const startWebSpeechListening = useCallback(
		async (trimmedBase: string) => {
			const SpeechRecognitionCtor = getSpeechRecognitionConstructor()
			if (!SpeechRecognitionCtor) {
				setError('Speech recognition is not supported in this browser.')
				return
			}

			if (profile.requireMicrophoneStream) {
				const microphone = await openMicrophoneStream()
				if (!microphone.ok) {
					setError(microphone.message)
					setStatus('idle')
					return
				}
				releaseMicrophone()
				micStreamRef.current = microphone.stream
			}

			stopRecognition()
			committedRef.current = trimmedBase
			resetSessionState()
			updateTranscript(trimmedBase)
			setError(null)
			setHint(null)
			setStatus('listening')

			const launch = (): void => {
				if (statusRef.current !== 'listening') {
					return
				}

				const recognition = new SpeechRecognitionCtor()
				recognition.continuous = profile.continuous
				recognition.interimResults = profile.interimResults
				recognition.lang = navigator.language || 'en-US'

				bindRecognition(recognition, launch)
				recognitionRef.current = recognition

				try {
					recognition.start()
				} catch (startError) {
					const message =
						startError instanceof Error
							? startError.message
							: 'Could not start speech recognition.'

					if (
						message.includes('InvalidStateError') ||
						message.toLowerCase().includes('already started')
					) {
						clearRestartTimeout()
						restartTimeoutRef.current = window.setTimeout(() => {
							if (statusRef.current === 'listening') {
								launch()
							}
						}, profile.restartDelayMs)
						return
					}

					setError(message)
					setStatus('idle')
					recognitionRef.current = null
					releaseMicrophone()
				}
			}

			launch()
		},
		[
			bindRecognition,
			clearRestartTimeout,
			profile.continuous,
			profile.interimResults,
			profile.requireMicrophoneStream,
			profile.restartDelayMs,
			releaseMicrophone,
			resetSessionState,
			stopRecognition,
			updateTranscript,
		],
	)

	const startListening = useCallback(
		async (baseText = '') => {
			const trimmedBase = baseText.trim()
			baseTextRef.current = trimmedBase
			await startWebSpeechListening(trimmedBase)
		},
		[startWebSpeechListening],
	)

	const continueListening = useCallback(async (): Promise<string> => {
		stopRecognition()
		releaseMicrophone()
		setHint(null)
		setStatus('review')
		return committedRef.current.trim()
	}, [releaseMicrophone, stopRecognition])

	useEffect(() => {
		return () => {
			stopRecognition()
			releaseMicrophone()
		}
	}, [releaseMicrophone, stopRecognition])

	return {
		isSupported,
		status,
		transcript,
		error,
		hint,
		startListening,
		continueListening,
		cancelListening,
	}
}

function joinTranscriptParts(left: string, right: string): string {
	const trimmedLeft = left.trim()
	const trimmedRight = right.trim()

	if (!trimmedLeft) {
		return trimmedRight
	}

	if (!trimmedRight) {
		return trimmedLeft
	}

	return `${trimmedLeft} ${trimmedRight}`
}
