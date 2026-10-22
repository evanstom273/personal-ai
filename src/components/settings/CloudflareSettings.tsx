import { Cloud, ExternalLink, PlugZap, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { usePreferencesContext } from '@/providers/ChatProvider'
import { CloudflareError, getCloudflareAvailability } from '@/services/cloudflare/client'
import { CF_MODELS } from '@/services/cloudflare/constants'
import { embedTexts } from '@/services/cloudflare/embeddings'
import type { UserPreferences } from '@/storage/types'
import { isCapacitorNativePlatform } from '@/utils/capacitor'

type FeatureKey = 'cfImageGeneration' | 'cfTranscription' | 'cfSemanticMemory'

const FEATURES: Array<{ key: FeatureKey; label: string; description: string }> = [
	{
		key: 'cfImageGeneration',
		label: 'Image generation',
		description: `Ask JARVIS for a picture and it creates one with FLUX.1 [schnell] (${CF_MODELS.image}). Square 1024×1024 only, about 58 neurons per image.`,
	},
	{
		key: 'cfTranscription',
		label: 'Voice transcription',
		description: `The mic records a clip and Whisper Large V3 Turbo transcribes it (${CF_MODELS.transcription}), about 47 neurons per minute.`,
	},
	{
		key: 'cfSemanticMemory',
		label: 'Semantic memory',
		description: `Memories are searched by meaning and near-duplicates are skipped, using BGE-M3 embeddings (${CF_MODELS.embeddings}). Costs a tiny fraction of a neuron per memory.`,
	},
]

export function CloudflareSettings() {
	const { preferences, savePreferences } = usePreferencesContext()
	const [accountId, setAccountId] = useState('')
	const [apiToken, setApiToken] = useState('')
	const [saved, setSaved] = useState(false)
	const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null)
	const [isTesting, setIsTesting] = useState(false)
	const isNative = isCapacitorNativePlatform()
	const availability = getCloudflareAvailability(preferences)

	useEffect(() => {
		setAccountId(preferences.cloudflareAccountId)
		setApiToken(preferences.cloudflareApiToken)
	}, [preferences.cloudflareAccountId, preferences.cloudflareApiToken])

	async function save(patch: Partial<UserPreferences>): Promise<void> {
		await savePreferences({ ...preferences, ...patch })
	}

	async function handleSave(): Promise<void> {
		await save({ cloudflareAccountId: accountId.trim(), cloudflareApiToken: apiToken.trim() })
		setSaved(true)
		setTestMessage(null)
	}

	async function handleTest(): Promise<void> {
		setIsTesting(true)
		setTestMessage(null)
		try {
			await embedTexts(
				{ ...preferences, cloudflareAccountId: accountId.trim(), cloudflareApiToken: apiToken.trim() },
				['connection test'],
			)
			setTestMessage({ ok: true, text: 'Connected to Cloudflare Workers AI.' })
		} catch (error) {
			setTestMessage({
				ok: false,
				text: error instanceof CloudflareError || error instanceof Error ? error.message : 'Test failed.',
			})
		} finally {
			setIsTesting(false)
		}
	}

	return (
		<section className="surface-panel space-y-4 rounded-xl p-5">
			<div className="flex items-center gap-2">
				<Cloud className="h-5 w-5 text-primary" />
				<h3 className="text-sm font-medium">Cloudflare Workers AI</h3>
			</div>
			<p className="text-sm text-muted-foreground">
				Optional extras on Cloudflare&apos;s free daily allowance (10,000 neurons, reset at
				00:00 UTC). Claude still handles the conversation. When the allowance runs out,
				these features pause until it resets — the app never uses paid inference.
			</p>

			{!isNative ? (
				<div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
					Cloudflare features only work in the Android app. Cloudflare&apos;s API blocks
					requests made from web pages (it doesn&apos;t support CORS), and this app has no
					server to relay them. You can still save your details here.
				</div>
			) : null}

			<div className="space-y-2">
				<label htmlFor="cf-account" className="text-sm font-medium">
					Account ID
				</label>
				<input
					id="cf-account"
					value={accountId}
					onChange={(event) => {
						setAccountId(event.target.value)
						setSaved(false)
					}}
					placeholder="32-character account ID"
					autoComplete="off"
					spellCheck={false}
					className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
				/>
			</div>
			<div className="space-y-2">
				<label htmlFor="cf-token" className="text-sm font-medium">
					API token
				</label>
				<input
					id="cf-token"
					type="password"
					value={apiToken}
					onChange={(event) => {
						setApiToken(event.target.value)
						setSaved(false)
					}}
					placeholder="Token with Workers AI permissions"
					autoComplete="off"
					spellCheck={false}
					className="w-full rounded-lg surface-input px-3 py-2 text-sm outline-none ring-ring focus:ring-2"
				/>
			</div>
			<p className="text-xs text-muted-foreground">
				Create a token on the{' '}
				<a
					href="https://dash.cloudflare.com/profile/api-tokens"
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-1 text-primary hover:underline"
				>
					Cloudflare dashboard
					<ExternalLink className="h-3 w-3" />
				</a>{' '}
				with <span className="font-medium text-foreground">Workers AI: Read</span> and{' '}
				<span className="font-medium text-foreground">Workers AI: Edit</span>. Both values
				stay on this device in IndexedDB.
			</p>
			<div className="flex flex-wrap items-center gap-3">
				<Button onClick={() => void handleSave()}>
					<Save className="h-4 w-4" />
					Save
				</Button>
				<Button
					variant="outline"
					onClick={() => void handleTest()}
					disabled={isTesting || !isNative || !accountId.trim() || !apiToken.trim()}
				>
					<PlugZap className="h-4 w-4" />
					{isTesting ? 'Testing…' : 'Test connection'}
				</Button>
				{saved ? <span className="text-sm text-primary">Saved</span> : null}
			</div>
			{testMessage ? (
				<p className={testMessage.ok ? 'text-sm text-primary' : 'text-sm text-destructive'}>
					{testMessage.text}
				</p>
			) : null}

			<div className="space-y-2 border-t border-border/60 pt-4">
				{FEATURES.map((feature) => (
					<label
						key={feature.key}
						className="flex items-start gap-3 rounded-lg border border-border/60 px-3 py-3 text-sm"
					>
						<input
							type="checkbox"
							checked={preferences[feature.key]}
							onChange={(event) => void save({ [feature.key]: event.target.checked })}
							className="mt-0.5"
						/>
						<span>
							<span className="block font-medium">{feature.label}</span>
							<span className="mt-1 block text-muted-foreground">{feature.description}</span>
						</span>
					</label>
				))}
				<p className="text-xs text-muted-foreground">
					Read-aloud with a Cloudflare voice is under Settings → Voice.{' '}
					{availability.ok ? '' : 'These switches take effect once Cloudflare is available.'}
				</p>
			</div>
		</section>
	)
}
