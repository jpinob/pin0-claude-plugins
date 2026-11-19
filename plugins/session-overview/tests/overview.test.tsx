import { expect, mock, test } from 'claude-code/testing'

import {
  barCells,
  barSegments,
  clockTime,
  compactTokens,
  countdown,
  freePercent,
  levelOf,
  prettyEffort,
  prettyModel,
} from '../hooks/format'
import { parseWorkspace, repoFromRemote } from '../hooks/workspace'

const NOW = Date.parse('2026-10-20T12:00:00Z')

const PANE = {
  plugin: 'session-overview',
  component: 'Pane',
  requestId: 'session-overview',
  props: {
    title: 'Session overview',
    isFocused: false,
    bodyColumns: 34,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('format helpers', async () => {
  expect(prettyModel('claude-opus-5-5[1m]')).toBe('Opus 5.5 · 1M')
  expect(prettyModel('claude-sonnet-4-5-20250929')).toBe('Sonnet 4.5')
  expect(prettyModel('claude-haiku-5-5')).toBe('Haiku 5.5')
  expect(prettyModel('opus')).toBe('Opus')
  expect(compactTokens(460_000)).toBe('460k')
  expect(compactTokens(1_000_000)).toBe('1M')
  expect(compactTokens(1_500)).toBe('1.5k')
  expect(clockTime(42 * 60_000 + 17_000)).toBe('00:42:17')
  expect(clockTime(26 * 3_600_000)).toBe('1d 02:00:00')
  expect(countdown((3 * 60 + 12) * 60_000)).toBe('3h 12m')
  expect(countdown((53 * 60 + 5) * 3_600_000 / 60)).toBe('2d 5h')
  expect(freePercent(23.5)).toBe(76.5)
  expect(levelOf(69.9)).toBe('ok')
  expect(levelOf(70)).toBe('high')
  expect(levelOf(90)).toBe('critical')
  expect(barCells(50, 10)).toEqual({ filled: 5, empty: 5 })
  expect(barCells(140, 10)).toEqual({ filled: 10, empty: 0 })
  expect(prettyEffort('high')).toBe('high ▰▰▰▱▱')
  expect(prettyEffort('max')).toBe('max ▰▰▰▰▰')
  expect(prettyEffort(8000)).toBe('8000')
})

test('the pane shows every figure, on terminal and desktop', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.model', () => ({ value: 'claude-opus-5-5[1m]' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW - (42 * 60_000 + 17_000),
      context: { tokens: 460_000, window: 1_000_000, percent: 46 },
      cost: { usd: 1.84 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 28, resetsAt: '2026-10-20T15:12:00Z' },
        { kind: 'seven_day', percentUsed: 92.5, resetsAt: '2026-10-22T17:00:00Z' },
      ],
    },
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text

    expect(await text(/Opus/)).toBe('Opus 5.5 · 1M')
    expect(await text(/^\$/)).toBe('$1.84')
    expect(await text(/^\d\d:/)).toBe('00:42:17')
    expect(await text(/^46% used/)).toBe('46% used')
    expect(await text(/^54% free/)).toBe('54% free')
    expect(await text(/tokens/)).toBe('460k / 1M tokens')
    expect(await text(/^28% used/)).toBe('28% used')
    expect(await text(/3h 12m/)).toBe('resets in 3h 12m')
    expect(await text(/^92.5% used/)).toBe('92.5% used')
    expect(await text(/^7.5% free/)).toBe('7.5% free')
    expect(await text(/2d 5h/)).toBe('resets in 2d 5h')
    expect(await text(/CRITICAL/)).toBe('🔴 CRITICAL')
    // The signature is checked piece by piece in signature.test.tsx.
    expect(await text(/^made with $/)).toBe('made with ')
    await ui.unmount()
  }
})

test('the pane says when a window has no reading yet', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /No reading yet/ }))?.text).toBe('No reading yet.')
  expect((await ui.find({ type: 'Text', text: /^n\/a$/ }))?.text).toBe('n/a')
  await ui.unmount()
})

test('workspace parsing: primary checkout, linked worktree, detached, no repo', async () => {
  const primary = ['E:/DEV/app', 'E:/DEV/app/.git', 'E:/DEV/app/.git', ''].join('\n')
  const linked = ['E:/DEV/app-wt/feat', 'E:/DEV/app/.git/worktrees/feat', 'E:/DEV/app/.git', ''].join('\n')

  expect(parseWorkspace('E:\\DEV\\app', primary, 'main\n', '')).toEqual({
    cwd: 'E:\\DEV\\app',
    folder: 'app',
    git: { repo: 'app', branch: 'main' },
  })
  expect(parseWorkspace('E:/DEV/app-wt/feat', linked, 'feat/login\n', '', 'git@github.com:acme/app.git\n').git).toEqual({
    repo: 'acme/app',
    branch: 'feat/login',
    worktree: 'feat',
  })
  expect(parseWorkspace('E:/DEV/app', primary, '\n', 'abc1234\n').git).toEqual({ repo: 'app', head: 'abc1234' })
  expect(repoFromRemote('https://github.com/jpinob/session-overview.git')).toBe('jpinob/session-overview')
  expect(repoFromRemote('ssh://git@host:2222/team/tool')).toBe('team/tool')
  expect(repoFromRemote(undefined)).toBeUndefined()
  expect(parseWorkspace('E:/DEV/mods', undefined, '', '')).toEqual({ cwd: 'E:/DEV/mods', folder: 'mods' })
})

test('the pane shows the folder, branch and worktree git reports', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'overview' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'E:/DEV/app-wt/feat' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('process.run', (_, e) => {
    const args = e.argv.join(' ')
    const stdout = args.includes('--show-toplevel')
      ? ['E:/DEV/app-wt/feat', 'E:/DEV/app/.git/worktrees/feat', 'E:/DEV/app/.git', ''].join('\n')
      : args.includes('--show-current')
        ? 'feat/login\n'
        : args.includes('get-url')
          ? 'https://github.com/acme/app.git\n'
          : ''

    return {
      value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })

  await $.session.start({ cwd: 'E:/DEV/app-wt/feat', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text

  expect(await text(/^feat\/login$/)).toBe('feat/login')
  expect(await text(/^E:/)).toBe('E:/DEV/app-wt/feat')
  expect(await text(/^feat$/)).toBe('feat')
  expect(await text(/^acme\/app$/)).toBe('acme/app')
  await ui.unmount()
})

test('the pane shows the effort of the last main-loop request, not a subagent one', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('turn.step', async function* (_, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
  })

  const step = { turnId: 't1', index: 0, model: 'claude-opus-5-5', messageCount: 1 }
  // A stream runs only while it is read, so each request is drained to its end.
  for await (const _ of $.turn.step({ ...step, effort: 'high' }));
  for await (const _ of $.turn.step({ ...step, index: 1, effort: 'low', agentId: 'sub-1' }));
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /▰/ }))?.text).toBe('high ▰▰▰▱▱')
  await ui.unmount()
})

test('both usage limits share one card', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { window: 200_000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 10, resetsAt: '2026-10-20T13:00:00Z' }],
    },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text
  expect(await text(/LIMITS/)).toBe('🚦 LIMITS')
  expect(await text(/5-hour/)).toBe('⌛ 5-hour')
  expect(await text(/Weekly/)).toBe('📅 Weekly')
  expect(await text(/^10% used/)).toBe('10% used')
  await ui.unmount()
})

test('a card folds to one summary line, unfolds, and the choice is stored', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  // Stands for the engine's store, so the test can see what the mod saved.
  const saved = new Map<string, unknown>()
  on('store.set', (_, e) => (saved.set(e.key, e.value), { value: undefined }))
  on('store.get', (_, e) => ({ value: saved.get(e.key) }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 46_000, window: 100_000, percent: 46 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 28, resetsAt: '2026-10-20T15:12:00Z' },
        { kind: 'seven_day', percentUsed: 92.5, resetsAt: '2026-10-22T17:00:00Z' },
      ],
    },
  }))

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text

    expect(await text(/3h 12m/)).toBe('resets in 3h 12m')
    await ui.press({ key: 'toggle-limits' })
    await clock.settle()
    expect(await text(/3h 12m/)).toBeUndefined()
    expect(await text(/^28% · 93%$/)).toBe('28% · 93%')
    expect(saved.get('collapsed')).toEqual(['limits'])

    await ui.press({ key: 'toggle-limits' })
    await clock.settle()
    expect(await text(/3h 12m/)).toBe('resets in 3h 12m')
    expect(saved.get('collapsed')).toEqual([])
    await ui.unmount()
  }
})

test('bar markers sit at their percentage and keep runs of one colour', async () => {
  const runs = barSegments(50, 10, [{ at: 70, char: '┃', color: 'error' }], 'success', 'subtle')
  expect(runs).toEqual([
    { text: '█████', color: 'success' },
    { text: '░░', color: 'subtle' },
    { text: '┃', color: 'error', isMarker: true },
    { text: '░░', color: 'subtle' },
  ])
  expect(barSegments(50, 4, [{ at: 100, char: '▼', color: 'error' }], 'x', 'y').at(-1)).toEqual({
    text: '▼',
    color: 'error',
    isMarker: true,
  })
  // On a red fill the red marker would vanish, so it is drawn in the text colour.
  expect(barSegments(95, 10, [{ at: 70, char: '┃', color: 'error' }], 'error', 'subtle')[1]).toEqual({
    text: '┃',
    color: 'text',
    isMarker: true,
  })
})

test('the context card marks /compact and auto-compact, and nudges past the mark', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'overview' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'E:/DEV/mods' }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', (_, e) => ({
    value: {
      startedAt: NOW,
      context: {
        tokens: 720_000,
        window: 1_000_000,
        percent: 72,
        ...(e?.breakdown ? { breakdown: { isAutoCompactEnabled: true, autoCompactThreshold: 900_000 } as never } : {}),
      },
      rateLimits: [],
    },
  }))

  await $.session.start({ cwd: 'E:/DEV/mods', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text
  expect(await text(/compact 70%/)).toBe('┃ /compact 70% · ▲ auto 90%')
  expect(await text(/Consider/)).toBe('💡 Consider /compact now')
  expect(await text(/^▲$/)).toBe('▲')
  expect(await text(/▼/)).toBeUndefined()
  await ui.unmount()
})

test('the /compact mark follows the compactAt option', { options: { compactAt: 80 } }, async ($, on) => {
  mock.clock(on, { now: NOW })
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({
    value: { startedAt: NOW, context: { tokens: 72_000, window: 100_000, percent: 72 }, rateLimits: [] },
  }))

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /compact 80%/ }))?.text).toBe('┃ /compact 80%')
  expect(await ui.find({ type: 'Text', text: /Consider/ })).toBeUndefined()
  await ui.unmount()
})

test('outside a repository the workspace card shows one repo row and no branch or worktree', async ($, on) => {
  const clock = mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'overview' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.cwd', () => ({ value: 'E:/DEV/mods' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('process.run', () => ({
    value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))

  await $.session.start({ cwd: 'E:/DEV/mods', surface: 'terminal', isInteractive: true })
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = async (pattern: RegExp) => (await ui.find({ type: 'Text', text: pattern }))?.text
  expect(await text(/not a git repo/)).toBe('not a git repo')
  expect(await text(/Branch/)).toBeUndefined()
  expect(await text(/Worktree/)).toBeUndefined()
  await ui.unmount()
})
