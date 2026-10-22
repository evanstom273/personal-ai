import { stripCitationMarkers } from '@/services/claude/webResults'

const URL_PATTERN = /\bhttps?:\/\/[^\s<>()]+/gi
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g
const INLINE_CODE = /`([^`]+)`/g
const MARKDOWN_LINK = /\[([^\]]+)\]\(([^)]+)\)/g
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\(([^)]+)\)/g
const HEADING_PREFIX = /^#{1,6}\s+/gm
const BLOCKQUOTE_PREFIX = /^>\s?/gm
const LIST_PREFIX = /^[\s]*[-*+]\s+/gm
const ORDERED_LIST_PREFIX = /^[\s]*\d+\.\s+/gm
const HORIZONTAL_RULE = /^[\s]*([-*_]){3,}[\s]*$/gm
const BOLD_ITALIC = /(\*\*|__|\*|_)(.*?)\1/g
const HTML_TAG = /<[^>]+>/g

export function prepareTextForSpeech(markdown: string): string | null {
	const trimmed = markdown.trim()
	if (!trimmed) {
		return null
	}

	let text = stripCitationMarkers(trimmed)
	text = text.replace(FENCED_CODE_BLOCK, ' [code block omitted] ')
	text = text.replace(INLINE_CODE, '$1')
	text = text.replace(MARKDOWN_IMAGE, '$1')
	text = text.replace(MARKDOWN_LINK, '$1')
	text = text.replace(URL_PATTERN, ' link ')
	text = text.replace(HEADING_PREFIX, '')
	text = text.replace(BLOCKQUOTE_PREFIX, '')
	text = text.replace(LIST_PREFIX, '')
	text = text.replace(ORDERED_LIST_PREFIX, '')
	text = text.replace(HORIZONTAL_RULE, ' ')
	text = text.replace(BOLD_ITALIC, '$2')
	text = text.replace(HTML_TAG, ' ')
	text = text.replace(/\*{2,}/g, ' ')
	text = text.replace(/_{2,}/g, ' ')
	text = text.replace(/[~^|]/g, ' ')
	text = text.replace(/\s+\n/g, '\n')
	text = text.replace(/\n{3,}/g, '\n\n')
	text = text.replace(/[ \t]{2,}/g, ' ')
	text = text.trim()

	if (!text) {
		return null
	}

	if (isMostlyCode(trimmed)) {
		return 'This response contains mostly code or structured data that is not practical to read aloud.'
	}

	return text
}

function isMostlyCode(source: string): boolean {
	const fencedBlocks = source.match(FENCED_CODE_BLOCK) ?? []
	const fencedLength = fencedBlocks.reduce((total, block) => total + block.length, 0)
	if (fencedLength > source.length * 0.45) {
		return true
	}

	const lines = source.split('\n').filter((line) => line.trim().length > 0)
	if (lines.length === 0) {
		return false
	}

	const codeLikeLines = lines.filter((line) => looksLikeCodeLine(line.trim())).length
	return codeLikeLines / lines.length > 0.55
}

function looksLikeCodeLine(line: string): boolean {
	if (line.startsWith('```')) {
		return true
	}

	if (/^[\s]*[{[\(]/.test(line) && /[}\])];?$/.test(line)) {
		return true
	}

	if (/^(import|export|const|let|var|function|class|interface|type|return|if|for|while)\b/.test(line)) {
		return true
	}

	if (/^\s*[\w.]+\([^)]*\)\s*[{;]?$/.test(line)) {
		return true
	}

	return false
}
