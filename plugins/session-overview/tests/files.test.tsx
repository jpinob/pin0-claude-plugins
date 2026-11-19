import { expect, mock, test } from 'claude-code/testing'

import { displayPath, filesSummary, fileToolPath, recordChange, vscodeArgv } from '../hooks/files'

const NOW = Date.parse('2026-11-17T09:00:00Z')
const CWD = '/home/ana/app'

const PANE = {
  plugin: 'session-overview',
  component: 'Pane',
  requestId: 'session-overview',
  props: {
    title: 'Session overview',
    isFocused: false,
    bodyColumns: 34,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const RUN_OK = { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false }

test('file helpers: which calls count, created vs modified, paths and the VS Code command', async () => {
  expect(fileToolPath('Write', { file_path: '/a/b.ts' })).toBe('/a/b.ts')
  expect(fileToolPath('NotebookEdit', { notebook_path: '/a/n.ipynb' })).toBe('/a/n.ipynb')
  expect(fileToolPath('Read', { file_path: '/a/b.ts' })).toBeUndefined()
  expect(fileToolPath('Edit', { file_path: '/a/b.ts', _host: 'laptop' })).toBeUndefined()

  const once = recordChange([], '/a/new.ts', false, 1)
  const twice = recordChange(recordChange(once, '/a/old.ts', true, 2), '/a/new.ts', true, 3)
  expect(twice).toEqual([
    { path: '/a/new.ts', change: 'created', edits: 2, lastAt: 3 },
    { path: '/a/old.ts', change: 'modified', edits: 1, lastAt: 2 },
  ])
  // Windows paths are one file whatever the case or the slash.
  expect(recordChange(recordChange([], 'C:\\App\\x.ts', true, 1), 'c:/app/x.ts', true, 2)).toHaveLength(1)

  expect(displayPath('/home/ana/app/src/x.ts', CWD)).toBe('src/x.ts')
  expect(displayPath('/home/ana/other/x.ts', CWD)).toBe('/home/ana/other/x.ts')
  expect(displayPath('C:\\Dev\\App\\src\\x.ts', 'c:\\dev\\app')).toBe('src/x.ts')
  expect(filesSummary(twice)).toBe('1 new · 1 modified')
  expect(filesSummary([])).toBe('none yet')

  expect(vscodeArgv('/a/b.ts')).toEqual(['code', '--goto', '/a/b.ts'])
  expect(vscodeArgv('C:\\a\\b.ts')).toEqual(['cmd.exe', '/d', '/c', 'code', '--goto', 'C:\\a\\b.ts'])
  // cmd.exe would run what follows `&`, and `code` would read a leading dash as an option.
  expect(vscodeArgv('C:\\a\\x&calc.ts')).toBeUndefined()
  expect(vscodeArgv('C:\\a\\100%.ts')).toBeUndefined()
  expect(vscodeArgv('-n')).toBeUndefined()
  expect(vscodeArgv('/a/x&y.ts')).toEqual(['code', '--goto', '/a/x&y.ts'])
})

test('the files card lists what the session wrote, and a click opens it in VS Code', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  mock.store(on)
  const existing = new Set([`${CWD}/README.md`])
  const opened: string[][] = []
  on('fs.exists', (_, e) => ({ value: existing.has(e.path) }))
  on('tool.call', (_, e) => {
    // The failing Edit stands for a tool error: it must not be listed.
    const isError = e.tool === 'Edit' && String((e as Record<string, unknown>).file_path).endsWith('broken.ts')

    return isError ? { result: 'error', text: 'error', isError: true } : { result: 'ok', text: 'ok' }
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'code') opened.push([...e.argv])

    return { value: RUN_OK }
  })
  on('session.cwd', () => ({ value: CWD }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'overview' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  // The session start reads the folder the rows are shown relative to.
  await $.session.start({ cwd: CWD, surface: 'terminal', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'Write', file_path: `${CWD}/src/new.ts`, content: 'x' })
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/README.md`, old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: `${CWD}/broken.ts`, old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Read', file_path: `${CWD}/package.json` })
  await clock.settle()

  for (const surface of ['terminal', 'desktop', 'vscode'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text

    expect(await text(/FILES/)).toBe('📝 FILES')
    expect(await text(/^src\/new\.ts$/)).toBe('src/new.ts')
    expect(await text(/^README\.md$/)).toBe('README.md')
    expect(await text(/broken/)).toBeUndefined()
    expect(await text(/package\.json/)).toBeUndefined()

    await ui.press({ key: `open-${CWD}/src/new.ts` })
    await clock.settle()
    expect(opened.at(-1)).toEqual(['code', '--goto', `${CWD}/src/new.ts`])

    // Folded, the card keeps one summary line.
    await ui.press({ key: 'toggle-files' })
    await clock.settle()
    expect(await text(/^src\/new\.ts$/)).toBeUndefined()
    expect(await text(/new · /)).toBe('1 new · 1 modified')
    await ui.press({ key: 'toggle-files' })
    await clock.settle()
    await ui.unmount()
  }
})

test('the files card says so before any file is written', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /No files yet/ }))?.text).toBe(
    'No files yet. Files Claude creates or edits show here.',
  )
  await ui.unmount()
})

test('when VS Code cannot start, a toast says what to check', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  const toasts: string[] = []
  on('fs.exists', () => ({ value: false }))
  on('tool.call', () => ({ result: 'ok', text: 'ok' }))
  on('process.run', (_, e) => ({ value: { ...RUN_OK, exitCode: e.argv[0] === 'code' ? 1 : 0 } }))
  on('ui.toast', (_, e) => (toasts.push(e.text), { value: undefined }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))

  await $.tool.call({ tool: 'Write', file_path: '/tmp/x.ts', content: 'x' })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'open-/tmp/x.ts' })
  await clock.settle()
  expect(toasts.at(-1)).toMatch(/code. command is on your PATH/)
  await ui.unmount()
})
