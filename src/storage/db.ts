import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { StoreName } from './types'

interface PersonalAiDB extends DBSchema {
	preferences: {
		key: string
		value: unknown
	}
	conversations: {
		key: string
		value: unknown
	}
	cache: {
		key: string
		value: unknown
	}
	documents: {
		key: string
		value: unknown
	}
	libraryMedia: {
		key: string
		value: unknown
	}
	memories: {
		key: string
		value: unknown
	}
	reminders: {
		key: string
		value: unknown
	}
	projects: {
		key: string
		value: unknown
	}
	usage: {
		key: string
		value: unknown
	}
}

// The database name predates the move to Claude. Renaming it would orphan every
// existing conversation, document, and reminder, so it stays as-is.
const DB_NAME = 'gemini-chat'
const DB_VERSION = 7

let dbPromise: Promise<IDBPDatabase<PersonalAiDB>> | null = null

export function getDb(): Promise<IDBPDatabase<PersonalAiDB>> {
	if (!dbPromise) {
		dbPromise = openDB<PersonalAiDB>(DB_NAME, DB_VERSION, {
			upgrade(db, oldVersion) {
				const stores: StoreName[] = [
					'preferences',
					'conversations',
					'cache',
					'documents',
					'libraryMedia',
					'memories',
					'reminders',
					'projects',
					'usage',
				]
				for (const store of stores) {
					if (!db.objectStoreNames.contains(store)) {
						db.createObjectStore(store)
					}
				}

				if (oldVersion < 2) {
					// documents store added in v2
				}

				if (oldVersion < 3) {
					// libraryMedia store added in v3
				}

				if (oldVersion < 4) {
					// memories store added in v4
				}

				if (oldVersion < 5) {
					// reminders store added in v5
				}

				if (oldVersion < 6) {
					// projects store added in v6
				}

				if (oldVersion < 7) {
					// usage store added in v7 (Claude API cost tracking)
				}
			},
			blocking() {
				// A newer build in another tab wants to upgrade; release our handle so it can.
				const current = dbPromise
				dbPromise = null
				void current?.then((db) => db.close())
			},
		})
	}

	return dbPromise
}
