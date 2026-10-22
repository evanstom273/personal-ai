import { describeClaudeError, getClaudeClient } from '@/services/claude/client'
import { CLAUDE_MODEL_ID, CLAUDE_MODEL_NAME } from '@/services/claude/constants'

export interface ApiKeyValidationResult {
	ok: boolean
	message: string
}

/** Checks the key with a Models API lookup, which costs no tokens. */
export async function validateApiKey(
	apiKey: string,
): Promise<ApiKeyValidationResult> {
	const trimmed = apiKey.trim()
	if (!trimmed) {
		return { ok: false, message: 'Enter an API key first.' }
	}

	if (!trimmed.startsWith('sk-ant-')) {
		return {
			ok: false,
			message: 'That does not look like an Anthropic API key (they start with "sk-ant-").',
		}
	}

	try {
		const model = await getClaudeClient(trimmed).models.retrieve(CLAUDE_MODEL_ID)
		return {
			ok: true,
			message: `Connected. ${model.display_name || CLAUDE_MODEL_NAME} is available on this key.`,
		}
	} catch (error) {
		return { ok: false, message: describeClaudeError(error) }
	}
}
