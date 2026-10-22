import type { DocumentRecord } from '@/storage/types'
import { isCapacitorNativePlatform } from '@/utils/capacitor'
import { formatChangelogMarkdown } from '@/data/changelog'
import { getAppReferenceMarkdown } from '@/services/claude/appReferenceContext'
import {
	documentContentForExport,
	htmlToPlainTextMultiline,
} from '@/utils/documentContent'

const NATIVE_DOWNLOAD_FOLDER = 'JARVIS'

/**
 * The Android WebView ignores <a download>, so in the app files are written
 * to Documents/JARVIS with the Filesystem plugin instead.
 */
async function saveToDeviceDocuments(base64Data: string, filename: string): Promise<void> {
	const path = `${NATIVE_DOWNLOAD_FOLDER}/${filename}`
	try {
		const { Directory, Filesystem } = await import('@capacitor/filesystem')
		await Filesystem.writeFile({
			path,
			data: base64Data,
			directory: Directory.Documents,
			recursive: true,
		})
		window.alert(`Saved to Documents/${path}`)
	} catch (error) {
		window.alert(
			`Couldn't save ${filename}: ${error instanceof Error ? error.message : 'unknown error'}`,
		)
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''))
		reader.onerror = () => reject(reader.error)
		reader.readAsDataURL(blob)
	})
}

export function downloadBlob(blob: Blob, filename: string): void {
	if (isCapacitorNativePlatform()) {
		void blobToBase64(blob).then((data) => saveToDeviceDocuments(data, filename))
		return
	}
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement('a')
	anchor.href = url
	anchor.download = filename
	anchor.click()
	URL.revokeObjectURL(url)
}

export function downloadDataUrl(dataUrl: string, filename: string): void {
	if (isCapacitorNativePlatform()) {
		const data = dataUrl.startsWith('data:') ? dataUrl.replace(/^data:[^,]*,/, '') : ''
		if (data && /;base64,/.test(dataUrl.slice(0, 100))) {
			void saveToDeviceDocuments(data, filename)
		} else {
			void fetch(dataUrl)
				.then((response) => response.blob())
				.then((blob) => downloadBlob(blob, filename))
		}
		return
	}
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
	downloadBlob(pdf.output('blob'), filename)
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
