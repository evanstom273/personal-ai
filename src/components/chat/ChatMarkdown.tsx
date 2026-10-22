import { Check, Copy } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { cn } from '@/utils/cn'

interface ChatMarkdownProps {
	content: string
	className?: string
}

export function ChatMarkdown({ content, className }: ChatMarkdownProps) {
	return (
		<div className={cn('chat-markdown', className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				components={{
					pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
					a: ({ href, children }) =>
						isCitationMarker(children) ? (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								className="chat-citation ml-0.5 align-super text-[0.7em] font-medium text-primary no-underline hover:underline"
								title={href}
							>
								{children}
							</a>
						) : (
							<a
								href={href}
								target="_blank"
								rel="noopener noreferrer"
								className="text-primary underline underline-offset-4"
							>
								{children}
							</a>
						),
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	)
}

/** Web citations are rendered as small numbered links like [1]. */
function isCitationMarker(children: ReactNode): boolean {
	const text = extractTextFromNode(children)
	return /^\[\d+\]$/.test(text)
}

function CodeBlock({ children }: { children: ReactNode }) {
	const [copied, setCopied] = useState(false)
	const codeElement = findCodeElement(children)
	const language = extractLanguage(codeElement?.props?.className)
	const codeText = extractCodeText(codeElement) || extractTextFromNode(children)

	const handleCopy = useCallback(async () => {
		if (!codeText) {
			return
		}

		try {
			await navigator.clipboard.writeText(codeText)
			setCopied(true)
			window.setTimeout(() => setCopied(false), 2000)
		} catch {
			// Clipboard access can fail in insecure contexts.
		}
	}, [codeText])

	return (
		<div className="chat-code-block group relative">
			<div className="chat-code-block-header">
				<span className="font-mono text-xs text-muted-foreground/80">{language || 'code'}</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					className={cn(
						'chat-copy-button h-7 gap-1.5 px-2.5 text-xs transition-all',
						copied
							? 'text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10'
							: 'text-muted-foreground hover:text-foreground hover:bg-white/10'
					)}
					onClick={() => {
						void handleCopy()
					}}
					disabled={!codeText}
					aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
				>
					{copied ? (
						<Check className="h-3.5 w-3.5 text-emerald-400" />
					) : (
						<Copy className="h-3.5 w-3.5" />
					)}
					<span>{copied ? 'Copied' : 'Copy'}</span>
				</Button>
			</div>
			<pre>{children}</pre>
		</div>
	)
}

function findCodeElement(node: ReactNode): CodeElementLike | null {
	if (!node || typeof node !== 'object' || !('props' in node)) {
		return null
	}

	const element = node as CodeElementLike
	if (element.type === 'code') {
		return element
	}

	const child = element.props?.children
	if (Array.isArray(child)) {
		for (const item of child) {
			const match = findCodeElement(item)
			if (match) {
				return match
			}
		}
	}

	return findCodeElement(child ?? null)
}

interface CodeElementLike {
	type?: unknown
	props?: {
		className?: string
		children?: ReactNode
	}
}

function extractLanguage(className?: string): string | null {
	if (!className) {
		return null
	}

	const match = className.match(/language-([\w-]+)/)
	return match?.[1] ?? null
}

function extractTextFromNode(node: ReactNode): string {
	if (node === null || node === undefined || typeof node === 'boolean') {
		return ''
	}
	if (typeof node === 'string' || typeof node === 'number') {
		return String(node)
	}
	if (Array.isArray(node)) {
		return node.map(extractTextFromNode).join('')
	}
	if (typeof node === 'object' && 'props' in node) {
		const element = node as { props?: { children?: ReactNode } }
		return extractTextFromNode(element.props?.children)
	}
	return ''
}

function extractCodeText(node: CodeElementLike | null): string {
	if (!node?.props?.children) {
		return ''
	}

	return extractTextFromNode(node.props.children)
}
