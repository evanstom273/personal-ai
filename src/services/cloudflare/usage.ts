import {
	CF_FREE_NEURONS_PER_DAY,
	CF_LOCAL_NEURON_CAP,
	type CloudflareFeature,
} from '@/services/cloudflare/constants'
import { getValue, setValue } from '@/storage/storageService'

const LEDGER_KEY = 'cloudflareUsage'
const KEEP_DAYS = 31

export interface CloudflareDayUsage {
	/** UTC calendar day — Cloudflare's free allocation resets at 00:00 UTC. */
	day: string
	requests: number
	errors: number
	estimatedNeurons: number
	byFeature: Partial<Record<CloudflareFeature, { requests: number; neurons: number }>>
	/** Set when Cloudflare reported the daily free allocation as used up. */
	allocationExhausted: boolean
	lastError?: string
}

type Ledger = Record<string, CloudflareDayUsage>

const listeners = new Set<() => void>()

export function subscribeCloudflareUsage(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

export function utcDayKey(date = new Date()): string {
	return date.toISOString().slice(0, 10)
}

function emptyDay(day: string): CloudflareDayUsage {
	return { day, requests: 0, errors: 0, estimatedNeurons: 0, byFeature: {}, allocationExhausted: false }
}

async function readLedger(): Promise<Ledger> {
	return (await getValue<Ledger>('cache', LEDGER_KEY)) ?? {}
}

let writeQueue: Promise<unknown> = Promise.resolve()

async function updateToday(update: (day: CloudflareDayUsage) => CloudflareDayUsage): Promise<void> {
	writeQueue = writeQueue.then(async () => {
		const ledger = await readLedger()
		const key = utcDayKey()
		ledger[key] = update(ledger[key] ?? emptyDay(key))
		const keys = Object.keys(ledger).sort().reverse()
		for (const stale of keys.slice(KEEP_DAYS)) {
			delete ledger[stale]
		}
		await setValue('cache', LEDGER_KEY, ledger)
	})
	await writeQueue
	for (const listener of listeners) listener()
}

export async function getCloudflareUsageToday(): Promise<CloudflareDayUsage> {
	const ledger = await readLedger()
	const key = utcDayKey()
	return ledger[key] ?? emptyDay(key)
}

export async function getCloudflareUsageDays(): Promise<CloudflareDayUsage[]> {
	return Object.values(await readLedger()).sort((a, b) => b.day.localeCompare(a.day))
}

export function recordCloudflareSuccess(feature: CloudflareFeature, neurons: number): Promise<void> {
	return updateToday((day) => {
		const current = day.byFeature[feature] ?? { requests: 0, neurons: 0 }
		return {
			...day,
			requests: day.requests + 1,
			estimatedNeurons: day.estimatedNeurons + neurons,
			byFeature: {
				...day.byFeature,
				[feature]: { requests: current.requests + 1, neurons: current.neurons + neurons },
			},
		}
	})
}

export function recordCloudflareError(message: string, exhausted: boolean): Promise<void> {
	return updateToday((day) => ({
		...day,
		errors: day.errors + 1,
		lastError: message,
		allocationExhausted: day.allocationExhausted || exhausted,
	}))
}

export interface CloudflareAllowance {
	estimatedNeuronsUsed: number
	estimatedRemaining: number
	exhausted: boolean
	resetsAt: Date
}

export function nextUtcMidnight(now = new Date()): Date {
	return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
}

export function describeAllowance(day: CloudflareDayUsage): CloudflareAllowance {
	return {
		estimatedNeuronsUsed: day.estimatedNeurons,
		estimatedRemaining: Math.max(0, CF_FREE_NEURONS_PER_DAY - day.estimatedNeurons),
		exhausted: day.allocationExhausted || day.estimatedNeurons >= CF_LOCAL_NEURON_CAP,
		resetsAt: nextUtcMidnight(),
	}
}
