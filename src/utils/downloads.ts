import type { DocumentRecord } from '@/storage/types'
import { formatChangelogMarkdown } from '@/data/changelog'
import { getAppReferenceMarkdown } from '@/services/claude/appReferenceContext'
import {
	documentContentForExport,
	htmlToPlainTextMultiline,
} from '@/utils/documentContent'

export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	URL.revokeObjectURL(url)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
	const anchor = document.createElement('a')
	anchor.href = dataUrl
	anchor.download = filename
	anchor.click()
}

export function sanitizeFilename(value: string): string {
	const sanitized = value
		.trim()
		.replace(/[<>:"/\\|?*]+/g, '-')
		.replace(/\s+/g, ' ')
		.slice(0, 120)

	return sanitized || 'download'
}

export function formatDownloadTimestamp(timestamp: number): string {
	const date = new Date(timestamp)
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	const hours = String(date.getHours()).padStart(2, '0')
	const minutes = String(date.getMinutes()).padStart(2, '0')

	return `${year}-${month}-${day} ${hours}-${minutes}`
}

export function buildDownloadFilename(
	title: string,
	extension: string,
	timestamp?: number,
): string {
	const stamp = formatDownloadTimestamp(timestamp ?? Date.now())
	const ext = extension.replace(/^\./, '')
	const maxTitleLength = Math.max(1, 120 - stamp.length - ext.length - 2)
	const base = sanitizeFilename(title).slice(0, maxTitleLength)

	return `${base} ${stamp}.${ext}`
}

export function extensionForMimeType(mimeType: string): string {
	if (mimeType.includes('png')) return 'png'
	if (mimeType.includes('jpeg') || mimeType.includes('jpg')) return 'jpg'
	if (mimeType.includes('webp')) return 'webp'
	if (mimeType.includes('gif')) return 'gif'
	if (mimeType.includes('mp3')) return 'mp3'
	if (mimeType.includes('wav')) return 'wav'
	if (mimeType.includes('ogg')) return 'ogg'
	if (mimeType.includes('mp4')) return 'mp4'
	if (mimeType.includes('webm')) return 'webm'
	return 'bin'
}

export function downloadDocument(
	document: DocumentRecord,
	format: 'txt' | 'md' | 'pdf',
): void {
	const filename = buildDownloadFilename(document.title, format, document.updatedAt)

	if (format === 'pdf') {
		void downloadDocumentPdf(document, filename)
		return
	}

	const content =
		format === 'md'
			? documentContentForExport(document, 'md')
			: documentContentForExport(document, 'txt')
	const mimeType =
		format === 'md'
			? 'text/markdown;charset=utf-8'
			: 'text/plain;charset=utf-8'
	downloadBlob(new Blob([content], { type: mimeType }), filename)
}

async function downloadDocumentPdf(
	document: DocumentRecord,
	filename: string,
): Promise<void> {
	const { jsPDF } = await import('jspdf')
	const pdf = new jsPDF()
	const text =
		document.contentFormat === 'markdown'
			? document.content
			: htmlToPlainTextMultiline(document.content)
	const lines = pdf.splitTextToSize(text || document.title, 180)
	pdf.text(lines, 14, 20)
	pdf.save(filename)
}

export function downloadLibraryMediaItem(
	title: string,
	mimeType: string,
	dataUrl: string,
	timestamp?: number,
): void {
	const extension = extensionForMimeType(mimeType)
	downloadDataUrl(dataUrl, buildDownloadFilename(title, extension, timestamp))
}

export function downloadAppReferenceMarkdown(): void {
	downloadBlob(
		new Blob([getAppReferenceMarkdown()], { type: 'text/markdown;charset=utf-8' }),
		buildDownloadFilename('Personal AI App Reference', 'md'),
	)
}

export function downloadChangelogMarkdown(): void {
	downloadBlob(
		new Blob([formatChangelogMarkdown()], { type: 'text/markdown;charset=utf-8' }),
		buildDownloadFilename('Personal AI Changelog', 'md'),
	)
}
