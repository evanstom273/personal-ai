import type Anthropic from '@anthropic-ai/sdk'
import {
	SOURCE_CODE_INDEX,
	SOURCE_CODE_PATHS,
	SOURCE_CODE_GENERATED_AT,
} from '@/data/sourceCodeIndex.generated'

const MAX_READ_CHARS = 60_000
const MAX_SEARCH_RESULTS = 40
const MAX_SEARCH_LINE_CHARS = 240

export interface CodebaseToolResult {
	name: string
	response: Record<string, unknown>
}

export const CODEBASE_TOOL_DECLARATIONS = [
	{
		name: 'list_source_files',
		description:
			'List bundled read-only source files from the app codebase. Use when the user asks how the app is built or wants to explore implementation files.',
		input_schema: {
			type: 'object',
			properties: {
				path_prefix: {
					type: 'string',
					description:
						'Optional path prefix filter, e.g. "src/services/claude/" or "src/pages/".',
				},
			},
		},
	},
	{
		name: 'read_source_file',
		description:
			'Read the full text of one bundled source file by path. Read-only — cannot modify code.',
		input_schema: {
			type: 'object',
			properties: {
				path: {
					type: 'string',
					description:
						'Exact file path from list_source_files, e.g. "src/services/claude/chatWithTools.ts".',
				},
			},
			required: ['path'],
		},
	},
	{
		name: 'search_source_code',
		description:
			'Search bundled source files for a string or regex pattern. Returns matching lines with file paths and line numbers.',
		input_schema: {
			type: 'object',
			properties: {
				query: {
					type: 'string',
					description: 'Text or regex pattern to search for.',
				},
				path_prefix: {
					type: 'string',
					description: 'Optional path prefix to limit search scope.',
				},
				case_sensitive: {
					type: 'boolean',
					description: 'Whether the search is case-sensitive. Defaults to false.',
				},
			},
			required: ['query'],
		},
	},
] satisfies Anthropic.Tool[]

const CODEBASE_TOOL_NAMES = new Set<string>(
	CODEBASE_TOOL_DECLARATIONS.map((tool) => tool.name),
)

export function isCodebaseToolName(name: string): boolean {
	return CODEBASE_TOOL_NAMES.has(name)
}

function normalizePath(value: string): string {
	return value.trim().replace(/\\/g, '/').replace(/^\.\//, '')
}

function filterPaths(pathPrefix?: string): string[] {
	const prefix = pathPrefix ? normalizePath(pathPrefix) : ''
	if (!prefix) {
		return [...SOURCE_CODE_PATHS]
	}

	return SOURCE_CODE_PATHS.filter((filePath) => filePath.startsWith(prefix))
}

export function executeCodebaseToolCall(
	name: string,
	args: Record<string, unknown>,
): CodebaseToolResult {
	switch (name) {
		case 'list_source_files':
			return listSourceFiles(args)
		case 'read_source_file':
			return readSourceFile(args)
		case 'search_source_code':
			return searchSourceCode(args)
		default:
			return {
				name,
				response: { error: `Unknown codebase tool: ${name}` },
			}
	}
}

function listSourceFiles(args: Record<string, unknown>): CodebaseToolResult {
	const pathPrefix =
		typeof args.path_prefix === 'string' ? args.path_prefix : undefined
	const paths = filterPaths(pathPrefix)

	return {
		name: 'list_source_files',
		response: {
			generated_at: SOURCE_CODE_GENERATED_AT,
			count: paths.length,
			paths,
		},
	}
}

function readSourceFile(args: Record<string, unknown>): CodebaseToolResult {
	const path = typeof args.path === 'string' ? normalizePath(args.path) : ''
	if (!path) {
		return {
			name: 'read_source_file',
			response: { error: 'path is required.' },
		}
	}

	const content = SOURCE_CODE_INDEX[path]
	if (!content) {
		return {
			name: 'read_source_file',
			response: {
				error: `Unknown source path: ${path}`,
				suggestion: 'Call list_source_files first.',
			},
		}
	}

	const truncated = content.length > MAX_READ_CHARS
	const body = truncated ? content.slice(0, MAX_READ_CHARS) : content

	return {
		name: 'read_source_file',
		response: {
			path,
			length: content.length,
			truncated,
			content: body,
		},
	}
}

function searchSourceCode(args: Record<string, unknown>): CodebaseToolResult {
	const query = typeof args.query === 'string' ? args.query.trim() : ''
	if (!query) {
		return {
			name: 'search_source_code',
			response: { error: 'query is required.' },
		}
	}

	const pathPrefix =
		typeof args.path_prefix === 'string' ? args.path_prefix : undefined
	const caseSensitive = args.case_sensitive === true
	const flags = caseSensitive ? 'g' : 'gi'
	let pattern: RegExp

	try {
		pattern = new RegExp(query, flags)
	} catch {
		const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
		pattern = new RegExp(escaped, flags)
	}

	const matches: Array<{
		path: string
		line: number
		text: string
	}> = []

	for (const filePath of filterPaths(pathPrefix)) {
		const content = SOURCE_CODE_INDEX[filePath]
		const lines = content.split('\n')

		for (let index = 0; index < lines.length; index += 1) {
			const lineText = lines[index]
			if (!pattern.test(lineText)) {
				pattern.lastIndex = 0
				continue
			}

			pattern.lastIndex = 0
			matches.push({
				path: filePath,
				line: index + 1,
				text: lineText.trim().slice(0, MAX_SEARCH_LINE_CHARS),
			})

			if (matches.length >= MAX_SEARCH_RESULTS) {
				break
			}
		}

		if (matches.length >= MAX_SEARCH_RESULTS) {
			break
		}
	}

	return {
		name: 'search_source_code',
		response: {
			query,
			match_count: matches.length,
			truncated: matches.length >= MAX_SEARCH_RESULTS,
			matches,
		},
	}
}
