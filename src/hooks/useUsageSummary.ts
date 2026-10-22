import { useCallback, useEffect, useState } from 'react'
import {
	getUsageSummary,
	subscribeUsageChanged,
	type UsageSummary,
} from '@/services/usage/usageService'

export function useUsageSummary() {
	const [summary, setSummary] = useState<UsageSummary | null>(null)

	const refresh = useCallback(async () => {
		setSummary(await getUsageSummary())
	}, [])

	useEffect(() => {
		void refresh()
		return subscribeUsageChanged(() => {
			void refresh()
		})
	}, [refresh])

	return { summary, refresh }
}
