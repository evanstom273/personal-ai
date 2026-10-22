import { ArrowLeftRight, X, FileText, Kanban, Layers } from 'lucide-react'
import { ChatConversationActions } from '@/components/chat/ChatConversationActions'
import { Button } from '@/components/ui/button'
import { formatAppVersionLabel } from '@/data/changelog'
import { useFoldablePane } from '@/hooks/useFoldablePane'
import {
	useChatHeaderSlot,
	useConversationsContext,
	usePreferencesContext,
} from '@/providers/ChatProvider'
import { getConfiguredAiName } from '@/services/claude/systemInstruction'

function getPaneTitle(route: string, aiName: string): { title: string; icon: typeof Layers } {
	if (!route || route === '/chat') return { title: aiName, icon: Layers }
	if (route.startsWith('/library/documents/')) return { title: 'Document Editor', icon: FileText }
	if (route.startsWith('/library/projects/')) return { title: 'Project Board', icon: Kanban }
	if (route.startsWith('/library')) return { title: 'Library', icon: Layers }
	if (route.startsWith('/scratchpad')) return { title: 'Scratchpad', icon: FileText }
	if (route.startsWith('/memory')) return { title: 'Memory', icon: Layers }
	if (route.startsWith('/settings')) return { title: 'Settings', icon: Layers }
	return { title: aiName, icon: Layers }
}

export function DualPaneHeader() {
	const { preferences } = usePreferencesContext()
	const { conversation } = useConversationsContext()
	const { slot: chatHeaderVoiceSlot } = useChatHeaderSlot()
	const {
		pane1Route,
		pane2Route,
		splitRatio,
		setSplitRatio,
		swapPanes,
		closeSecondaryPane,
	} = useFoldablePane()

	const aiName = getConfiguredAiName(preferences)
	const pane1Info = getPaneTitle(pane1Route, aiName)
	const pane2Info = getPaneTitle(pane2Route, aiName)

	return (
		<div className="flex w-full shrink-0 border-b border-border/80 bg-background/95 backdrop-blur-md">
			{/* Pane 1 Header Bar */}
			<header
				style={{ width: `${splitRatio}%` }}
				className="flex shrink-0 items-center justify-between border-r border-border/60 px-4 py-2.5"
			>
				<div className="flex min-w-0 items-center gap-2">
					<span className="rounded-md bg-primary/10 p-1 text-primary">
						<pane1Info.icon className="h-4 w-4" />
					</span>
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold">{pane1Info.title}</h2>
						<p className="truncate text-[10px] text-muted-foreground">
							{pane1Route === '/chat' && conversation?.title ? `${conversation.title} · ` : ''}
							{formatAppVersionLabel()}
						</p>
					</div>
				</div>

				<div className="flex items-center gap-1 shrink-0">
					{pane1Route === '/chat' ? (
						<>
							{chatHeaderVoiceSlot}
							<ChatConversationActions />
						</>
					) : null}
				</div>
			</header>

			{/* Pane 2 Header Bar */}
			<header className="flex min-w-0 flex-1 items-center justify-between px-4 py-2.5">
				<div className="flex min-w-0 items-center gap-2">
					<span className="rounded-md bg-primary/10 p-1 text-primary">
						<pane2Info.icon className="h-4 w-4" />
					</span>
					<div className="min-w-0">
						<h2 className="truncate text-sm font-semibold">{pane2Info.title}</h2>
						<p className="truncate text-[10px] text-muted-foreground">Side Pane View</p>
					</div>
				</div>

				{/* Dual Pane Controls: Ratio Presets, Swap, Close */}
				<div className="flex items-center gap-1 shrink-0">
					<div className="hidden sm:flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 text-xs">
						<button
							type="button"
							onClick={() => setSplitRatio(50)}
							className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
								splitRatio === 50 ? 'bg-primary/20 font-semibold text-primary' : 'hover:bg-accent'
							}`}
							title="50% / 50% split"
						>
							50/50
						</button>
						<button
							type="button"
							onClick={() => setSplitRatio(60)}
							className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
								splitRatio === 60 ? 'bg-primary/20 font-semibold text-primary' : 'hover:bg-accent'
							}`}
							title="60% / 40% split"
						>
							60/40
						</button>
						<button
							type="button"
							onClick={() => setSplitRatio(40)}
							className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
								splitRatio === 40 ? 'bg-primary/20 font-semibold text-primary' : 'hover:bg-accent'
							}`}
							title="40% / 60% split"
						>
							40/60
						</button>
					</div>

					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={swapPanes}
						title="Swap Panes"
						className="h-8 w-8 px-0"
					>
						<ArrowLeftRight className="h-4 w-4" />
					</Button>

					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={closeSecondaryPane}
						title="Close Side Pane"
						className="h-8 w-8 px-0 text-muted-foreground hover:text-foreground"
					>
						<X className="h-4 w-4" />
					</Button>
				</div>
			</header>
		</div>
	)
}
