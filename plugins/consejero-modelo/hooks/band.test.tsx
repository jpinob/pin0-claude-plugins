import { expect, test } from 'claude-code/testing'

const OPUS = 'claude-opus-5-5'
// These tests are about the band, so the word rules classify and no model is called.
const WORDS_ONLY = { options: { clasificador: 'palabras' } }
const FABLE = 'Diseña la arquitectura para separar el monolito en servicios'

const BAND = {
  plugin: 'consejero-modelo',
  component: 'AbovePrompt',
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

type Settings = { model: string; effort: string }
const MODELS = ['default', 'fable', 'opus', 'opus[1m]', 'sonnet', 'haiku']

// The hooks here stand for the engine: the session's model, the /config rows and the editor itself.
function engine(on: any, settings: Settings, withSend = true) {
  on('session.model', () => ({ value: settings.model }))
  on('config.list', () => ({
    value: [
      { key: 'model', label: 'Model', kind: 'choice', value: settings.model, options: MODELS, provider: { kind: 'core' }, isLocked: false },
      { key: 'effortLevel', label: 'Effort', kind: 'enum', value: settings.effort, provider: { kind: 'core' }, isLocked: false },
    ],
  }))
  on('classic.SessionStart', () => ({}))
  on('classic.PostModelSwitch', () => ({}))
  on('prompt.edit', (_: unknown, e: any) => {
    const text = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)

    return { text, cursor: e.start + e.inputText.length }
  })
  if (withSend) on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
}

// Reason: the mod classifies in the background so a key never waits on it; a test waits for that work here.
const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 30))

const begin = ($: any, source: string) => $.classic.SessionStart({ source, cwd: '/' })

// One edit as the editor raises it: the draft before and what goes in at its end.
async function typeText($: any, before: string, inputText: string) {
  const box = await $.prompt.edit({
    origin: { kind: 'composer' },
    text: before,
    cursor: before.length,
    start: before.length,
    end: before.length,
    inputText,
  })
  await settle()

  return box
}

async function bandTextOf($: any, surface: 'terminal' | 'desktop' = 'terminal') {
  const ui = await $.ui.mount({ ...BAND, surface })
  const texts = (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('')
  await ui.unmount()

  return texts
}

test('while typing the first prompt, the band shows model, effort and reason', WORDS_ONLY, async ($, on) => {
  const settings = { model: OPUS, effort: 'high' }
  engine(on, settings)
  await begin($, 'startup')

  for (const surface of ['terminal', 'desktop'] as const) {
    const box = await typeText($, '', FABLE)
    // The edit comes back exactly as the editor made it.
    expect(box.text).toBe(FABLE)
    expect(await bandTextOf($, surface)).toBe('Consejo: Fable · medium · arquitectura ')
  }
})

test('key by key: silent with little text, speaks once a rule matches', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'high' })
  await begin($, 'startup')

  let draft = ''
  for (const letter of 'Migra la bd') {
    draft = (await typeText($, draft, letter)).text
  }
  expect(draft).toBe('Migra la bd')
  // 11 characters: under the 12 of minCaracteres.
  expect(await bandTextOf($)).toBe('')
  draft = (await typeText($, draft, ' a Postgres')).text
  expect(await bandTextOf($)).toBe('Consejo: Fable · medium · migración ')
})

test('a suggestion equal to the current settings shows no line', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'medium' })
  await begin($, 'startup')
  await typeText($, '', 'Implementa el endpoint de login con sus tests')

  expect(await bandTextOf($)).toBe('')
})

test('before a bigger model, the line proposes more effort', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'medium' })
  await begin($, 'startup')
  await typeText($, '', FABLE)

  expect(await bandTextOf($)).toBe('Consejo: Opus · high · arquitectura: antes de Fable, sube el effort ')
})

test('the prompt is sent untouched and the mod is silent after the first one', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'high' }, false)
  const sent: string[] = []
  on('prompt.submit', (_, e) => {
    sent.push(e.text)

    return { text: e.text }
  })
  await begin($, 'startup')
  await typeText($, '', FABLE)
  await $.prompt.submit({ text: FABLE } as any)
  await settle()

  expect(sent).toEqual([FABLE])
  expect(await bandTextOf($)).toBe('')
  // A second prompt in the same conversation gets no line.
  await typeText($, '', 'Migra la base de datos a Postgres')
  expect(await bandTextOf($)).toBe('')
})

test('after /clear it speaks again; on a resumed session, it does not', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'high' })
  await begin($, 'resume')
  await typeText($, '', FABLE)
  expect(await bandTextOf($)).toBe('')

  await begin($, 'clear')
  await typeText($, '', FABLE)
  expect(await bandTextOf($)).toBe('Consejo: Fable · medium · arquitectura ')
})

test('switching to the suggested model with /model removes the line', WORDS_ONLY, async ($, on) => {
  const settings = { model: OPUS, effort: 'medium' }
  engine(on, settings)
  await begin($, 'startup')
  await typeText($, '', 'Clasifica estos tickets por prioridad')
  expect(await bandTextOf($)).toBe('Consejo: Haiku · medium · clasificar o leer logs ')

  settings.model = 'claude-haiku-5-5'
  await $.classic.PostModelSwitch({ from_model: OPUS, to_model: settings.model, requested_model: 'haiku', source: 'command' } as any)
  await settle()
  expect(await bandTextOf($)).toBe('')
})

test('Desactivar turns the advisor off with feedback, and /consejo still reports the last one', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'high' })
  await begin($, 'startup')
  await typeText($, '', FABLE)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'turn-off' })
  await ui.unmount()
  expect(await bandTextOf($)).toBe('Consejero desactivado ')

  const { text } = await $.command.run({ command: 'consejo' } as any)
  expect(text).toContain('Consejo: Fable · medium · arquitectura')
  expect(text).toContain('Regla de modelo: fable-arquitectura (Fable). Fuente: mía')
  expect(text).toContain('Tienes puesto: claude-opus-5-5 · high')
})

test('with a survey in the band, the mod gives way', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'high' })
  await begin($, 'startup')
  await typeText($, '', FABLE)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal', props: { ...BAND.props, hasSurvey: true } })
  expect(await ui.find({ type: 'Text', text: /Consejo/ })).toBeUndefined()
  await ui.unmount()
})

test('Aplicar sets the suggested model and effort and leaves the prompt in place', WORDS_ONLY, async ($, on) => {
  const settings = { model: OPUS, effort: 'high' }
  engine(on, settings)
  const written: Array<[string, unknown]> = []
  const toasts: string[] = []
  // The end of the chain writes the row, as the engine does.
  on('config.set', (_, e) => {
    written.push([e.key, e.value])
    if (e.key === 'model') settings.model = `claude-${e.value}-5-2`
    else settings.effort = String(e.value)

    return { value: e.value }
  })
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  const inBox: string[] = []
  on('prompt.fill', (_, e) => {
    inBox.push(e.text)

    return { isFilled: true, text: e.text, cursor: 0 }
  })
  await begin($, 'startup')
  await typeText($, '', FABLE)
  expect(await bandTextOf($)).toBe('Consejo: Fable · medium · arquitectura ')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'apply' })
  await ui.unmount()
  await settle()

  expect(written).toEqual([
    ['model', 'fable'],
    ['effortLevel', 'medium'],
  ])
  expect(toasts).toEqual(['Aplicado: Fable · medium. Tu prompt sigue en la caja.'])
  // Nothing wrote to the prompt box, and the suggestion now matches the settings.
  expect(inBox).toEqual([])
  expect(await bandTextOf($)).toBe('')
})

test('when the engine denies the change, Aplicar says so and touches nothing else', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'medium' })
  const toasts: string[] = []
  on('config.set', (_, e) => (e.key === 'model' ? { deny: 'solo su diálogo la cambia' } : { value: e.value }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  await begin($, 'startup')
  await typeText($, '', 'Clasifica estos tickets por prioridad')

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'apply' })
  await ui.unmount()
  await settle()

  expect(toasts).toEqual(['No se pudo aplicar (modelo: solo su diálogo la cambia). Cámbialo con /model o /effort.'])
  expect(await bandTextOf($)).toBe('Consejo: Haiku · medium · clasificar o leer logs ')
})

test('the advisor stays off after /clear and Activar brings the advice back', WORDS_ONLY, async ($, on) => {
  engine(on, { model: OPUS, effort: 'high' })
  let emptied = false
  on('state.get', (_: unknown, e: any, next: any) =>
    emptied && e.key === 'isOff' ? { value: { value: undefined, version: 0 } } : next(e))
  on('state.set', (_: unknown, e: any, next: any) => {
    if (e.key === 'isOff') emptied = false
    return next(e)
  })
  await begin($, 'startup')
  let draft = await typeText($, '', FABLE)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'turn-off' })
  await ui.unmount()

  // A /clear opens a new first prompt, but the switch belongs to the session.
  // Reason: the real engine starts $.state afresh on /clear and the kit does not, so here the switch reads
  // as never set until the mod writes it again.
  emptied = true
  await begin($, 'clear')
  draft = await typeText($, '', FABLE)
  expect(await bandTextOf($)).toBe('Consejero desactivado ')

  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'turn-on' })
  await ui.unmount()
  await settle()
  expect(await bandTextOf($)).toContain('arquitectura')
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.findAll({ type: 'Button' })).map((b: any) => b.key)).toEqual(['apply', 'improve', 'turn-off'])
  await ui.unmount()
  void draft
})
