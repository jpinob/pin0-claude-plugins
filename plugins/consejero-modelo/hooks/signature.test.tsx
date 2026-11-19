// The pane's footer signature: colours by theme, measured contrast, full or short, and the SVG heart off the terminal.
import { expect, test } from 'claude-code/testing'

import { contrast } from './contrast'
import { DARK, LIGHT, SIGNATURE_FULL, SIGNATURE_SHORT } from './signature'

const DARK_SET = ['#ff6b7d', '#FCEE22', '#7DF9FF', '#6FCF3A']
const LIGHT_SET = ['#C2185B', '#8A6A00', '#00727A', '#2f5d08']

const pane = (bodyColumns: number) =>
  ({
    plugin: 'consejero-modelo',
    component: 'Pane',
    requestId: 'prompt-improver',
    props: { title: 'Prompt mejorado', isFocused: false, bodyColumns, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
  }) as const

// The hooks here stand for the engine: the /config rows, with the theme the test names.
function engine(on: any, theme: string) {
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'choice', value: theme, provider: { kind: 'core' }, isLocked: false }] }))
  on('config.set', (_: unknown, e: any) => ({ value: e.value }))
  on('command.register', (_: unknown, e: any) => ({ value: { command: e.name } }))
  on('classic.SessionStart', () => ({}))
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 30))

async function start($: any) {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await settle()
}

// The signature's pieces: every Text and Svg after its centred Box, the last row of the pane.
async function signaturePieces(ui: any): Promise<any[]> {
  const all = await ui.findAll({})
  const i = all.findIndex((x: any) => x.type === 'Box' && x.props?.justifyContent === 'center')
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
    engine(on, theme)
    await start($)
    const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
    const pieces = await signaturePieces(ui)
    expect(pieces.map((p: any) => p.text).join('')).toBe(SIGNATURE_FULL)
    expect([colorOf(pieces, '♥'), colorOf(pieces, 'A'), colorOf(pieces, 'i'), colorOf(pieces, '0')]).toEqual([...set])
    // The rest of the line is the theme's own text colour, dimmed.
    for (const p of pieces.filter((x: any) => !['♥', 'A', 'i', '0'].includes(x.text))) {
      expect(p.props?.color).toBe('text')
      expect(p.props?.dimColor).toBe(true)
    }
    await ui.unmount()
  })
}

test('changing the theme in /config switches the signature to the other set', async ($, on) => {
  engine(on, 'dark')
  await start($)
  await $.config.set({ key: 'theme', value: 'light' } as any)
  await settle()
  const ui = await $.ui.mount({ ...pane(80), surface: 'terminal' })
  expect(colorOf(await signaturePieces(ui), 'A')).toBe(LIGHT.a)
  await ui.unmount()
})

test('a narrow pane gets the short signature, never an empty row', async ($, on) => {
  engine(on, 'dark')
  await start($)
  const ui = await $.ui.mount({ ...pane(20), surface: 'terminal' })
  expect((await signaturePieces(ui)).map((p: any) => p.text).join('')).toBe(SIGNATURE_SHORT)
  await ui.unmount()
})

test('off the terminal the heart is the SVG, with "love" for screen readers', async ($, on) => {
  engine(on, 'dark')
  await start($)
  const ui = await $.ui.mount({ ...pane(80), surface: 'desktop' })
  const heart = (await signaturePieces(ui)).find((p: any) => p.type === 'Svg')
  expect(heart?.props?.alt).toBe('love')
  expect(heart?.props?.source).toContain(DARK.heart)
  expect(heart?.props?.source).not.toContain('currentColor')
  await ui.unmount()
})
