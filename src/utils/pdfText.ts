import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

interface PdfTextItem {
	str: string
	width: number
	transform: number[]
}

interface PdfLine {
	text: string
	fontSize: number
	x: number
	y: number
}

const PAGE_FOOTER_PATTERN = /^-- \d+ of \d+ --$/
const METADATA_FONT_SIZE = 12
const SUBHEADING_FONT_SIZE = 12
const SECTION_HEADING_FONT_SIZE = 15
const TITLE_FONT_SIZE = 20
const BODY_INDENT_X = 90
const LABEL_MAX_X = 75

export async function extractPdfText(file: File): Promise<string> {
	const buffer = await file.arrayBuffer()
	const document = await getDocument({ data: buffer }).promise
	const lines: PdfLine[] = []

	for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
		const page = await document.getPage(pageNumber)
		const content = await page.getTextContent()
		const textItems: PdfTextItem[] = []
		for (const item of content.items) {
			if (isPdfTextItem(item)) {
				textItems.push(item)
			}
		}
		lines.push(...extractPdfLines(textItems))
	}

	const markdown = formatPdfLinesAsMarkdown(lines).trim()
	if (!markdown) {
		throw new Error(
			`${file.name} has no extractable text. Image-only or scanned PDFs are not supported yet.`,
		)
	}

	return markdown
}

function isPdfTextItem(item: unknown): item is PdfTextItem {
	return (
		typeof item === 'object' &&
		item !== null &&
		'str' in item &&
		typeof item.str === 'string' &&
		'width' in item &&
		typeof item.width === 'number' &&
		'transform' in item &&
		Array.isArray(item.transform)
	)
}

function extractPdfLines(items: PdfTextItem[]): PdfLine[] {
	const lineBuckets = new Map<number, PdfTextItem[]>()

	for (const item of items) {
		if (!('str' in item) || !item.str) {
			continue
		}

		const y = Math.round(item.transform[5])
		const bucket = lineBuckets.get(y) ?? []
		bucket.push(item)
		lineBuckets.set(y, bucket)
	}

	return [...lineBuckets.entries()]
		.sort(([leftY], [rightY]) => rightY - leftY)
		.map(([y, bucketItems]) => {
			bucketItems.sort((left, right) => left.transform[4] - right.transform[4])
			return {
				y,
				text: joinLineItems(bucketItems),
				fontSize: Math.max(...bucketItems.map((item) => item.transform[0])),
				x: Math.min(...bucketItems.map((item) => item.transform[4])),
			}
		})
		.filter((line) => line.text && !PAGE_FOOTER_PATTERN.test(line.text))
}

function joinLineItems(items: PdfTextItem[]): string {
	let result = ''
	let previousEndX: number | null = null

	for (const item of items) {
		const text = item.str
		if (!text) {
			continue
		}

		const x = item.transform[4]
		if (previousEndX !== null && x - previousEndX > 1.5) {
			result += ' '
		}

		result += text
		previousEndX = x + item.width
	}

	return result.trim()
}

function formatPdfLinesAsMarkdown(lines: PdfLine[]): string {
	const output: string[] = []
	let index = 0
	let skippedDuplicateTitle = false
	let pendingMetadata: string | null = null

	while (index < lines.length) {
		const line = lines[index]

		if (!skippedDuplicateTitle && line.fontSize >= 16 && line.fontSize < TITLE_FONT_SIZE) {
			skippedDuplicateTitle = true
			index += 1
			continue
		}

		if (isMetadataLine(line)) {
			pendingMetadata = line.text
			index += 1
			continue
		}

		if (line.fontSize >= TITLE_FONT_SIZE) {
			output.push(`# ${line.text}`)
			if (pendingMetadata) {
				output.push(`*${pendingMetadata}*`)
				pendingMetadata = null
			}
			index += 1
			continue
		}

		if (isSectionHeading(line)) {
			output.push(`## ${line.text}`)
			index += 1
			continue
		}

		if (isSubheading(line)) {
			output.push(`### ${line.text}`)
			index += 1
			if (shouldUseListAfterHeading(lines, index)) {
				index = appendListItems(lines, index, output)
			}
			output.push('')
			continue
		}

		if (isMarginLabel(line)) {
			output.push(`**${line.text}**`)
			index += 1
			index = appendListItems(lines, index, output)
			output.push('')
			continue
		}

		if (isMarginBody(line)) {
			const paragraph = collectParagraph(lines, index)
			output.push(paragraph.text)
			index = paragraph.nextIndex
			output.push('')
			continue
		}

		if (isIndentedBody(line)) {
			const paragraph = collectParagraph(lines, index)
			output.push(paragraph.text)
			index = paragraph.nextIndex
			output.push('')
			continue
		}

		output.push(line.text)
		index += 1
	}

	if (pendingMetadata) {
		output.unshift(`*${pendingMetadata}*`)
	}

	return output.join('\n').replace(/\n{3,}/g, '\n\n')
}

function isMetadataLine(line: PdfLine): boolean {
	return (
		line.fontSize >= METADATA_FONT_SIZE - 0.5 &&
		line.fontSize < SUBHEADING_FONT_SIZE &&
		line.text.includes('•')
	)
}

function isSectionHeading(line: PdfLine): boolean {
	return line.fontSize >= SECTION_HEADING_FONT_SIZE
}

function isSubheading(line: PdfLine): boolean {
	return line.fontSize >= SUBHEADING_FONT_SIZE && line.fontSize < SECTION_HEADING_FONT_SIZE
}

function isMarginLabel(line: PdfLine): boolean {
	return isMarginBody(line) && line.text.endsWith(':')
}

function isMarginBody(line: PdfLine): boolean {
	return line.fontSize < SUBHEADING_FONT_SIZE && line.x <= LABEL_MAX_X
}

function appendListItems(
	lines: PdfLine[],
	startIndex: number,
	output: string[],
): number {
	let index = startIndex

	while (index < lines.length && isIndentedBody(lines[index])) {
		const text = lines[index].text
		const previousEntry = output[output.length - 1]

		if (
			previousEntry?.startsWith('- ') &&
			shouldContinueParagraph(previousEntry.slice(2), text)
		) {
			output[output.length - 1] = `${previousEntry} ${text}`
		} else {
			output.push(`- ${text}`)
		}

		index += 1
	}

	return index
}

function shouldUseListAfterHeading(lines: PdfLine[], startIndex: number): boolean {
	if (startIndex >= lines.length || !isIndentedBody(lines[startIndex])) {
		return false
	}

	let index = startIndex
	let listLikeCount = 0
	let paragraphLikeCount = 0

	while (index < lines.length && isIndentedBody(lines[index])) {
		if (isLikelyListItemLine(lines[index])) {
			listLikeCount += 1
		} else {
			paragraphLikeCount += 1
		}

		index += 1

		if (listLikeCount > 0 && paragraphLikeCount > 0) {
			return false
		}
	}

	return listLikeCount > 0
}

function isLikelyListItemLine(line: PdfLine): boolean {
	const text = line.text.trim()

	if (text.length > 90) {
		return false
	}

	if (/[.!?]$/.test(text) && text.length > 45) {
		return false
	}

	if (text.includes(': ') && text.length > 50) {
		return false
	}

	return true
}

function isIndentedBody(line: PdfLine): boolean {
	return line.fontSize < SUBHEADING_FONT_SIZE && line.x >= BODY_INDENT_X
}

function isHeadingLine(line: PdfLine): boolean {
	return isSectionHeading(line) || isSubheading(line)
}

function collectParagraph(
	lines: PdfLine[],
	startIndex: number,
): { text: string; nextIndex: number } {
	let text = lines[startIndex].text
	let index = startIndex + 1

	while (index < lines.length) {
		const nextLine = lines[index]
		if (isHeadingLine(nextLine) || isMarginLabel(nextLine)) {
			break
		}

		if (
			(isMarginBody(nextLine) || isIndentedBody(nextLine)) &&
			shouldContinueParagraph(text, nextLine.text)
		) {
			text += ` ${nextLine.text}`
			index += 1
			continue
		}

		if (isMarginBody(nextLine) || isIndentedBody(nextLine)) {
			break
		}

		break
	}

	return { text, nextIndex: index }
}

function shouldContinueParagraph(previous: string, next: string): boolean {
	const trimmedPrevious = previous.trim()
	const trimmedNext = next.trim()

	if (/[.!?:]$/.test(trimmedPrevious)) {
		return false
	}

	return /^[a-z("'(]/.test(trimmedNext)
}

/** Page count without extracting text — used to decide whether a PDF can be sent to Claude directly. */
export async function getPdfPageCount(file: File): Promise<number> {
	const buffer = await file.arrayBuffer()
	const document = await getDocument({ data: buffer }).promise
	const count = document.numPages
	void document.destroy()
	return count
}
