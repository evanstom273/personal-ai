import appReferenceMarkdown from '@/data/appReference.md?raw'

const MAX_APP_REFERENCE_CHARS = 48_000

function truncateWithNotice(text: string, maxChars: number): string {
	if (text.length <= maxChars) {
		return text
	}

	return `${text.slice(0, maxChars)}\n\n[App reference truncated for context length. Use codebase inspection tools or ask the user to download the full reference from Settings.]`
}

export function getAppReferenceMarkdown(): string {
	return appReferenceMarkdown.trim()
}

export function buildAppReferenceContext(): string {
	const body = truncateWithNotice(getAppReferenceMarkdown(), MAX_APP_REFERENCE_CHARS)

	return [
		'## Application reference (always in context)',
		'',
		'Authoritative description of how this Personal AI app works, its architecture, storage, tools, and constraints. Treat this as ground truth about yourself and the application.',
		'',
		body,
	].join('\n')
}
