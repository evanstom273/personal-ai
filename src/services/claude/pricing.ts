import type Anthropic from '@anthropic-ai/sdk'
import type { UsageTotals } from '@/storage/types'

/**
 * Claude Haiku 5.5 list prices in USD per million tokens, from
 * https://platform.claude.com/docs/en/about-claude/pricing (checked 2026-10-22).
 * A request whose prompt (uncached input + cache reads + cache writes) is over
 * 100,000 tokens is billed entirely at the long-prompt rates.
 */
export const HAIKU_PRICING = {
	pricesAsOf: '2026-10-22',
	longPromptThresholdTokens: 100_000,
	standard: {
		input: 0.1,
		cacheWrite5m: 0.125,
		cacheWrite1h: 0.2,
		cacheRead: 0.01,
		output: 0.5,
	},
	longPrompt: {
		input: 0.5,
		cacheWrite5m: 0.625,
		cacheWrite1h: 1,
		cacheRead: 0.05,
		output: 2.5,
	},
	/** Web search is $10 per 1,000 searches; failed searches are not billed. Web fetch has no fee. */
	webSearchPerRequest: 0.01,
} as const

type ApiUsage = Pick<
	Anthropic.Usage,
	| 'input_tokens'
	| 'output_tokens'
	| 'cache_creation_input_tokens'
	| 'cache_read_input_tokens'
	| 'cache_creation'
	| 'server_tool_use'
>

export function emptyUsageTotals(): UsageTotals {
	return {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		webSearches: 0,
		webFetches: 0,
		requests: 0,
		costUsd: 0,
	}
}

export function addUsageTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
		cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
		webSearches: a.webSearches + b.webSearches,
		webFetches: a.webFetches + b.webFetches,
		requests: a.requests + b.requests,
		costUsd: a.costUsd + b.costUsd,
	}
}

/** Estimated cost of one Messages API response. */
export function usageToTotals(usage: ApiUsage): UsageTotals {
	const input = usage.input_tokens ?? 0
	const output = usage.output_tokens ?? 0
	const cacheRead = usage.cache_read_input_tokens ?? 0
	const cacheWrite = usage.cache_creation_input_tokens ?? 0
	const cacheWrite1h = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
	const cacheWrite5m = Math.max(0, cacheWrite - cacheWrite1h)
	const webSearches = usage.server_tool_use?.web_search_requests ?? 0
	const webFetches = usage.server_tool_use?.web_fetch_requests ?? 0

	const promptTokens = input + cacheRead + cacheWrite
	const rates =
		promptTokens > HAIKU_PRICING.longPromptThresholdTokens
			? HAIKU_PRICING.longPrompt
			: HAIKU_PRICING.standard

	const tokenCost =
		(input * rates.input +
			cacheWrite5m * rates.cacheWrite5m +
			cacheWrite1h * rates.cacheWrite1h +
			cacheRead * rates.cacheRead +
			output * rates.output) /
		1_000_000

	return {
		inputTokens: input,
		outputTokens: output,
		cacheReadTokens: cacheRead,
		cacheWriteTokens: cacheWrite,
		webSearches,
		webFetches,
		requests: 1,
		costUsd: tokenCost + webSearches * HAIKU_PRICING.webSearchPerRequest,
	}
}

export function formatUsd(value: number): string {
	if (value === 0) {
		return '$0.00'
	}
	if (value < 0.01) {
		return `$${value.toFixed(4)}`
	}
	if (value < 1) {
		return `$${value.toFixed(3)}`
	}
	return `$${value.toFixed(2)}`
}

export function formatTokenCount(value: number): string {
	return new Intl.NumberFormat(undefined, {
		notation: value >= 100_000 ? 'compact' : 'standard',
		maximumFractionDigits: 1,
	}).format(value)
}
