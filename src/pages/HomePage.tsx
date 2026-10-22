import { useEffect, useState } from 'react'
import { usePreferencesContext } from '@/providers/ChatProvider'
import { getConfiguredAiName } from '@/services/claude/systemInstruction'
import { HomeActiveProjects } from '@/components/home/HomeActiveProjects'
import { HomeRecentDocuments } from '@/components/home/HomeRecentDocuments'
import { HomeTodoSection } from '@/components/home/HomeTodoSection'
import { HomeUpcomingReminders } from '@/components/home/HomeUpcomingReminders'
import { useDocuments } from '@/hooks/useDocuments'
import { useProjects } from '@/hooks/useProjects'
import { useReminders } from '@/hooks/useReminders'
import { APP_VERSION } from '@/data/changelog'

export function HomePage() {
	const { preferences } = usePreferencesContext()
	const { documents, isLoading: documentsLoading } = useDocuments()
	const { projects, isLoading: projectsLoading } = useProjects()
	const { reminders, isLoading: remindersLoading } = useReminders()
	const aiName = getConfiguredAiName(preferences)
	const displayName = preferences.userName.trim() || 'there'

	const [now, setNow] = useState(() => new Date())

	useEffect(() => {
		const timer = setInterval(() => {
			setNow(new Date())
		}, 1000)
		return () => clearInterval(timer)
	}, [])

	const formattedHeader = formatHomeHeaderDate(now)

	return (
		<div className="flex h-full min-h-0 flex-col overflow-hidden">
			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 md:px-8">
				<div className="mx-auto flex max-w-2xl flex-col gap-5">
					<div>
						<p className="text-sm text-muted-foreground font-mono">
							{formattedHeader}
						</p>
						<h1 className="mt-1 text-[1.75rem] font-semibold leading-tight tracking-tight md:text-[2rem]">
							{getTimeGreeting(now)}, {displayName}.
						</h1>
						<p className="mt-1 text-sm text-muted-foreground">
							Your snapshot from {aiName} — todos, projects, documents, and what&apos;s
							coming up.
						</p>
					</div>

					<HomeTodoSection />

					<div className="grid gap-5 md:grid-cols-2">
						<HomeUpcomingReminders
							reminders={reminders}
							isLoading={remindersLoading}
						/>
						<HomeActiveProjects projects={projects} isLoading={projectsLoading} />
					</div>

					<HomeRecentDocuments documents={documents} isLoading={documentsLoading} />
				</div>
			</div>
		</div>
	)
}

function formatHomeHeaderDate(now: Date): string {
	const rawWeekday = now.toLocaleDateString('en-GB', { weekday: 'short' })
	const weekday = rawWeekday === 'Tue' ? 'Tues' : rawWeekday
	const day = now.getDate()
	const month = now.toLocaleDateString('en-GB', { month: 'long' })
	const time = now.toLocaleTimeString('en-GB', {
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hour12: false,
	})

	return `${weekday} ${day} ${month} - ${time} - v${APP_VERSION}`
}

function getTimeGreeting(now: Date = new Date()): string {
	const hour = now.getHours()

	if (hour < 12) {
		return 'Good morning'
	}

	if (hour < 17) {
		return 'Good afternoon'
	}

	return 'Good evening'
}
