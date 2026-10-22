import { useCallback, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
	extractDocumentContextSlices,
	generateDocumentWritingSuggestion,
	type DocumentWritingAction,
} from '@/services/claude/documentWriting'
import { describeClaudeError } from '@/services/claude/client'
import type { UserPreferences } from '@/storage/types'
import { markdownToHtml } from '@/utils/documentContent'

const ACTION_LABELS: Record<DocumentWritingAction, string> = {
	expand: 'Expand',
	rewrite: 'Rewrite',
	shorten: 'Shorten',
	clarify: 'Make clearer',
	continue: 'Continue writing',
	custom: 'Ask AI',
}

interface PendingAiEdit {
	action: DocumentWritingAction
	from: number
	to: number
	isInsertion: boolean
	customInstruction?: string
}

export function useDocumentAiWriting({
	editor,
	preferences,
	documentTitle,
}: {
	editor: Editor | null
	preferences: UserPreferences
	documentTitle: string
}) {
	const [previewOpen, setPreviewOpen] = useState(false)
	const [askOpen, setAskOpen] = useState(false)
	const [previewText, setPreviewText] = useState('')
	const [previewTitle, setPreviewTitle] = useState('')
	const [isGenerating, setIsGenerating] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const pendingRef = useRef<PendingAiEdit | null>(null)

	const runGeneration = useCallback(
		async (pending: PendingAiEdit) => {
			if (!editor) {
				return
			}

			const apiKey = preferences.anthropicApiKey.trim()
			if (!apiKey) {
				setError('Add your Anthropic API key in Settings to use AI writing assistance.')
				setIsGenerating(false)
				return
			}

			const fullText = editor.getText()
			const { selectedText, contextBefore, contextAfter } =
				extractDocumentContextSlices(fullText, pending.from, pending.to)

			if (
				pending.action !== 'continue' &&
				pending.action !== 'custom' &&
				!selectedText
			) {
				setError('Select some text first.')
				setIsGenerating(false)
				return
			}

			try {
				const suggestion = await generateDocumentWritingSuggestion({
					apiKey,
					preferences,
					documentTitle,
					selectedText,
					contextBefore,
					contextAfter,
					action: pending.action,
					customInstruction: pending.customInstruction,
				})

				setPreviewText(suggestion)
				setError(null)
			} catch (generationError) {
				setPreviewText('')
				setError(
					generationError instanceof Error
						? describeClaudeError(generationError)
						: 'AI generation failed. Your document was not changed.',
				)
			} finally {
				setIsGenerating(false)
			}
		},
		[editor, preferences, documentTitle],
	)

	const startAction = useCallback(
		(action: DocumentWritingAction, customInstruction?: string) => {
			if (!editor) {
				return
			}

			const { from, to } = editor.state.selection
			const hasSelection = from !== to
			const isInsertion = action === 'continue'

			if (!isInsertion && action !== 'custom' && !hasSelection) {
				setError('Select some text first.')
				setPreviewOpen(true)
				setPreviewTitle(ACTION_LABELS[action])
				setPreviewText('')
				setIsGenerating(false)
				return
			}

			const pending: PendingAiEdit = {
				action,
				from,
				to,
				isInsertion,
				customInstruction,
			}
			pendingRef.current = pending

			setPreviewTitle(ACTION_LABELS[action])
			setPreviewText('')
			setError(null)
			setPreviewOpen(true)
			setIsGenerating(true)
			void runGeneration(pending)
		},
		[editor, runGeneration],
	)

	const handleAskSubmit = useCallback(
		(instruction: string) => {
			setAskOpen(false)
			startAction('custom', instruction)
		},
		[startAction],
	)

	const handleRegenerate = useCallback(() => {
		const pending = pendingRef.current
		if (!pending) {
			return
		}
		setPreviewText('')
		setError(null)
		setIsGenerating(true)
		void runGeneration(pending)
	}, [runGeneration])

	const handleAccept = useCallback(() => {
		const pending = pendingRef.current
		if (!editor || !pending || !previewText) {
			return
		}

		const html = markdownToHtml(previewText)

		if (pending.isInsertion) {
			editor
				.chain()
				.focus()
				.setTextSelection(pending.to)
				.insertContent(html)
				.run()
		} else {
			editor
				.chain()
				.focus()
				.setTextSelection({ from: pending.from, to: pending.to })
				.deleteSelection()
				.insertContent(html)
				.run()
		}

		pendingRef.current = null
		setPreviewOpen(false)
		setPreviewText('')
		setError(null)
	}, [editor, previewText])

	const handleReject = useCallback(() => {
		pendingRef.current = null
		setPreviewOpen(false)
		setPreviewText('')
		setError(null)
	}, [])

	const openAskDialog = useCallback(() => {
		if (!editor) {
			return
		}
		const { from, to } = editor.state.selection
		if (from === to) {
			setError('Select some text first.')
			setPreviewOpen(true)
			setPreviewTitle('Ask AI')
			setPreviewText('')
			setIsGenerating(false)
			return
		}
		setAskOpen(true)
	}, [editor])

	const hasApiKey = preferences.anthropicApiKey.trim().length > 0

	return {
		previewOpen,
		setPreviewOpen,
		askOpen,
		setAskOpen,
		previewText,
		previewTitle,
		isGenerating,
		error,
		hasApiKey,
		startAction,
		handleAskSubmit,
		handleRegenerate,
		handleAccept,
		handleReject,
		openAskDialog,
	}
}
