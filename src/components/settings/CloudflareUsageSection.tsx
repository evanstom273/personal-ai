import { Cloud } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { CF_FREE_NEURONS_PER_DAY, type CloudflareFeature } from '@/services/cloudflare/constants'
import {
	describeAllowance,
	getCloudflareUsageDays,
	subscribeCloudflareUsage,
	utcDayKey,
	type CloudflareDayUsage,
} from '@/services/cloudflare/usage'

const FEATURE_LABELS: Record<CloudflareFeature, string> = {
	image: 'Image generation',
	transcription: 'Voice transcription',
	speech: 'Read-aloud',
	embeddings: 'Semantic memory',
}

function formatNeurons(value: number): string {
	return new Intl.NumberFormat(undefined, { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value)
}

export function CloudflareUsageSection() {
	const [days, setDays] = useState<CloudflareDayUsage[]>([])

	const refresh = useCallback(async () => {
		setDays(await getCloudflareUsageDays())
	}, [])

	useEffect(() => {
		void refresh()
		return subscribeCloudflareUsage(() => void refresh())
	}, [refresh])

	const todayKey = utcDayKey()
	const today = days.find((day) => day.day === todayKey) ?? {
		day: todayKey,
		requests: 0,
		errors: 0,
		estimatedNeurons: 0,
		byFeature: {},
		allocationExhausted: false,
	}
	const allowance = describeAllowance(today)
	const usedShare = Math.min(100, (allowance.estimatedNeuronsUsed / CF_FREE_NEURONS_PER_DAY) * 100)

	return (
		<section className="surface-panel space-y-4 rounded-xl p-5">
			<div className="flex items-center gap-2">
				<Cloud className="h-5 w-5 text-primary" />
				<h3 className="text-sm font-medium">Cloudflare Workers AI (today, UTC)</h3>
			</div>
			<p className="text-sm text-muted-foreground">
				Tracked separately from Claude. Cloudflare doesn&apos;t report remaining allowance, so
				neurons are estimated from its published per-model rates. Resets at{' '}
				{allowance.resetsAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.
			</p>

			{allowance.exhausted ? (
				<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
					Today&apos;s free allowance is used up, so Cloudflare features are paused until the
					reset. Paid inference is never used.
				</div>
			) : null}

			<div>
				<div className="flex justify-between text-sm">
					<span className="text-muted-foreground">Estimated neurons used</span>
					<span className="tabular-nums">
						{formatNeurons(allowance.estimatedNeuronsUsed)} / {formatNeurons(CF_FREE_NEURONS_PER_DAY)}
					</span>
				</div>
				<div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary">
					<div className="h-full rounded-full bg-primary" style={{ width: `${usedShare}%` }} />
				</div>
				<p className="mt-1 text-xs text-muted-foreground">
					About {formatNeurons(allowance.estimatedRemaining)} neurons left today (estimate).
				</p>
			</div>

			<ul className="space-y-1.5 text-sm">
				{(Object.keys(FEATURE_LABELS) as CloudflareFeature[]).map((feature) => {
					const entry = today.byFeature[feature]
					return (
						<li key={feature} className="flex justify-between gap-3">
							<span className="text-muted-foreground">{FEATURE_LABELS[feature]}</span>
							<span className="tabular-nums">
								{entry?.requests ?? 0} req · {formatNeurons(entry?.neurons ?? 0)} neurons
							</span>
						</li>
					)
				})}
				<li className="flex justify-between gap-3 border-t border-border/60 pt-1.5">
					<span className="text-muted-foreground">Total requests · errors</span>
					<span className="tabular-nums">
						{today.requests} · {today.errors}
					</span>
				</li>
			</ul>
			{today.lastError ? (
				<p className="text-xs text-muted-foreground">Last error: {today.lastError}</p>
			) : null}
		</section>
	)
}
