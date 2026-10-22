import {
	MAX_IMAGE_EDGE_PX,
	MAX_IMAGE_PIXELS,
} from '@/services/claude/constants'

export async function readTextFile(file: File): Promise<string> {
	return file.text()
}

export async function readFileAsDataUrl(
	file: File,
): Promise<{ dataUrl: string; mimeType: string }> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onload = () => {
			if (typeof reader.result !== 'string') {
				reject(new Error('Failed to read file'))
				return
			}

			resolve({
				dataUrl: reader.result,
				mimeType: file.type || 'application/octet-stream',
			})
		}
		reader.onerror = () => reject(new Error('Failed to read file'))
		reader.readAsDataURL(file)
	})
}

export async function readFileAsBase64(file: File): Promise<string> {
	const { dataUrl } = await readFileAsDataUrl(file)
	const commaIndex = dataUrl.indexOf(',')
	return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl
}

export function getFileBaseName(filename: string): string {
	const trimmed = filename.trim()
	const index = trimmed.lastIndexOf('.')
	if (index <= 0) {
		return trimmed
	}

	return trimmed.slice(0, index)
}

function getFileExtension(filename: string): string {
	return filename.split('.').pop()?.toLowerCase() ?? ''
}

export function isPdfFile(file: File): boolean {
	return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

const TEXT_DOCUMENT_EXTENSIONS = new Set([
	'txt', 'md', 'markdown', 'html', 'htm', 'json', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'log', 'ini', 'toml',
])

/** Source files Claude can read as plain text. */
const CODE_FILE_EXTENSIONS = new Set([
	'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb', 'php', 'java', 'kt', 'kts', 'swift', 'go', 'rs',
	'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'fs', 'scala', 'dart', 'lua', 'r', 'sql', 'sh', 'bash', 'zsh',
	'ps1', 'bat', 'css', 'scss', 'sass', 'less', 'vue', 'svelte', 'gd', 'gdshader', 'glsl', 'hlsl',
	'shader', 'cmake', 'gradle', 'dockerfile', 'env', 'conf', 'cfg', 'tf', 'proto', 'graphql',
])

export const DOCUMENT_UPLOAD_ACCEPT = [
	...[...TEXT_DOCUMENT_EXTENSIONS, ...CODE_FILE_EXTENSIONS, 'pdf'].map((ext) => `.${ext}`),
	'text/*',
	'application/pdf',
	'application/json',
].join(',')

export function isCodeFile(file: File): boolean {
	return CODE_FILE_EXTENSIONS.has(getFileExtension(file.name))
}

export function isTextDocumentFile(file: File): boolean {
	if (file.type.startsWith('text/')) {
		return true
	}

	return TEXT_DOCUMENT_EXTENSIONS.has(getFileExtension(file.name)) || isCodeFile(file)
}

export function isUploadableDocumentFile(file: File): boolean {
	return isTextDocumentFile(file) || isPdfFile(file)
}

/** Fenced code language for a source file, used when saving it to the library. */
export function getCodeFenceLanguage(file: File): string {
	const extension = getFileExtension(file.name)
	const aliases: Record<string, string> = {
		ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', mjs: 'javascript', cjs: 'javascript',
		py: 'python', rb: 'ruby', kt: 'kotlin', kts: 'kotlin', rs: 'rust', cs: 'csharp', sh: 'bash',
		zsh: 'bash', ps1: 'powershell', gd: 'gdscript', h: 'c', hpp: 'cpp', cc: 'cpp',
	}
	return aliases[extension] ?? extension
}

export async function readUploadableDocumentContent(file: File): Promise<string> {
	if (isPdfFile(file)) {
		const { extractPdfText } = await import('@/utils/pdfText')
		return extractPdfText(file)
	}

	return readTextFile(file)
}

export function isImageFile(file: File): boolean {
	return file.type.startsWith('image/')
}

const PASSTHROUGH_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
const MAX_PASSTHROUGH_IMAGE_BYTES = 3_500_000

function loadImage(src: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error('This image format could not be read.'))
		image.src = src
	})
}

/**
 * Converts an upload into something Claude accepts (JPEG/PNG/GIF/WebP) and
 * scales it to about 1.15 megapixels. Claude would downscale larger images
 * anyway, so this only saves upload size and on-device storage.
 */
export async function prepareImageForClaude(
	file: File,
): Promise<{ dataUrl: string; mimeType: string }> {
	const original = await readFileAsDataUrl(file)
	const image = await loadImage(original.dataUrl)
	const width = image.naturalWidth
	const height = image.naturalHeight
	if (!width || !height) {
		throw new Error(`${file.name} could not be read as an image.`)
	}

	const scale = Math.min(
		1,
		Math.sqrt(MAX_IMAGE_PIXELS / (width * height)),
		MAX_IMAGE_EDGE_PX / Math.max(width, height),
	)

	if (
		scale === 1 &&
		PASSTHROUGH_IMAGE_TYPES.has(original.mimeType) &&
		file.size <= MAX_PASSTHROUGH_IMAGE_BYTES
	) {
		return original
	}

	const canvas = document.createElement('canvas')
	canvas.width = Math.max(1, Math.round(width * scale))
	canvas.height = Math.max(1, Math.round(height * scale))
	const context = canvas.getContext('2d')
	if (!context) {
		throw new Error('Could not process the image on this device.')
	}
	context.drawImage(image, 0, 0, canvas.width, canvas.height)

	const mimeType = original.mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
	return { dataUrl: canvas.toDataURL(mimeType, 0.85), mimeType }
}
