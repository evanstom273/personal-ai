import Anthropic from '@anthropic-ai/sdk'

let cachedClient: { apiKey: string; client: Anthropic } | null = null

/**
 * Browser client for the Claude API. The key comes from IndexedDB and is sent
 * straight to api.anthropic.com; `dangerouslyAllowBrowser` opts into the SDK's
 * supported direct-browser-access mode (CORS), which this BYO-key app relies on.
 */
export function getClaudeClient(apiKey: string): Anthropic {
	const trimmed = apiKey.trim()
	if (!trimmed) {
		throw new Error('Add your Anthropic API key in Settings → API first.')
	}

	if (cachedClient?.apiKey === trimmed) {
		return cachedClient.client
	}

	const client = new Anthropic({
		apiKey: trimmed,
		dangerouslyAllowBrowser: true,
		// One retry for transient 429/5xx/connection errors; never loop on failures.
		maxRetries: 1,
	})
	cachedClient = { apiKey: trimmed, client }
	return client
}

export function isAbortError(error: unknown): boolean {
	return (
		error instanceof Anthropic.APIUserAbortError ||
		(error instanceof DOMException && error.name === 'AbortError')
	)
}

export function describeClaudeError(error: unknown): string {
	if (error instanceof Anthropic.AuthenticationError) {
		return 'Your Anthropic API key was rejected. Check it in Settings → API.'
	}
	if (error instanceof Anthropic.PermissionDeniedError) {
		return `This API key is not allowed to do that: ${error.message}`
	}
	if (error instanceof Anthropic.RateLimitError) {
		if (/usage limits|spend/i.test(error.message)) {
			return 'Your Anthropic organisation has reached its monthly API spend cap. Requests resume next month, or you can request a higher tier in the Claude Console.'
		}
		return 'Claude API rate limit reached. Wait a moment and try again.'
	}
	if (error instanceof Anthropic.BadRequestError) {
		if (/credit balance/i.test(error.message)) {
			return 'Your Anthropic credit balance is too low. Add credits in the Claude Console.'
		}
		if (/specified (workspace )?API usage limits/i.test(error.message)) {
			return 'The spend limit you set in the Claude Console has been reached. Raise it under Settings → Billing in the Console to keep chatting.'
		}
		return `Claude rejected the request: ${error.message}`
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return 'Could not reach the Claude API. Check your connection and try again.'
	}
	if (error instanceof Anthropic.APIError) {
		if (error.status === 529) {
			return 'Claude is temporarily overloaded. Try again in a minute.'
		}
		return `Claude API error${error.status ? ` (${error.status})` : ''}: ${error.message}`
	}
	if (error instanceof Error) {
		return error.message
	}
	return 'The Claude request failed.'
}
