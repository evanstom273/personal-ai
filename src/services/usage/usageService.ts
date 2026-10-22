import { addUsageTotals, emptyUsageTotals, formatUsd } from '@/services/claude/pricing'
import { getAllValues } from '@/storage/storageService'
import { getDb } from '@/storage/db'
import type {
	UsageDayRecord,
	UsageFeature,
	UsageTotals,
	UserPreferences,
} from '@/storage/types'

const WARNING_RATIO = 0.8

const listeners = new Set<() => void>()

export function subscribeUsageChanged(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

function notifyUsageChanged(): void {
	for (const listener of listeners) {
		listener()
	}
}

export function localDayKey(date = new Date()): string {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

function emptyDayRecord(day: string): UsageDayRecord {
	return { day, ...emptyUsageTotals(), costByFeature: {} }
}

/** Adds one response's usage to today's local ledger. */
export async function recordUsage(
	feature: UsageFeature,
	totals: UsageTotals,
): Promise<void> {
	if (totals.requests === 0 && totals.costUsd === 0) {
		return
	}

	const day = localDayKey()
	const db = await getDb()
	const tx = db.transaction('usage', 'readwrite')
	const existing = ((await tx.store.get(day)) as UsageDayRecord | undefined) ?? emptyDayRecord(day)
	const merged: UsageDayRecord = {
		...existing,
		...addUsageTotals(existing, totals),
		day,
		costByFeature: {
			...existing.costByFeature,
			[feature]: (existing.costByFeature[feature] ?? 0) + totals.costUsd,
		},
	}
	await tx.store.put(merged, day)
	await tx.done
	notifyUsageChanged()
}

export interface UsageSummary {
	today: UsageDayRecord
	month: UsageDayRecord
	recentDays: UsageDayRecord[]
}

export async function getUsageSummary(now = new Date()): Promise<UsageSummary> {
	const records = await getAllValues<UsageDayRecord>('usage')
	const todayKey = localDayKey(now)
	const monthPrefix = todayKey.slice(0, 7)

	const today = records.find((record) => record.day === todayKey) ?? emptyDayRecord(todayKey)
	const month = records
		.filter((record) => record.day.startsWith(monthPrefix))
		.reduce<UsageDayRecord>((total, record) => {
			const costByFeature = { ...total.costByFeature }
			for (const [feature, cost] of Object.entries(record.costByFeature)) {
				const key = feature as UsageFeature
				costByFeature[key] = (costByFeature[key] ?? 0) + (cost ?? 0)
			}
			return { ...total, ...addUsageTotals(total, record), costByFeature }
		}, emptyDayRecord(monthPrefix))

	const recentDays = [...records]
		.sort((a, b) => b.day.localeCompare(a.day))
		.slice(0, 14)

	return { today, month, recentDays }
}

export async function clearUsageHistory(): Promise<void> {
	const db = await getDb()
	await db.clear('usage')
	notifyUsageChanged()
}

export interface SpendingStatus {
	blocked: boolean
	message: string | null
	warning: string | null
	todayCostUsd: number
	monthCostUsd: number
}

const LIMIT_SCOPE_NOTE =
	'This limit only applies inside this app on this device — it cannot stop other use of your API key. Set a hard spend limit in the Claude Console for that.'

export function evaluateSpending(
	preferences: Pick<
		UserPreferences,
		'dailySpendLimitUsd' | 'monthlySpendLimitUsd' | 'spendWarningsEnabled'
	>,
	todayCostUsd: number,
	monthCostUsd: number,
): SpendingStatus {
	const daily = preferences.dailySpendLimitUsd > 0 ? preferences.dailySpendLimitUsd : 0
	const monthly = preferences.monthlySpendLimitUsd > 0 ? preferences.monthlySpendLimitUsd : 0

	const reached: string[] = []
	if (daily && todayCostUsd >= daily) {
		reached.push(`today's limit of ${formatUsd(daily)}`)
	}
	if (monthly && monthCostUsd >= monthly) {
		reached.push(`this month's limit of ${formatUsd(monthly)}`)
	}

	if (reached.length > 0) {
		return {
			blocked: true,
			message: `Local spending limit reached (${reached.join(' and ')}). Raise or clear it in Settings → Usage to keep chatting. ${LIMIT_SCOPE_NOTE}`,
			warning: null,
			todayCostUsd,
			monthCostUsd,
		}
	}

	let warning: string | null = null
	if (preferences.spendWarningsEnabled) {
		if (monthly && monthCostUsd >= monthly * WARNING_RATIO) {
			warning = `You've used ${formatUsd(monthCostUsd)} of your ${formatUsd(monthly)} monthly limit.`
		} else if (daily && todayCostUsd >= daily * WARNING_RATIO) {
			warning = `You've used ${formatUsd(todayCostUsd)} of your ${formatUsd(daily)} daily limit.`
		}
	}

	return { blocked: false, message: null, warning, todayCostUsd, monthCostUsd }
}

export async function getSpendingStatus(
	preferences: Pick<
		UserPreferences,
		'dailySpendLimitUsd' | 'monthlySpendLimitUsd' | 'spendWarningsEnabled'
	>,
): Promise<SpendingStatus> {
	const summary = await getUsageSummary()
	return evaluateSpending(preferences, summary.today.costUsd, summary.month.costUsd)
}

export class SpendingLimitError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'SpendingLimitError'
	}
}

/** Throws before a request is sent when a local limit has been reached. */
export async function assertWithinSpendingLimit(
	preferences: Pick<
		UserPreferences,
		'dailySpendLimitUsd' | 'monthlySpendLimitUsd' | 'spendWarningsEnabled'
	>,
): Promise<void> {
	const status = await getSpendingStatus(preferences)
	if (status.blocked && status.message) {
		throw new SpendingLimitError(status.message)
	}
}
