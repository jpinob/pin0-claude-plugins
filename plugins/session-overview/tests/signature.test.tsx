// The pane's footer signature: colours by theme, measured contrast, full or short, and the SVG heart off the terminal.
import { expect, mock, test } from 'claude-code/testing'

import { contrast } from '../hooks/contrast'
import { DARK, LIGHT, SIGNATURE_FULL, SIGNATURE_SHORT } from '../hooks/signature'

const NOW = Date.parse('2026-10-20T12:00:00Z')
const DARK_SET = ['#ff6b7d', '#FCEE22', '#7DF9FF', '#6FCF3A']
const LIGHT_SET = ['#C2185B', '#8A6A00', '#00727A', '#2f5d08']

const pane = (bodyColumns: number) =>
  ({
    plugin: 'session-overview',
    component: 'Pane',
    requestId: 'session-overview',
    props: { title: 'Session overview', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

// The hooks here stand for the engine: the session, git, and the /config rows with the theme the test names.
function engine(on: any, theme: string) {
  const clock = mock.clock(on, { now: NOW })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: any) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.cwd', () => ({ value: '/demo' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: NOW, context: { window: 200_000 }, rateLimits: [] } }))
  on('process.run', () => ({ value: { exitCode: 128, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme, provider: { kind: 'core' }, isLocked: false }] }))
  on('config.set', (_: unknown, e: any) => ({ value: e.value }))

  return clock
}

async function start($: any, clock: any) {
  await $.session.start({ cwd: '/demo', surface: 'terminal', isInteractive: true })
  await clock.settle()
}

// The signature's pieces: every Text and Svg after its centred Box, the last row of the pane.
async function signaturePieces(ui: any): Promise<any[]> {
  const all = await ui.findAll({})
  const i = all.findLastIndex((x: any) => x.type === 'Box' && x.props?.justifyContent === 'center')
  return i < 0 ? [] : all.slice(i + 1).filter((x: any) => x.type === 'Text' || x.type === 'Svg')
}

const colorOf = (pieces: any[], text: string) => pieces.find((p: any) => p.text === text)?.props?.color

test('every signature colour passes WCAG contrast on its theme backgrounds (4.5:1 letters, 3:1 heart)', () => {
  // Reason: the threshold has to bite; without these, a contrast() that always said 21 would pass anything.
  expect(Math.round(contrast('#000000', '#FFFFFF') * 10) / 10).toBe(21)
  expect(contrast('#777777', '#777777')).toBe(1)
  expect(contrast('#FCEE22', '#FFFFFF')).toBeLessThan(4.5)
  for (const [set, backgrounds] of [[DARK, ['#1E1E1E', '#000000']], [LIGHT, ['#FFFFFF', '#F5F5F5']]] as const) {
    for (const bg of backgrounds) {
      expect(contrast(set.a, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(set.i, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(set.zero, bg)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(set.heart, bg)).toBeGreaterThanOrEqual(3)
    }
  }
  expect([DARK.heart, DARK.a, DARK.i, DARK.zero]).toEqual(DARK_SET)
  expect([LIGHT.heart, LIGHT.a, LIGHT.i, LIGHT.zero]).toEqual(LIGHT_SET)
})

for (const [theme, set] of [['dark', DARK_SET], ['light', LIGHT_SET]] as const) {
  test(`the pane ends with the full signature in the ${theme} theme's colours`, async ($, on) => {
    const clock = engine(on, theme)
    await start($, clock)
    const ui = await $.ui.mount({ ...pane(34), surface: 'terminal' })
    const pieces = await signaturePieces(ui)
    expect(pieces.map((p: any) => p.text).join('')).toBe(SIGNATURE_FULL)
    expect([colorOf(pieces, '♥'), colorOf(pieces, 'A'), colorOf(pieces, 'i'), colorOf(pieces, '0')]).toEqual([...set])
    await ui.unmount()
  })
}

test('changing the theme in /config switches the signature to the other set', async ($, on) => {
  const clock = engine(on, 'dark')
  await start($, clock)
  await $.config.set({ key: 'theme', value: 'light' } as any)
  await clock.settle()
  const ui = await $.ui.mount({ ...pane(34), surface: 'terminal' })
  expect(colorOf(await signaturePieces(ui), 'A')).toBe(LIGHT.a)
  await ui.unmount()
})

test('a narrow pane gets the short signature, and off the terminal the heart is the SVG with "love"', async ($, on) => {
  const clock = engine(on, 'dark')
  await start($, clock)
  const narrow = await $.ui.mount({ ...pane(20), surface: 'terminal' })
  expect((await signaturePieces(narrow)).map((p: any) => p.text).join('')).toBe(SIGNATURE_SHORT)
  await narrow.unmount()

  const desktop = await $.ui.mount({ ...pane(34), surface: 'desktop' })
  const heart = (await signaturePieces(desktop)).find((p: any) => p.type === 'Svg')
  expect(heart?.props?.alt).toBe('love')
  expect(heart?.props?.source).toContain(DARK.heart)
  await desktop.unmount()
})
