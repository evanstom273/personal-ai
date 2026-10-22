import type Anthropic from '@anthropic-ai/sdk'
import type { MessageSource, MessageWebActivity } from '@/storage/types'

const MAX_FALLBACK_SOURCES = 5

/** Inline citation marker, rendered as a small numbered link. */
function citationMarker(index: number, url: string): string {
	const safeUrl = url.replace(/\(/g, '%28').replace(/\)/g, '%29').replace(/\s/g, '%20')
	return `[\\[${index}\\]](${safeUrl})`
}

const CITATION_MARKER_PATTERN = / ?\[\\\[\d+\\\]\]\([^)\s]+\)/g

/** Removes inline citation markers before a reply is replayed to the model. */
export function stripCitationMarkers(text: string): string {
	return text.replace(CITATION_MARKER_PATTERN, '')
}

const SEARCH_ERROR_LABELS: Record<string, string> = {
	too_many_requests: 'web search was rate limited',
	invalid_tool_input: 'a search query was invalid',
	max_uses_exceeded: 'the per-reply search limit was reached',
	query_too_long: 'a search query was too long',
	request_too_large: 'a search request was too large',
	unavailable: 'web search was temporarily unavailable',
}

const FETCH_ERROR_LABELS: Record<string, string> = {
	url_not_accessible: 'a page could not be loaded',
	url_not_allowed: 'a page is blocked from fetching',
	url_not_in_prior_context: 'a page link was not in the conversation',
	unsupported_content_type: 'a page had an unsupported format',
	url_too_long: 'a page URL was too long',
	too_many_requests: 'page fetching was rate limited',
	max_uses_exceeded: 'the per-reply page limit was reached',
	content_too_large: 'a page was too large to read',
	invalid_tool_input: 'a page URL was invalid',
	unavailable: 'page fetching was temporarily unavailable',
}

function hostnameOf(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '')
	} catch {
		return url
	}
}

function pushUnique(list: string[], value: string): void {
	if (value && !list.includes(value)) {
		list.push(value)
	}
}

function readStringField(input: unknown, field: string): string {
	if (input && typeof input === 'object' && field in input) {
		const value = (input as Record<string, unknown>)[field]
		return typeof value === 'string' ? value.trim() : ''
	}
	return ''
}

/**
 * Builds one displayable reply from every response in a turn. Text from
 * separate tool phases is joined with paragraph breaks, cited passages get
 * numbered markers, and web activity is collected for the sources footer.
 */
export class ReplyAssembler {
	private text = ''
	private lastBlockWasText = false
	private readonly citedSources: MessageSource[] = []
	private readonly fetchedSources: MessageSource[] = []
	private readonly searchResults: MessageSource[] = []
	private readonly searchQueries: string[] = []
	private readonly fetchedUrls: string[] = []
	private readonly failures: string[] = []

	get committedText(): string {
		return this.text
	}

	/** Separator to show before a streaming text block that follows a tool call. */
	separatorBeforeText(pendingText: string): string {
		const current = this.text + pendingText
		if (!current || /\s$/.test(current)) {
			return ''
		}
		return '\n\n'
	}

	get previousBlockWasText(): boolean {
		return this.lastBlockWasText
	}

	addResponse(content: Anthropic.ContentBlock[]): void {
		for (const block of content) {
			switch (block.type) {
				case 'text':
					this.addText(block)
					break
				case 'server_tool_use':
					this.lastBlockWasText = false
					if (block.name === 'web_search') {
						pushUnique(this.searchQueries, readStringField(block.input, 'query'))
					} else if (block.name === 'web_fetch') {
						pushUnique(this.fetchedUrls, readStringField(block.input, 'url'))
					}
					break
				case 'web_search_tool_result':
					this.lastBlockWasText = false
					this.addSearchResult(block)
					break
				case 'web_fetch_tool_result':
					this.lastBlockWasText = false
					this.addFetchResult(block)
					break
				case 'tool_use':
					this.lastBlockWasText = false
					break
				default:
					break
			}
		}
	}

	/** Appends a note to the reply (for example when a reply stops early). */
	appendNote(note: string): void {
		this.text = this.text ? `${this.text.trimEnd()}\n\n${note}` : note
		this.lastBlockWasText = true
	}

	getWebActivity(): MessageWebActivity | undefined {
		const sources = [...this.citedSources]
		for (const source of this.fetchedSources) {
			if (!sources.some((entry) => entry.url === source.url)) {
				sources.push(source)
			}
		}
		if (sources.length === 0) {
			sources.push(...this.searchResults.slice(0, MAX_FALLBACK_SOURCES))
		}

		if (
			sources.length === 0 &&
			this.searchQueries.length === 0 &&
			this.fetchedUrls.length === 0 &&
			this.failures.length === 0
		) {
			return undefined
		}

		return {
			searchQueries: [...this.searchQueries],
			fetchedUrls: [...this.fetchedUrls],
			sources,
			failures: [...this.failures],
		}
	}

	private addText(block: Anthropic.TextBlock): void {
		if (!block.text && !block.citations?.length) {
			return
		}

		if (!this.lastBlockWasText) {
			this.text += this.separatorBeforeText('')
		}

		this.text += block.text
		this.text += this.markersFor(block.citations ?? [])
		this.lastBlockWasText = true
	}

	private markersFor(citations: Anthropic.TextCitation[]): string {
		const markers: string[] = []

		for (const citation of citations) {
			let source: MessageSource | null = null
			if (citation.type === 'web_search_result_location') {
				source = {
					url: citation.url,
					title: citation.title?.trim() || hostnameOf(citation.url),
				}
			} else if (citation.type === 'char_location' || citation.type === 'page_location') {
				const title = citation.document_title?.trim()
				source = title
					? (this.fetchedSources.find((entry) => entry.title === title) ?? null)
					: null
			}

			if (!source) {
				continue
			}

			let index = this.citedSources.findIndex((entry) => entry.url === source.url)
			if (index === -1) {
				this.citedSources.push(source)
				index = this.citedSources.length - 1
			}

			const marker = citationMarker(index + 1, source.url)
			if (!markers.includes(marker)) {
				markers.push(marker)
			}
		}

		return markers.length > 0 ? ` ${markers.join(' ')}` : ''
	}

	private addSearchResult(block: Anthropic.WebSearchToolResultBlock): void {
		if (!Array.isArray(block.content)) {
			const label = SEARCH_ERROR_LABELS[block.content.error_code] ?? 'a web search failed'
			pushUnique(this.failures, label)
			return
		}

		for (const result of block.content) {
			if (!this.searchResults.some((entry) => entry.url === result.url)) {
				this.searchResults.push({
					url: result.url,
					title: result.title?.trim() || hostnameOf(result.url),
				})
			}
		}
	}

	private addFetchResult(block: Anthropic.WebFetchToolResultBlock): void {
		const content = block.content
		if (content.type === 'web_fetch_tool_result_error') {
			pushUnique(this.failures, FETCH_ERROR_LABELS[content.error_code] ?? 'a page could not be read')
			return
		}

		if (!this.fetchedSources.some((entry) => entry.url === content.url)) {
			this.fetchedSources.push({
				url: content.url,
				title: content.content.title?.trim() || hostnameOf(content.url),
			})
		}
	}
}
