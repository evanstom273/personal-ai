import { useCallback, useEffect, useRef, useState } from 'react'
import type { TtsReadAloudMode, UserPreferences } from '@/storage/types'
import { prepareTextForSpeech } from '@/utils/speechText'

export type TtsPlaybackStatus = 'idle' | 'loading' | 'playing'

export interface SpeakAssistantMessageOptions {
	messageId: string
	text: string
	onEnded?: () => void
	onError?: (error: Error) => void
	suppressErrorState?: boolean
}

export interface SpeechVoiceOption {
	id: string
	name: string
	lang: string
	isDefault: boolean
}

interface UseTextToSpeechOptions {
	preferences: UserPreferences
}

/** Chrome cuts long utterances off after ~15 seconds, so speak in sentence-sized chunks. */
const MAX_UTTERANCE_CHARS = 220

export function isSpeechSynthesisSupported(): boolean {
	return (
		typeof window !== 'undefined' &&
		'speechSynthesis' in window &&
		typeof window.SpeechSynthesisUtterance === 'function'
	)
}

export function shouldAutoPlayAssistantSpeech(
	mode: TtsReadAloudMode,
	inputMethod: 'typed' | 'speech',
): boolean {
	if (mode === 'always') {
		return true
	}

	if (mode === 'after_speech') {
		return inputMethod === 'speech'
	}

	return false
}

function splitIntoUtterances(text: string): string[] {
	const sentences = text.match(/[^.!?\n]+[.!?]*\s*|\n+/g) ?? [text]
	const chunks: string[] = []
	let current = ''

	for (const sentence of sentences) {
		if ((current + sentence).length > MAX_UTTERANCE_CHARS && current.trim()) {
			chunks.push(current.trim())
			current = ''
		}

		if (sentence.length > MAX_UTTERANCE_CHARS) {
			for (const part of sentence.split(/(?<=[,;:])\s+/)) {
				if ((current + part).length > MAX_UTTERANCE_CHARS && current.trim()) {
					chunks.push(current.trim())
					current = ''
				}
				current += `${part} `
			}
			continue
		}

		current += sentence
	}

	if (current.trim()) {
		chunks.push(current.trim())
	}

	return chunks
}

function toVoiceOption(voice: SpeechSynthesisVoice): SpeechVoiceOption {
	return {
		id: voice.voiceURI || voice.name,
		name: voice.name,
		lang: voice.lang,
		isDefault: voice.default,
	}
}

function pickVoice(
	voices: SpeechSynthesisVoice[],
	preferredId: string,
): SpeechSynthesisVoice | undefined {
	if (preferredId) {
		const match = voices.find(
			(voice) => voice.voiceURI === preferredId || voice.name === preferredId,
		)
		if (match) {
			return match
		}
	}

	const language = (navigator.language || 'en').toLowerCase()
	return (
		voices.find((voice) => voice.lang.toLowerCase() === language) ??
		voices.find((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2))) ??
		voices.find((voice) => voice.default)
	)
}

/**
 * Reads replies aloud with the browser's built-in speech synthesis. It costs
 * nothing and needs no API key; availability and voices depend on the device.
 */
export function useTextToSpeech({ preferences }: UseTextToSpeechOptions) {
	const [activeMessageId, setActiveMessageId] = useState<string | null>(null)
	const [status, setStatus] = useState<TtsPlaybackStatus>('idle')
	const [error, setError] = useState<string | null>(null)
	const [voices, setVoices] = useState<SpeechVoiceOption[]>([])
	const [isSupported] = useState(isSpeechSynthesisSupported)

	const requestIdRef = useRef(0)
	const onEndedRef = useRef<(() => void) | null>(null)
	const rawVoicesRef = useRef<SpeechSynthesisVoice[]>([])

	useEffect(() => {
		if (!isSupported) {
			return
		}

		const synth = window.speechSynthesis
		const loadVoices = () => {
			rawVoicesRef.current = synth.getVoices()
			setVoices(rawVoicesRef.current.map(toVoiceOption))
		}

		loadVoices()
		synth.addEventListener('voiceschanged', loadVoices)
		return () => {
			synth.removeEventListener('voiceschanged', loadVoices)
		}
	}, [isSupported])

	const finishPlayback = useCallback((requestId: number) => {
		if (requestId !== requestIdRef.current) {
			return
		}
		const onEnded = onEndedRef.current
		onEndedRef.current = null
		setActiveMessageId(null)
		setStatus('idle')
		onEnded?.()
	}, [])

	const stop = useCallback(() => {
		requestIdRef.current += 1
		if (isSupported) {
			window.speechSynthesis.cancel()
		}
		setActiveMessageId(null)
		setStatus('idle')
		onEndedRef.current = null
	}, [isSupported])

	const clearError = useCallback(() => {
		setError(null)
	}, [])

	const speak = useCallback(
		(
			messageId: string,
			speechText: string,
			voiceId: string,
			callbacks: { onError?: (error: Error) => void; suppressErrorState?: boolean },
		) => {
			const synth = window.speechSynthesis
			synth.cancel()

			const requestId = requestIdRef.current + 1
			requestIdRef.current = requestId
			const voice = pickVoice(rawVoicesRef.current, voiceId)
			const chunks = splitIntoUtterances(speechText)

			setActiveMessageId(messageId)
			setStatus('playing')

			chunks.forEach((chunk, index) => {
				const utterance = new SpeechSynthesisUtterance(chunk)
				if (voice) {
					utterance.voice = voice
					utterance.lang = voice.lang
				}
				if (index === chunks.length - 1) {
					utterance.onend = () => finishPlayback(requestId)
				}
				utterance.onerror = (event) => {
					if (requestId !== requestIdRef.current) {
						return
					}
					if (event.error === 'interrupted' || event.error === 'canceled') {
						return
					}
					synth.cancel()
					const failure = new Error(
						event.error === 'not-allowed'
							? 'Speech playback was blocked by the browser. Tap Listen again to start audio.'
							: 'Could not read this reply aloud on this device.',
					)
					if (!callbacks.suppressErrorState) {
						setError(failure.message)
					}
					callbacks.onError?.(failure)
					finishPlayback(requestId)
				}
				synth.speak(utterance)
			})
		},
		[finishPlayback],
	)

	const speakAssistantMessage = useCallback(
		async ({
			messageId,
			text,
			onEnded,
			onError,
			suppressErrorState = false,
		}: SpeakAssistantMessageOptions) => {
			if (!isSupported) {
				const message = 'Read-aloud is not available in this browser or app.'
				if (!suppressErrorState) {
					setError(message)
				}
				onError?.(new Error(message))
				onEnded?.()
				return
			}

			const speechText = prepareTextForSpeech(text)
			if (!speechText) {
				const message = 'There is no readable text to speak in this message.'
				if (!suppressErrorState) {
					setError(message)
				}
				onError?.(new Error(message))
				onEnded?.()
				return
			}

			if (activeMessageId === messageId && status === 'playing') {
				stop()
				return
			}

			if (!suppressErrorState) {
				setError(null)
			}
			onEndedRef.current = onEnded ?? null
			speak(messageId, speechText, preferences.ttsVoiceName, {
				onError,
				suppressErrorState,
			})
		},
		[activeMessageId, isSupported, preferences.ttsVoiceName, speak, status, stop],
	)

	const previewVoice = useCallback(
		async (voiceId: string) => {
			if (!isSupported) {
				setError('Read-aloud is not available in this browser or app.')
				return
			}
			setError(null)
			onEndedRef.current = null
			speak(
				'voice-preview',
				'Hello! This is how replies will sound when read aloud.',
				voiceId,
				{},
			)
		},
		[isSupported, speak],
	)

	useEffect(() => {
		return () => {
			requestIdRef.current += 1
			if (isSpeechSynthesisSupported()) {
				window.speechSynthesis.cancel()
			}
		}
	}, [])

	return {
		activeMessageId,
		status,
		error,
		isSupported,
		voices,
		speakAssistantMessage,
		previewVoice,
		stop,
		clearError,
	}
}
