import { ExternalLink, Gauge, Save, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { useUsageSummary } from '@/hooks/useUsageSummary'
import { usePreferencesContext } from '@/providers/ChatProvider'
import { CLAUDE_MODEL_NAME } from '@/services/claude/constants'
import {
	HAIKU_PRICING,
	formatTokenCount,
	formatUsd,
} from '@/services/claude/pricing'
import {
	clearUsageHistory,
	evaluateSpending,
} from '@/services/usage/usageService'
import type { UsageDayRecord, UsageFeature } from '@/storage/types'

const FEATURE_LABELS: Record<UsageFeature, string> = {
	chat: 'Chat',
	memory: 'Memory archiving',
	documents: 'Document AI',
	scratchpad: 'Scratchpad',
}

function parseLimit(value: string): number {
	const parsed = Number.parseFloat(value.replace(/[^0-9.]/g, ''))
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function formatDay(day: string): string {
	const [year, month, date] = day.split('-').map(Number)
	if (!year || !month || !date) {
		return day
	}
	return new Date(year, month - 1, date).toLocaleDateString(undefined, {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
	})
}

export function UsageSettings() {
	const { preferences, savePreferences } = usePreferencesContext()
	const { summary } = useUsageSummary()
	const [dailyLimit, setDailyLimit] = useState('')
	const [monthlyLimit, setMonthlyLimit] = useState('')
	const [warningsEnabled, setWarningsEnabled] = useState(true)
	const [saved, setSaved] = useState(false)
	const [isSaving, setIsSaving] = useState(false)

	useEffect(() => {
		setDailyLimit(preferences.dailySpendLimitUsd ? String(preferences.dailySpendLimitUsd) : '')
		setMonthlyLimit(
			preferences.monthlySpendLimitUsd ? String(preferences.monthlySpendLimitUsd) : '',
		)
		setWarningsEnabled(preferences.spendWarningsEnabled)
	}, [
		preferences.dailySpendLimitUsd,
		preferences.monthlySpendLimitUsd,
		preferences.spendWarningsEnabled,
	])

	const status = summary
		? evaluateSpending(preferences, summary.today.costUsd, summary.month.costUsd)
		: null

	async function handleSaveLimits(): Promise<void> {
		setIsSaving(true)
		setSaved(false)
		try {
			await savePreferences({
				...preferences,
				dailySpendLimitUsd: parseLimit(dailyLimit),
				monthlySpendLimitUsd: parseLimit(monthlyLimit),
				spendWarningsEnabled: warningsEnabled,
			})
			setSaved(true)
		} finally {
			setIsSaving(false)
		}
	}

	async function handleClearHistory(): Promise<void> {
		if (
			window.confirm(
				'Clear the local usage history? This resets the daily and monthly totals used for your spending limits.',
			)
		) {
			await clearUsageHistory()
		}
	}

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-lg font-semibold">Usage & spending</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Estimated Claude API costs from this device, worked out from the token
					counts each response reports.
				</p>
			</div>

			{status?.blocked ? (
				<div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
					{status.message}
				</div>
			) : status?.warning ? (
				<div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
					{status.warning}
				</div>
			) : null}

			<div className="grid gap-3 sm:grid-cols-2">
				<UsageCard title="Today" record={summary?.today} />
				<UsageCard title="This month" record={summary?.month} />
			</div>

			<section className="surface-panel space-y-3 rounded-xl p-5">
				<h3 className="text-sm font-medium">This month by feature</h3>
				<ul className="space-y-1.5 text-sm">
					{(Object.keys(FEATURE_LABELS) as UsageFeature[]).map((feature) => (
						<li key={feature} className="flex items-center justify-between gap-3">
							<span className="text-muted-foreground">{FEATURE_LABELS[feature]}</span>
							<span className="tabular-nums">
								{formatUsd(summary?.month.costByFeature[feature] ?? 0)}
							</span>
						</li>
					))}
				</ul>
			</section>

			{summary && summary.recentDays.length > 0 ? (
				<section className="surface-panel space-y-3 rounded-xl p-5">
					<h3 className="text-sm font-medium">Recent days</h3>
					<ul className="divide-y divide-border/60 text-sm">
						{summary.recentDays.map((day) => (
							<li key={day.day} className="flex items-center justify-between gap-3 py-1.5">
								<span>{formatDay(day.day)}</span>
								<span className="flex items-center gap-3 tabular-nums text-muted-foreground">
									<span>
										{day.requests} request{day.requests === 1 ? '' : 's'}
										{day.webSearches > 0
											? ` · ${day.webSearches} search${day.webSearches === 1 ? '' : 'es'}`
											: ''}
									</span>
									<span className="font-medium text-foreground">{formatUsd(day.costUsd)}</span>
								</span>
							</li>
						))}
					</ul>
				</section>
			) : null}

			<section className="surface-panel space-y-4 rounded-xl p-5">
				<div className="flex items-center gap-2">
					<Gauge className="h-5 w-5 text-primary" />
					<h3 className="text-sm font-medium">Spending limits</h3>
				</div>
				<p className="text-sm text-muted-foreground">
					When a limit is reached, the app stops sending new requests until the
					next day or month. Leave a field empty for no limit.
				</p>
				<div className="grid gap-4 sm:grid-cols-2">
					<LimitField label="Daily limit (USD)" value={dailyLimit} onChange={(value) => {
						setDailyLimit(value)
						setSaved(false)
					}} placeholder="e.g. 0.50" />
					<LimitField label="Monthly limit (USD)" value={monthlyLimit} onChange={(value) => {
						setMonthlyLimit(value)
						setSaved(false)
					}} placeholder="e.g. 5" />
				</div>
				<label className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm">
					<input
						type="checkbox"
						checked={warningsEnabled}
						onChange={(event) => {
							setWarningsEnabled(event.target.checked)
							setSaved(false)
						}}
						className="mt-0.5"
					/>
					<span>
						<span className="block font-medium">Warn me near a limit</span>
						<span className="mt-1 block text-muted-foreground">
							Shows a notice in chat once 80% of a limit has been used.
						</span>
					</span>
				</label>
				<div className="flex flex-wrap items-center gap-3">
					<Button onClick={() => void handleSaveLimits()} disabled={isSaving}>
						<Save className="h-4 w-4" />
						{isSaving ? 'Saving…' : 'Save limits'}
					</Button>
					{saved ? <span className="text-sm text-primary">Limits saved</span> : null}
				</div>
				<p className="text-xs text-muted-foreground">
					These limits only apply inside this app on this device. They can&apos;t stop
					your API key being used elsewhere — for a hard cap, set a spend limit on the{' '}
					<a
						href="https://platform.claude.com/settings/billing"
						target="_blank"
						rel="noreferrer"
						className="inline-flex items-center gap-1 text-primary hover:underline"
					>
						Claude Console billing page
						<ExternalLink className="h-3 w-3" />
					</a>
					.
				</p>
			</section>

			<section className="surface-panel space-y-3 rounded-xl p-5">
				<h3 className="text-sm font-medium">How costs are estimated</h3>
				<p className="text-sm text-muted-foreground">
					{CLAUDE_MODEL_NAME} list prices per million tokens (as of{' '}
					{HAIKU_PRICING.pricesAsOf}):
				</p>
				<ul className="space-y-1 text-sm text-muted-foreground">
					<PriceRow label="Input" value={HAIKU_PRICING.standard.input} />
					<PriceRow label="Output" value={HAIKU_PRICING.standard.output} />
					<PriceRow label="Cache write (5 min)" value={HAIKU_PRICING.standard.cacheWrite5m} />
					<PriceRow label="Cache read" value={HAIKU_PRICING.standard.cacheRead} />
					<li className="flex justify-between gap-3">
						<span>Web search</span>
						<span className="tabular-nums">$10 per 1,000 searches</span>
					</li>
					<li className="flex justify-between gap-3">
						<span>Web page fetch</span>
						<span className="tabular-nums">tokens only</span>
					</li>
				</ul>
				<p className="text-xs text-muted-foreground">
					A single request over 100,000 prompt tokens is billed at 5× these rates,
					so the app keeps chat context well below that. The app caches its system
					prompt and recent history, so repeat context is mostly billed at the
					cache-read rate. Estimates can differ slightly from your Anthropic invoice.
				</p>
				<Button
					type="button"
					variant="outline"
					size="sm"
					className="text-destructive hover:text-destructive"
					onClick={() => void handleClearHistory()}
				>
					<Trash2 className="h-4 w-4" />
					Clear usage history
				</Button>
			</section>
		</div>
	)
}

function UsageCard({ title, record }: { title: string; record?: UsageDayRecord }) {
	const promptTokens =
		(record?.inputTokens ?? 0) + (record?.cacheReadTokens ?? 0) + (record?.cacheWriteTokens ?? 0)
	const cacheShare = promptTokens > 0 ? Math.round(((record?.cacheReadTokens ?? 0) / promptTokens) * 100) : 0

	return (
		<section className="surface-panel space-y-2 rounded-xl p-5">
			<h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
			<p className="text-2xl font-semibold tabular-nums">{formatUsd(record?.costUsd ?? 0)}</p>
			<dl className="space-y-1 text-xs text-muted-foreground">
				<Stat label="Requests">{record?.requests ?? 0}</Stat>
				<Stat label="Input tokens">
					{formatTokenCount(promptTokens)}
					{cacheShare > 0 ? ` (${cacheShare}% cached)` : ''}
				</Stat>
				<Stat label="Output tokens">{formatTokenCount(record?.outputTokens ?? 0)}</Stat>
				<Stat label="Web searches">{record?.webSearches ?? 0}</Stat>
			</dl>
		</section>
	)
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex justify-between gap-3">
			<dt>{label}</dt>
			<dd className="tabular-nums text-foreground">{children}</dd>
		</div>
	)
}

function PriceRow({ label, value }: { label: string; value: number }) {
	return (
		<li className="flex justify-between gap-3">
			<span>{label}</span>
			<span className="tabular-nums">${value.toFixed(3).replace(/0$/, '')} / MTok</span>
		</li>
	)
}

function LimitField({
	label,
	value,
	onChange,
	placeholder,
}: {
	label: string
	value: string
	onChange: (value: string) => void
	placeholder: string
}) {
	return (
		<label className="space-y-2 text-sm">
			<span className="block font-medium">{label}</span>
			<input
				inputMode="decimal"
				value={value}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder}
				className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
			/>
		</label>
	)
}
