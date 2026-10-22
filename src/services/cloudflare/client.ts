import { CapacitorHttp } from '@capacitor/core'
import {
	CF_API_BASE,
	type CloudflareFeature,
} from '@/services/cloudflare/constants'
import {
	describeAllowance,
	getCloudflareUsageToday,
	recordCloudflareError,
	recordCloudflareSuccess,
} from '@/services/cloudflare/usage'
import type { UserPreferences } from '@/storage/types'
import { isCapacitorNativePlatform } from '@/utils/capacitor'

/**
 * Cloudflare's REST API sends no CORS headers (its preflight answers 405), so
 * browsers block every call from the web app. The Android app sends requests
 * through Capacitor's native HTTP stack, which is not subject to CORS.
 */
export const CLOUDFLARE_BROWSER_LIMITATION =
	'Cloudflare features only work in the Android app: Cloudflare’s API blocks requests from web pages (no CORS support), and there is no server in this app to relay them.'

export type CloudflareAvailability = { ok: true } | { ok: false; reason: string }

type CloudflarePreferences = Pick<UserPreferences, 'cloudflareAccountId' | 'cloudflareApiToken'>

export function getCloudflareAvailability(preferences: CloudflarePreferences): CloudflareAvailability {
	if (!isCapacitorNativePlatform()) {
		return { ok: false, reason: CLOUDFLARE_BROWSER_LIMITATION }
	}
	if (!preferences.cloudflareAccountId.trim() || !preferences.cloudflareApiToken.trim()) {
		return { ok: false, reason: 'Add your Cloudflare account ID and API token in Settings → API.' }
	}
	return { ok: true }
}

export class CloudflareError extends Error {
	readonly exhausted: boolean

	constructor(message: string, exhausted = false) {
		super(message)
		this.name = 'CloudflareError'
		this.exhausted = exhausted
	}
}

function formatReset(date: Date): string {
	return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/** Throws when today's free allocation is used up (reported by Cloudflare or estimated locally). */
export async function assertCloudflareAllowance(): Promise<void> {
	const allowance = describeAllowance(await getCloudflareUsageToday())
	if (allowance.exhausted) {
		throw new CloudflareError(
			`Today’s free Cloudflare AI allowance is used up. It resets at ${formatReset(allowance.resetsAt)} (00:00 UTC). Paid usage is never used.`,
			true,
		)
	}
}

interface CloudflareEnvelope<T> {
	success?: boolean
	result?: T
	errors?: Array<{ code?: number; message?: string }>
}

function describeFailure(status: number, envelope: CloudflareEnvelope<unknown> | null): CloudflareError {
	const first = envelope?.errors?.[0]
	const code = first?.code
	const message = first?.message ?? ''

	if (code === 3036 || /daily free allocation/i.test(message)) {
		return new CloudflareError(
			'Today’s free Cloudflare AI allowance (10,000 neurons) is used up. It resets at 00:00 UTC. Paid usage is never used.',
			true,
		)
	}
	if (code === 5035) {
		return new CloudflareError('This Cloudflare model needs a Workers Paid plan, so it is not used.')
	}
	if (status === 401 || status === 403 || code === 10000) {
		return new CloudflareError(
			'Cloudflare rejected the credentials. Check the account ID and that the API token has Workers AI permissions.',
		)
	}
	if (code === 3040 || status === 429) {
		return new CloudflareError('Cloudflare AI is busy or rate limited. Try again in a moment.')
	}
	return new CloudflareError(
		`Cloudflare AI request failed (${status}${code ? `, code ${code}` : ''})${message ? `: ${message}` : ''}`,
	)
}

/**
 * Runs a Workers AI model through the REST API. Every call is counted against
 * the local estimate of the free daily allowance and refused once it is used up.
 */
export async function runCloudflareModel<T>(
	preferences: CloudflarePreferences,
	model: string,
	body: Record<string, unknown>,
	usage: { feature: CloudflareFeature; neurons: number },
): Promise<T> {
	const availability = getCloudflareAvailability(preferences)
	if (!availability.ok) {
		throw new CloudflareError(availability.reason)
	}
	await assertCloudflareAllowance()

	const url = `${CF_API_BASE}/${encodeURIComponent(preferences.cloudflareAccountId.trim())}/ai/run/${model}`
	let status = 0
	let envelope: CloudflareEnvelope<T> | null = null

	try {
		const response = await CapacitorHttp.request({
			url,
			method: 'POST',
			headers: {
				Authorization: `Bearer ${preferences.cloudflareApiToken.trim()}`,
				'Content-Type': 'application/json',
			},
			data: body,
			responseType: 'json',
			connectTimeout: 15_000,
			readTimeout: 90_000,
		})
		status = response.status
		envelope =
			typeof response.data === 'string'
				? (JSON.parse(response.data) as CloudflareEnvelope<T>)
				: (response.data as CloudflareEnvelope<T>)
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Network error'
		void recordCloudflareError(message, false)
		throw new CloudflareError(`Could not reach Cloudflare AI: ${message}`)
	}

	if (status < 200 || status >= 300 || envelope?.success === false || envelope?.result === undefined) {
		const failure = describeFailure(status, envelope)
		await recordCloudflareError(failure.message, failure.exhausted)
		throw failure
	}

	void recordCloudflareSuccess(usage.feature, usage.neurons)
	return envelope.result
}
