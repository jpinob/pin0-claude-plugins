// The session's files: which ones the file tools created or modified, and
// opening one in VS Code. Pure helpers first, then the few engine calls.
import { atom, update } from 'claude-code'
import type { ElementTable, EngineInterface } from 'claude-code'

import type { FileChange, SessionFile } from '../types'

// The built-in tools that write a file, and the argument that names it.
const FILE_ARG: Record<string, 'file_path' | 'notebook_path'> = {
  Write: 'file_path',
  Edit: 'file_path',
  NotebookEdit: 'notebook_path',
}

const OPEN_TIMEOUT_MS = 15_000

const files = atom({ plugin: 'session-overview', key: 'files' } as const, [])

// Reason: colour alone must never carry the meaning, so each change has a letter, as `git status` writes it.
export const CHANGE_LETTER: Record<FileChange, string> = { created: 'A', modified: 'M' }
export const CHANGE_COLOR: Record<FileChange, string> = { created: 'success', modified: 'warning' }

/**
 * The local path a file tool call writes, or undefined for any other tool,
 * a call with no path, or one sent to another machine (`_host`).
 */
export const fileToolPath = (tool: string, input: Readonly<Record<string, unknown>>): string | undefined => {
  const arg = FILE_ARG[tool]
  if (arg === undefined || input._host !== undefined) return undefined
  const path = input[arg]

  return typeof path === 'string' && path.trim() !== '' ? path : undefined
}

export const isWindowsPath = (path: string): boolean => /^[a-z]:[\\/]/i.test(path) || path.startsWith('\\\\')

// Windows paths compare without case and with either slash.
const comparable = (path: string) => {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '')

  return isWindowsPath(path) ? slashed.toLowerCase() : slashed
}

/**
 * Adds one write to the list: a new entry on top, or the same file moved to
 * the top with one more edit. A file the session created stays "created".
 */
export const recordChange = (
  list: readonly SessionFile[],
  path: string,
  existedBefore: boolean,
  at: number,
): SessionFile[] => {
  const key = comparable(path)
  const previous = list.find(file => comparable(file.path) === key)
  const rest = list.filter(file => file !== previous)
  const change: FileChange = previous?.change ?? (existedBefore ? 'modified' : 'created')

  return [{ path, change, edits: (previous?.edits ?? 0) + 1, lastAt: at }, ...rest]
}

/** The path relative to `cwd` when it sits inside it, else the path as given. */
export const displayPath = (path: string, cwd: string | undefined): string => {
  if (!cwd) return path
  const base = `${comparable(cwd)}/`
  const full = path.replace(/\\/g, '/')

  return comparable(path).startsWith(base) ? full.slice(base.length) : path
}

/** `2 new · 3 modified`; `none yet` for an empty list. */
export const filesSummary = (list: readonly SessionFile[]): string => {
  if (list.length === 0) return 'none yet'
  const created = list.filter(file => file.change === 'created').length
  const modified = list.length - created
  const parts = [created > 0 ? `${created} new` : '', modified > 0 ? `${modified} modified` : '']

  return parts.filter(Boolean).join(' · ')
}

// Characters cmd.exe acts on even inside a path: a path holding one is never handed to it.
const CMD_SPECIAL = /[&|<>^%!"\r\n]/

/**
 * The command that opens `path` in VS Code, or undefined when the path cannot
 * be passed safely. `--goto` focuses the file in the window that already
 * holds its folder, or the last one used.
 */
export const vscodeArgv = (path: string): string[] | undefined => {
  // Reason: a path that starts with a dash would be read as one of `code`'s own options.
  if (path.startsWith('-')) return undefined
  if (!isWindowsPath(path)) return ['code', '--goto', path]
  // Reason: on Windows `code` is a .cmd script that only cmd.exe starts, and cmd.exe
  // would run what follows an `&` in a file name as a command of its own.
  if (CMD_SPECIAL.test(path)) return undefined

  return ['cmd.exe', '/d', '/c', 'code', '--goto', path]
}

// Function declarations, not arrows: the engine follows `$` across files only into those.
export async function noteFileChange($: EngineInterface, path: string, existedBefore: boolean) {
  const at = await $.clock.now()
  await update($, files, list => recordChange(list, path, existedBefore, at))
}

export async function openInVSCode($: EngineInterface, path: string) {
  const argv = vscodeArgv(path)
  if (argv === undefined) {
    $.ui.toast('This file name has characters the pane does not pass to a command. Open it from VS Code.')

    return
  }
  try {
    const run = await $.process.run(argv, { timeoutMs: OPEN_TIMEOUT_MS })
    if (run.exitCode === 0) return
  } catch {
    // `code` missing or too slow: the toast below says what to check.
  }
  $.ui.toast('Could not open VS Code. Check that the `code` command is on your PATH.')
}

type Elements = Pick<ElementTable, 'Box' | 'Text' | 'Button'>

/**
 * The card's body: one row per file, newest first. A press on a row opens
 * the file in VS Code.
 */
export function fileListBody(
  $: EngineInterface,
  { Box, Text, Button }: Elements,
  list: readonly SessionFile[],
  cwd: string | undefined,
  mutedColor: string,
) {
  if (list.length === 0) {
    return (
      <Text color={mutedColor} size="footnote" wrap="wrap">
        No files yet. Files Claude creates or edits show here.
      </Text>
    )
  }

  return (
    <Box flexDirection="column">
      {list.map(file => (
        <Box columnGap={1}>
          <Box flexShrink={0}>
            <Text color={CHANGE_COLOR[file.change]} weight="bold">
              {CHANGE_LETTER[file.change]}
            </Text>
          </Box>
          {/* Reason: the key is the path, so the row keeps its address when the list reorders. */}
          <Button key={`open-${file.path}`} plain onPress={() => void openInVSCode($, file.path)}>
            <Text wrap="truncate-start">{displayPath(file.path, cwd)}</Text>
          </Button>
        </Box>
      ))}
      <Text color={mutedColor} size="footnote">
        A created · M modified · click to open in VS Code
      </Text>
    </Box>
  )
}
