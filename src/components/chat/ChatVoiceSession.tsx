import { ConversationModeOverlay } from '@/components/chat/ConversationModeOverlay'
import { VoiceModeControls } from '@/components/chat/VoiceModeControls'
import { useConversationMode } from '@/hooks/useConversationMode'
import { isSpeechSynthesisSupported } from '@/hooks/useTextToSpeech'
import { useChatHeaderSlot, useVoiceSessionContext } from '@/providers/ChatProvider'
import type { StoredMessage } from '@/storage/types'
import type { ChatSubmitPayload } from '@/types/chat'
import { isVoiceInputSupported } from '@/utils/speechRecognition'
import { useCallback, useEffect, useRef, useState } from 'react'

interface ChatVoiceSessionProps {
	conversationMessages: StoredMessage[]
	isGenerating: boolean
	hasApiKey: boolean
	aiName: string
	speechStatus: 'idle' | 'loading' | 'playing'
	onSubmit: (payload: ChatSubmitPayload) => Promise<void>
	onStopSpeech: () => void
	onSpeakAssistantMessage: (options: {
		messageId: string
		text: string
		suppressErrorState?: boolean
		onEnded?: () => void
		onError?: () => void
	}) => void
}

export function ChatVoiceSession({
	conversationMessages,
	isGenerating,
	hasApiKey,
	aiName,
	speechStatus,
	onSubmit,
	onStopSpeech,
	onSpeakAssistantMessage,
}: ChatVoiceSessionProps) {
	const { setSlot } = useChatHeaderSlot()
	const { conversationModeActiveRef } = useVoiceSessionContext()

	const awaitingConversationReplyRef = useRef(false)
	const lastSpokenMessageIdRef = useRef<string | null>(null)

	const handleConversationSubmit = useCallback(
		async (payload: Parameters<typeof onSubmit>[0]) => {
			awaitingConversationReplyRef.current = true
			await onSubmit(payload)
		},
		[onSubmit],
	)

	const conversationMode = useConversationMode({
		onSubmit: handleConversationSubmit,
		onStopSpeaking: onStopSpeech,
	})
	// Hands-free mode needs both browser speech recognition and speech synthesis.
	const [isVoiceModeAvailable] = useState(
		() => isVoiceInputSupported() && isSpeechSynthesisSupported(),
	)

	useEffect(() => {
		if (!isVoiceModeAvailable) {
			setSlot(null)
			return
		}
		setSlot(
			<VoiceModeControls
				hasApiKey={hasApiKey}
				isConversationActive={conversationMode.isActive}
				isGenerating={isGenerating}
				onStartConversation={() => void conversationMode.startConversation()}
			/>,
		)
		return () => setSlot(null)
	}, [
		isVoiceModeAvailable,
		setSlot,
		hasApiKey,
		conversationMode.isActive,
		isGenerating,
		conversationMode.startConversation,
	])

	useEffect(() => {
		conversationModeActiveRef.current = conversationMode.isActive
	}, [conversationMode.isActive, conversationModeActiveRef])

	useEffect(() => {
		if (!conversationMode.isActive || isGenerating) {
			return
		}
		if (!awaitingConversationReplyRef.current) {
			return
		}

		const lastMessage = conversationMessages[conversationMessages.length - 1]
		if (!lastMessage || lastMessage.role !== 'assistant') {
			return
		}
		if (lastSpokenMessageIdRef.current === lastMessage.id) {
			return
		}

		awaitingConversationReplyRef.current = false
		lastSpokenMessageIdRef.current = lastMessage.id
		conversationMode.setStatus('speaking')

		onSpeakAssistantMessage({
			messageId: lastMessage.id,
			text: lastMessage.content,
			suppressErrorState: true,
			onEnded: () => {
				void conversationMode.resumeListening()
			},
			onError: () => {
				void conversationMode.resumeListening()
			},
		})
	}, [
		conversationMessages,
		conversationMode.isActive,
		conversationMode.setStatus,
		conversationMode.resumeListening,
		isGenerating,
		onSpeakAssistantMessage,
	])

	return conversationMode.isActive ? (
		<ConversationModeOverlay
			aiName={aiName}
			status={conversationMode.status}
			liveTranscript={conversationMode.liveTranscript}
			isMuted={conversationMode.isMuted}
			error={conversationMode.error}
			onEnd={() => void conversationMode.endConversation()}
			onToggleMute={conversationMode.toggleMute}
			onFinishSpeaking={() => void conversationMode.finishSpeaking()}
			onInterrupt={conversationMode.interruptSpeaking}
			isSpeaking={speechStatus === 'playing'}
		/>
	) : null
}
