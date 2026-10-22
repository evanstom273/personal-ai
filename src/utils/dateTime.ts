export function formatMessageDateTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		weekday: 'short',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
		timeZoneName: 'short',
	}).format(new Date(timestamp))
}

export function formatMessageTime(timestamp: number): string {
	return new Intl.DateTimeFormat(undefined, {
		dateStyle: 'medium',
		timeStyle: 'short',
	}).format(new Date(timestamp))
}

/** Date only, so a prompt that includes it stays cacheable for the whole day. */
export function formatCurrentDateContext(now = new Date()): string {
	const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
	const formatted = new Intl.DateTimeFormat(undefined, {
		weekday: 'long',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	}).format(now)

	return `${formatted} (time zone ${timeZone})`
}
