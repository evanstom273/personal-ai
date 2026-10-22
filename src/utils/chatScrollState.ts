const SCROLL_KEY_PREFIX = 'personal-ai-chat-scroll-top:'

export function saveChatScrollTop(scrollTop: number, conversationId = 'default'): void {
	try {
		sessionStorage.setItem(`${SCROLL_KEY_PREFIX}${conversationId}`, String(scrollTop))
	} catch {
		// ignore storage failures
	}
}

export function readChatScrollTop(conversationId = 'default'): number | null {
	try {
		const raw = sessionStorage.getItem(`${SCROLL_KEY_PREFIX}${conversationId}`)
		if (raw === null) {
			return null
		}

		const value = Number(raw)
		return Number.isFinite(value) ? value : null
	} catch {
		return null
	}
}
