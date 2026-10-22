import { Loader2, X } from 'lucide-react'
import { useCallback } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ChatConversationActions } from '@/components/chat/ChatConversationActions'
import { ChatVoiceSession } from '@/components/chat/ChatVoiceSession'
import { FoldableDualPaneLayout } from '@/components/foldable/FoldableDualPaneLayout'
import { ScratchpadBusyIndicator, ScratchpadFab } from '@/components/scratchpad/ScratchpadFab'
import { ScratchpadPanel } from '@/components/scratchpad/ScratchpadPanel'
import { formatAppVersionLabel } from '@/data/changelog'
import { useAppSwipeNavigation } from '@/hooks/useAppSwipeNavigation'
import { useFoldablePane } from '@/hooks/useFoldablePane'
import { useMobileNavLayout } from '@/hooks/useMobileNavLayout'
import { useSwipePageTransition } from '@/hooks/useSwipePageTransition'
import { BottomNav } from '@/layout/BottomNav'
import {
	useChatGenerationContext,
	useChatHeaderSlot,
	useConversationsContext,
	usePreferencesContext,
	useTextToSpeechContext,
} from '@/providers/ChatProvider'
import { getConfiguredAiName } from '@/services/claude/systemInstruction'
import { cn } from '@/utils/cn'

function getPageTitle(pathname: string, aiName: string): string {
	if (pathname === '/home' || pathname === '/') {
		return 'Home'
	}

	if (pathname === '/chat') {
		return aiName
	}

	if (pathname.startsWith('/library/projects/')) {
		return 'Project'
	}

	if (pathname.startsWith('/library/documents/')) {
		return 'Document'
	}

	if (pathname.startsWith('/library')) {
		return 'Library'
	}

	if (pathname.startsWith('/memory')) {
		return 'Memory'
	}

	if (pathname.startsWith('/settings')) {
		return 'Settings'
	}

	return aiName
}

export function AppShell() {
	const { preferences } = usePreferencesContext()
	const { conversation } = useConversationsContext()
	const { isGenerating, completionNotice, clearCompletionNotice, submitMessage } =
		useChatGenerationContext()
	const {
		status: speechStatus,
		speakAssistantMessage,
		stop: stopSpeech,
	} = useTextToSpeechContext()
	const { isDualPaneActive, pane2Route } = useFoldablePane()
	const location = useLocation()
	const navigate = useNavigate()
	const isMobileNav = useMobileNavLayout()
	const aiName = getConfiguredAiName(preferences)
	const isChatRoute = location.pathname === '/chat'
	const pageTitle = getPageTitle(location.pathname, aiName)
	const { navigateWithFade, contentClassName } = useSwipePageTransition()
	const { slot: chatHeaderVoiceSlot } = useChatHeaderSlot()

	const showAppHeader =
		!isDualPaneActive &&
		!location.pathname.startsWith('/library/documents/') &&
		!location.pathname.startsWith('/library/projects/') &&
		location.pathname !== '/home' &&
		!(isChatRoute && !isMobileNav)

	useAppSwipeNavigation(navigateWithFade)

	const handleVoiceSubmit = useCallback(
		async (payload: Parameters<typeof submitMessage>[0]) => {
			await submitMessage(payload)
		},
		[submitMessage],
	)

	const goToChat = useCallback(() => {
		clearCompletionNotice()

		if (!isChatRoute) {
			navigate('/chat')
		}
	}, [clearCompletionNotice, isChatRoute, navigate])

	return (
		<div className="app-shell flex flex-col overflow-hidden">
			{showAppHeader ? (
				<header className="app-header-glass relative z-40 shrink-0 px-4 py-3 md:px-6">
					<div className="flex min-w-0 items-center gap-3">
						<div className="min-w-0 flex-1">
							<h1 className="truncate text-base font-semibold md:text-lg">
								{pageTitle}
							</h1>
							{isChatRoute ? (
								<p className="truncate text-xs text-muted-foreground">
									{conversation?.title ? `${conversation.title} · ` : ''}
									{formatAppVersionLabel()}
								</p>
							) : isGenerating ? (
								<p className="truncate text-xs text-muted-foreground">
									{aiName} is replying in the background…
								</p>
							) : null}
						</div>
						{isChatRoute ? (
							<div className="flex shrink-0 items-center gap-0.5">
								{chatHeaderVoiceSlot}
								<ChatConversationActions />
							</div>
						) : null}
					</div>
				</header>
			) : null}

			{isGenerating && !isChatRoute && !isDualPaneActive ? (
				<div className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/20 bg-primary/10 px-4 py-2 text-sm backdrop-blur-sm md:px-6">
					<span className="inline-flex items-center gap-2 text-primary">
						<Loader2 className="h-4 w-4 animate-spin" />
						{aiName} is replying…
					</span>
					<button
						type="button"
						onClick={goToChat}
						className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
					>
						View chat
					</button>
				</div>
			) : null}

			{completionNotice && !isChatRoute && !isDualPaneActive ? (
				<div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-secondary/50 px-4 py-2 text-sm md:px-6">
					<span className="text-foreground">{completionNotice}</span>
					<div className="flex shrink-0 items-center gap-2">
						<button
							type="button"
							onClick={goToChat}
							className="text-xs font-medium text-primary underline-offset-4 hover:underline"
						>
							Open chat
						</button>
						<button
							type="button"
							onClick={clearCompletionNotice}
							className="rounded-md p-1 text-muted-foreground hover:text-foreground"
							aria-label="Dismiss"
						>
							<X className="h-4 w-4" />
						</button>
					</div>
				</div>
			) : null}

			<main className={cn(contentClassName, 'touch-pan-y')}>
				{isDualPaneActive && pane2Route ? (
					<FoldableDualPaneLayout>
						<Outlet />
					</FoldableDualPaneLayout>
				) : (
					<Outlet />
				)}
			</main>

			<ChatVoiceSession
				conversationMessages={conversation?.messages ?? []}
				isGenerating={isGenerating}
				hasApiKey={preferences.anthropicApiKey.trim().length > 0}
				aiName={aiName}
				speechStatus={speechStatus}
				onSubmit={handleVoiceSubmit}
				onStopSpeech={stopSpeech}
				onSpeakAssistantMessage={speakAssistantMessage}
			/>

			<BottomNav />

			<ScratchpadFab />
			<ScratchpadBusyIndicator />
			<ScratchpadPanel />
		</div>
	)
}
