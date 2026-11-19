import { expect, test } from 'claude-code/testing'

import { detectLang, langFromSetting, MESSAGES } from './i18n'

// The band's advice comes from the word rules here, so the only model call a test sees is the improver's.
const WORDS_ONLY = { options: { clasificador: 'palabras' } }

const BAND = {
  plugin: 'consejero-modelo',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: {
    hasSurvey: false,
    isCollapsed: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const PANEL = {
  plugin: 'consejero-modelo',
  component: 'Pane',
  requestId: 'prompt-improver',
  surface: 'terminal',
  props: {
    title: 'Improved prompt',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('the language of a draft comes from its words and its Spanish-only signs', async () => {
  expect(detectLang('add dark mode to the settings page')).toBe('en')
  expect(detectLang('arregla el login que falla con usuarios nuevos')).toBe('es')
  expect(detectLang('Migra la bd a Postgres')).toBe('es')
  expect(detectLang('¿Qué pasa?')).toBe('es')
  expect(detectLang('Fix login [REQUIRED: which error?]')).toBe('en')
  // Nothing that tells them apart, or a tie: the caller keeps the language it had.
  expect(detectLang('Postgres MySQL')).toBeNull()
  expect(detectLang('test login')).toBeNull()
  expect(detectLang('the casa de')).toBeNull()
})

test("Claude Code's language setting picks the starting language; anything else is English", async () => {
  expect(langFromSetting('spanish')).toBe('es')
  expect(langFromSetting('Español')).toBe('es')
  expect(langFromSetting('english')).toBe('en')
  expect(langFromSetting('japanese')).toBe('en')
  expect(langFromSetting(undefined)).toBe('en')
})

test('both languages have the same texts', async () => {
  expect(Object.keys(MESSAGES.en).sort()).toEqual(Object.keys(MESSAGES.es).sort())
  expect(Object.keys(MESSAGES.en.haikuSteps).sort()).toEqual(Object.keys(MESSAGES.es.haikuSteps).sort())
})

type Engine = { box: string; calls: string[] }

// The hooks here stand for the engine: the session, the box, the model and the panes.
function engine(on: any): Engine {
  const m: Engine = { box: '', calls: [] }
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('config.list', () => ({
    value: [{ key: 'effortLevel', label: 'Effort', kind: 'enum', value: 'high', provider: { kind: 'core' }, isLocked: false }],
  }))
  on('classic.SessionStart', () => ({}))
  on('prompt.edit', (_: unknown, e: any) => {
    m.box = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)

    return { text: m.box, cursor: m.box.length }
  })
  on('prompt.read', () => ({ value: { text: m.box, cursor: m.box.length } }))
  on('model.complete', (_: unknown, e: any) => {
    m.calls.push(e.prompt)
    const reply = '<mejorado>Design the architecture to split the monolith into services. [REQUIRED: which services first?]</mejorado>'

    return { value: { isAnswered: true, text: reply, usage: {} } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))

  return m
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 30))

async function typeDraft($: any, text: string) {
  await $.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
  await settle()
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')
const labels = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.text)

test('an English draft gets the band in English, and a Spanish one switches it back', WORDS_ONLY, async ($, on) => {
  engine(on)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })

  await typeDraft($, 'Design the architecture to split the monolith into services')
  let band = await $.ui.mount(BAND)
  expect(await texts(band)).toContain('Advice: ')
  expect(await texts(band)).toContain('Fable · medium · architecture')
  expect(await labels(band)).toEqual(['Apply', 'Improve', 'Turn off'])
  await band.unmount()

  await typeDraft($, 'Diseña la arquitectura para separar el monolito en servicios')
  band = await $.ui.mount(BAND)
  expect(await texts(band)).toContain('Consejo: ')
  expect(await texts(band)).toContain('Fable · medium · arquitectura')
  expect(await labels(band)).toEqual(['Aplicar', 'Mejorar', 'Desactivar'])
  await band.unmount()
})

test('an English draft gets the pane in English; the proposal keeps its own tags', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await typeDraft($, 'Design the architecture to split the monolith into services')
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'improve' })
  await band.unmount()
  await settle()

  expect(m.calls.length).toBe(1)
  const pane = await $.ui.mount(PANEL)
  const shown = await texts(pane)
  expect(shown).toContain("Sonnet's proposal")
  expect(shown).toContain(' · 1 required')
  expect(shown).toContain('[REQUIRED: which services first?]')
  expect(shown).toContain('Changes: your text stays the same; it only adds questions.')
  expect(await labels(pane)).toEqual(['Use', 'Discard'])
  await pane.unmount()
})

test("/consejo answers in the language of the last draft", WORDS_ONLY, async ($, on) => {
  engine(on)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await typeDraft($, 'Design the architecture to split the monolith into services')
  const english = await $.command.run({ command: 'consejo', args: '' } as any)
  expect(english.text).toContain('Advice: Fable · medium · architecture')
  expect(english.text).toContain('You have: claude-opus-5-5 · high')

  await typeDraft($, 'Diseña la arquitectura para separar el monolito en servicios')
  const spanish = await $.command.run({ command: 'consejo', args: '' } as any)
  expect(spanish.text).toContain('Tienes puesto: claude-opus-5-5 · high')
})
