import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
	// The app id predates the move to Claude. Changing it would install as a
	// separate app and lose on-device data, so only the display name changed.
	appId: 'com.personalai.geminichat',
	appName: 'Personal AI',
	webDir: 'dist',
	server: {
		androidScheme: 'https',
	},
	plugins: {
		LocalNotifications: {
			iconColor: '#0e1016',
		},
	},
}

export default config
