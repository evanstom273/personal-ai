import type { ChatInputMethod, MessageFileAttachment } from '@/storage/types'

export type ChatAttachment =
	| {
			id: string
			type: 'document'
			name: string
			/** Library copy, when the file could be saved as a document. */
			documentId?: string
			/** Sent to Claude directly (PDF pages or text) when within size limits. */
			file?: MessageFileAttachment
	  }
	| {
			id: string
			type: 'image'
			name: string
			dataUrl: string
			mimeType: string
	  }

export interface ChatSubmitPayload {
	text: string
	attachments: ChatAttachment[]
	inputMethod: ChatInputMethod
	editFromMessageId?: string
}

export type { ChatInputMethod }
