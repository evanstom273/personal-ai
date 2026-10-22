import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCloudflareAvailability } from '@/services/cloudflare/client'
import { synthesizeWithCloudflare } from '@/services/cloudflare/speech'
import type { TtsReadAloudMode, UserPreferences } from '@/storage/types'
import { prepareTextForSpeech } from '@/utils/speechText'

export type TtsPlaybackStatus = 'idle' | 'loading' | 'playing' | 'paused'

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
/** Cloudflare chunks: short first chunk so audio starts quickly, then fetched one ahead. */
const MAX_CLOUDFLARE_CHUNK_CHARS = 600

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

function splitIntoUtterances(text: string, maxChars = MAX_UTTERANCE_CHARS): string[] {
	const MAX_UTTERANCE_CHARS = maxChars
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
	const [deviceSupported] = useState(isSpeechSynthesisSupported)
	const useCloudflare = useMemo(
		() => preferences.ttsEngine === 'cloudflare' && getCloudflareAvailability(preferences).ok,
		[preferences],
	)
	const isSupported = deviceSupported || useCloudflare
	const audioRef = useRef<HTMLAudioElement | null>(null)
	const playbackDoneRef = useRef<(() => void) | null>(null)

	const requestIdRef = useRef(0)
	const onEndedRef = useRef<(() => void) | null>(null)
	const rawVoicesRef = useRef<SpeechSynthesisVoice[]>([])

	useEffect(() => {
		if (!deviceSupported) {
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
	}, [deviceSupported])

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

	const stopAudio = useCallback(() => {
		const audio = audioRef.current
		if (audio) {
			audio.pause()
			audio.removeAttribute('src')
		}
		const done = playbackDoneRef.current
		playbackDoneRef.current = null
		done?.()
	}, [])

	const stop = useCallback(() => {
		requestIdRef.current += 1
		stopAudio()
		if (deviceSupported) {
			window.speechSynthesis.cancel()
		}
		setActiveMessageId(null)
		setStatus('idle')
		onEndedRef.current = null
	}, [deviceSupported, stopAudio])

	const pause = useCallback(() => {
		if (audioRef.current && !audioRef.current.paused) {
			audioRef.current.pause()
		} else if (deviceSupported) {
			window.speechSynthesis.pause()
		}
		setStatus((current) => (current === 'playing' ? 'paused' : current))
	}, [deviceSupported])

	const resume = useCallback(() => {
		if (audioRef.current?.src && audioRef.current.paused) {
			void audioRef.current.play()
		} else if (deviceSupported) {
			window.speechSynthesis.resume()
		}
		setStatus((current) => (current === 'paused' ? 'playing' : current))
	}, [deviceSupported])

	/** Plays Cloudflare MeloTTS audio chunk by chunk, fetching the next while one plays. */
	const speakWithCloudflare = useCallback(
		async (
			messageId: string,
			speechText: string,
			callbacks: { onError?: (error: Error) => void; suppressErrorState?: boolean },
		) => {
			stopAudio()
			window.speechSynthesis?.cancel()
			const requestId = requestIdRef.current + 1
			requestIdRef.current = requestId
			setActiveMessageId(messageId)
			setStatus('loading')

			const chunks = splitIntoUtterances(speechText, MAX_CLOUDFLARE_CHUNK_CHARS)
			const audio = audioRef.current ?? new Audio()
			audioRef.current = audio

			try {
				let pending = synthesizeWithCloudflare(preferences, chunks[0]!)
				for (let index = 0; index < chunks.length; index += 1) {
					const url = await pending
					if (requestId !== requestIdRef.current) return
					if (index + 1 < chunks.length) {
						pending = synthesizeWithCloudflare(preferences, chunks[index + 1]!)
						pending.catch(() => undefined)
					}

					await new Promise<void>((resolve, reject) => {
						playbackDoneRef.current = resolve
						audio.onended = () => resolve()
						audio.onerror = () => reject(new Error('Could not play the generated audio.'))
						audio.src = url
						audio.play().then(
							() => setStatus((current) => (current === 'paused' ? current : 'playing')),
							reject,
						)
					})
					if (requestId !== requestIdRef.current) return
				}
				finishPlayback(requestId)
			} catch (speechError) {
				if (requestId !== requestIdRef.current) return
				const failure = speechError instanceof Error ? speechError : new Error('Speech failed.')
				if (!callbacks.suppressErrorState) {
					setError(failure.message)
				}
				callbacks.onError?.(failure)
				finishPlayback(requestId)
			}
		},
		[finishPlayback, preferences, stopAudio],
	)

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

			if (activeMessageId === messageId && (status === 'playing' || status === 'paused')) {
				stop()
				return
			}

			if (!suppressErrorState) {
				setError(null)
			}
			onEndedRef.current = onEnded ?? null
			if (useCloudflare) {
				void speakWithCloudflare(messageId, speechText, { onError, suppressErrorState })
				return
			}
			speak(messageId, speechText, preferences.ttsVoiceName, {
				onError,
				suppressErrorState,
			})
		},
		[
			activeMessageId,
			isSupported,
			preferences.ttsVoiceName,
			speak,
			speakWithCloudflare,
			status,
			stop,
			useCloudflare,
		],
	)

	const previewVoice = useCallback(
		async (voiceId: string) => {
			if (!isSupported) {
				setError('Read-aloud is not available in this browser or app.')
				return
			}
			setError(null)
			onEndedRef.current = null
			if (useCloudflare) {
				void speakWithCloudflare('voice-preview', 'Hello! This is how replies will sound when read aloud.', {})
				return
			}
			speak(
				'voice-preview',
				'Hello! This is how replies will sound when read aloud.',
				voiceId,
				{},
			)
		},
		[isSupported, speak, speakWithCloudflare, useCloudflare],
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
		engine: useCloudflare ? ('cloudflare' as const) : ('device' as const),
		voices,
		speakAssistantMessage,
		previewVoice,
		pause,
		resume,
		stop,
		clearError,
	}
}
