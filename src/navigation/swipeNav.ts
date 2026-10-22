export type LibrarySection = 'schedule' | 'projects' | 'documents'
export type LibraryDocumentTab = 'documents' | 'images'
export type SettingsTab = 'profile' | 'memory' | 'api' | 'usage' | 'voice' | 'app'

export type SwipeNavStep =
	| { kind: 'route'; path: '/home' | '/chat' }
	| { kind: 'library'; section: LibrarySection; tab?: LibraryDocumentTab }
	| { kind: 'settings'; tab: SettingsTab }

export const SWIPE_NAV_STEPS: SwipeNavStep[] = [
	{ kind: 'route', path: '/home' },
	{ kind: 'route', path: '/chat' },
	{ kind: 'library', section: 'schedule' },
	{ kind: 'library', section: 'projects' },
	{ kind: 'library', section: 'documents', tab: 'documents' },
	{ kind: 'library', section: 'documents', tab: 'images' },
	{ kind: 'settings', tab: 'profile' },
	{ kind: 'settings', tab: 'memory' },
	{ kind: 'settings', tab: 'api' },
	{ kind: 'settings', tab: 'usage' },
	{ kind: 'settings', tab: 'voice' },
	{ kind: 'settings', tab: 'app' },
]

function isLibrarySection(value: string | null): value is LibrarySection {
	return value === 'schedule' || value === 'projects' || value === 'documents'
}

function isLibraryDocumentTab(value: string | null): value is LibraryDocumentTab {
	return value === 'documents' || value === 'images'
}

function isSettingsTab(value: string | null): value is SettingsTab {
	return (
		value === 'profile' ||
		value === 'memory' ||
		value === 'api' ||
		value === 'usage' ||
		value === 'voice' ||
		value === 'app'
	)
}

export function isSwipeNavigationPath(pathname: string): boolean {
	if (pathname === '/home' || pathname === '/chat' || pathname === '/library') {
		return true
	}

	if (pathname === '/settings') {
		return true
	}

	return false
}

export function resolveSwipeNavIndex(
	pathname: string,
	searchParams: URLSearchParams,
): number {
	if (pathname === '/home') {
		return 0
	}

	if (pathname === '/chat') {
		return 1
	}

	if (pathname === '/library') {
		const sectionParam = searchParams.get('section')
		const tabParam = searchParams.get('tab')

		if (sectionParam === 'schedule') {
			return 2
		}

		if (sectionParam === 'projects') {
			return 3
		}

		if (tabParam === 'images') {
			return 5
		}

		return 4
	}

	if (pathname === '/settings') {
		const tabParam = searchParams.get('tab')
		if (tabParam === 'memory') {
			return 7
		}

		if (tabParam === 'api') {
			return 8
		}

		if (tabParam === 'usage') {
			return 9
		}

		if (tabParam === 'voice') {
			return 10
		}

		if (tabParam === 'app') {
			return 11
		}

		return 6
	}

	return -1
}

export function buildSwipeNavLocation(step: SwipeNavStep): {
	pathname: string
	search: string
} {
	if (step.kind === 'route') {
		return { pathname: step.path, search: '' }
	}

	if (step.kind === 'library') {
		if (step.section === 'documents') {
			if (!step.tab || step.tab === 'documents') {
				return { pathname: '/library', search: '' }
			}

			return { pathname: '/library', search: `?tab=${step.tab}` }
		}

		return { pathname: '/library', search: `?section=${step.section}` }
	}

	if (step.tab === 'profile') {
		return { pathname: '/settings', search: '' }
	}

	return { pathname: '/settings', search: `?tab=${step.tab}` }
}

export function getSwipeNavStep(index: number): SwipeNavStep | undefined {
	if (index < 0) {
		return SWIPE_NAV_STEPS[SWIPE_NAV_STEPS.length - 1]
	}

	if (index >= SWIPE_NAV_STEPS.length) {
		return SWIPE_NAV_STEPS[0]
	}

	return SWIPE_NAV_STEPS[index]
}

export function resolveLibraryStateFromParams(searchParams: URLSearchParams): {
	section: LibrarySection
	documentTab: LibraryDocumentTab
} {
	const sectionParam = searchParams.get('section')
	const tabParam = searchParams.get('tab')

	if (isLibrarySection(sectionParam)) {
		return {
			section: sectionParam,
			documentTab: isLibraryDocumentTab(tabParam) ? tabParam : 'documents',
		}
	}

	if (isLibraryDocumentTab(tabParam)) {
		return { section: 'documents', documentTab: tabParam }
	}

	return { section: 'documents', documentTab: 'documents' }
}

export function resolveSettingsTabFromParams(
	searchParams: URLSearchParams,
): SettingsTab {
	const tabParam = searchParams.get('tab')
	return isSettingsTab(tabParam) ? tabParam : 'profile'
}
