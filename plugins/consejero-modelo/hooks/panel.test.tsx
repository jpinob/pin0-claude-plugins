import { expect, test } from 'claude-code/testing'

const OPUS = 'claude-opus-5-5'
// The band's consejo is the word rules' here, so the only model call a test sees is the improver's.
const WORDS_ONLY = { options: { clasificador: 'palabras' } }
const DRAFT = 'arregla el login que falla con usuarios nuevos'
const PROPOSAL = 'Arregla el login que falla con usuarios nuevos. Hecho cuando entren sin error. [NECESARIO: ¿qué error sale?] [OPCIONAL: ¿qué navegador?]'

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
  props: {
    title: 'Prompt mejorado',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

type Engine = {
  box: string
  calls: Array<{ model: string; system: string; prompt: string }>
  fills: string[]
  paints: any[][]
  opened: string[]
  closed: string[]
  sends: string[]
  reply: () => any
}

// The hooks here stand for the engine: the session, the prompt box, the model and the panes.
function engine(on: any): Engine {
  const m: Engine = {
    box: '',
    calls: [],
    fills: [],
    paints: [],
    opened: [],
    closed: [],
    sends: [],
    reply: () => ({ isAnswered: true, text: `<mejorado>${PROPOSAL}</mejorado>`, usage: {} }),
  }
  on('session.model', () => ({ value: OPUS }))
  on('config.list', () => ({
    value: [{ key: 'effortLevel', label: 'Effort', kind: 'enum', value: 'medium', provider: { kind: 'core' }, isLocked: false }],
  }))
  on('classic.SessionStart', () => ({}))
  on('command.register', (_: unknown, e: any) => ({ value: { command: e.name } }))
  on('prompt.edit', (_: unknown, e: any) => {
    m.box = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)

    return { text: m.box, cursor: m.box.length }
  })
  on('prompt.read', () => ({ value: { text: m.box, cursor: m.box.length } }))
  on('prompt.fill', (_: unknown, e: any) => {
    m.fills.push(e.text)
    m.paints.push(e.decorations ?? [])
    m.box = e.text

    return { isFilled: true }
  })
  on('prompt.submit', (_: unknown, e: any) => {
    m.sends.push(e.text)

    return { text: e.text }
  })
  on('model.complete', (_: unknown, e: any) => {
    m.calls.push({ model: e.model, system: e.system, prompt: e.prompt })

    return Promise.resolve(m.reply()).then(value => ({ value }))
  })
  on('ui.open', (_: unknown, e: any) => {
    m.opened.push(e.id)

    return { value: { isPlaced: true } }
  })
  on('ui.close', (_: unknown, e: any) => {
    m.closed.push(e.id)

    return { value: undefined }
  })

  return m
}

// Reason: the mod reads drafts in the background so a key never waits on it; a test waits for that work here.
const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 30))

async function typeDraft($: any, text: string) {
  await $.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
  await settle()
}

// The first prompt of the session is sent, so the consejo is gone and only the improver can speak.
async function afterFirst($: any, m: Engine) {
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await typeDraft($, 'Resume este documento en cinco puntos')
  await $.prompt.submit({ text: m.box })
  m.box = ''
  await settle()
}

const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')

const buttons = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.key)

async function pressImprove($: any) {
  const band = await $.ui.mount(BAND)
  await band.press({ key: 'improve' })
  await band.unmount()
  await settle()
}

test('Mejorar shows on any prompt with text, not on a short one or a command', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)

  for (const [text, out] of [
    [DRAFT, true],
    ['arregla eso', false],
    ['/consejo auditar ahora', false],
  ] as const) {
    await typeDraft($, text)
    const band = await $.ui.mount(BAND)
    expect((await buttons(band)).includes('improve')).toBe(out)
    await band.unmount()
  }
})

test('on the first prompt, Mejorar sits next to the advice', WORDS_ONLY, async ($, on) => {
  engine(on)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await typeDraft($, 'Diseña la arquitectura para separar el monolito en servicios')
  const band = await $.ui.mount(BAND)
  expect(await buttons(band)).toEqual(['apply', 'improve', 'turn-off'])
  await band.unmount()
})

test('Mejorar shows the proposal in the pane and leaves the box alone until Preparar', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  await pressImprove($)

  expect(m.opened).toEqual(['prompt-improver'])
  expect(m.calls.length).toBe(1)
  expect(m.calls[0]?.model).toBe('sonnet')
  expect(m.calls[0]?.prompt).toBe(`<prompt>\n${DRAFT}\n</prompt>`)
  // The box still holds the draft as typed: nothing was filled.
  expect(m.fills).toEqual([])
  expect(m.box).toBe(DRAFT)

  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  const readBack = await texts(panel)
  expect(readBack).toContain('Propuesta de Sonnet')
  expect(readBack).toContain(' · 1 necesario')
  expect(readBack).toContain(' · 1 opcional')
  expect(readBack).toContain('[NECESARIO: ¿qué error sale?]')
  // The capital and the full stop are no change; the five new words are.
  expect(readBack).toContain('Cambios: añadió 5 palabras. No quitó nada de lo tuyo.')
  expect(readBack).not.toContain('Más larga de lo pedido')
  // Two cards: the prompt, and the effort row the words give for a bug fix (medium → high). No Preparar yet.
  expect(readBack).toContain('Effort: medium → high · depuración')
  expect(readBack).toContain('Elige Usar o Descartar en cada fila y pulsa Preparar.')
  expect(await buttons(panel)).toEqual(['use', 'discard', 'use-effort', 'discard-effort', 'close'])
  await panel.unmount()
  // Nothing is ever sent by the mod.
  expect(m.sends.length).toBe(1)
})

test('Usar and Preparar put the proposal in the box, and Deshacer restores the exact text', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  await pressImprove($)

  const panel = await $.ui.mount({ ...PANEL, surface: 'desktop' })
  await panel.press({ key: 'use' })
  // A pick alone changes nothing; Preparar waits for the effort row's pick too.
  expect(m.fills).toEqual([])
  expect(await buttons(panel)).not.toContain('prepare')
  await panel.press({ key: 'discard-effort' })
  await panel.press({ key: 'prepare' })
  expect(m.fills).toEqual([PROPOSAL])
  expect(m.box).toBe(PROPOSAL)
  // The tags go into the box painted by level: red for required, green for optional.
  expect(m.paints[0]?.map((d: any) => [PROPOSAL.slice(d.start, d.end), d.color])).toEqual([
    ['[NECESARIO: ¿qué error sale?]', 'error'],
    ['[OPCIONAL: ¿qué navegador?]', 'success'],
  ])
  expect(await buttons(panel)).toEqual(['undo', 'close'])
  expect(await texts(panel)).toContain('Ya está en tu caja: rellena las etiquetas y pulsa Enter.')

  await panel.press({ key: 'undo' })
  expect(m.fills).toEqual([PROPOSAL, DRAFT])
  expect(m.box).toBe(DRAFT)
  // Back to the proposal with the picks kept, so it can be prepared again.
  expect(await buttons(panel)).toEqual(['use', 'discard', 'use-effort', 'discard-effort', 'prepare', 'close'])
  await panel.unmount()
  expect(m.sends.length).toBe(1)
})

test('with improver "haiku" the call goes to Haiku', { options: { clasificador: 'palabras', mejorador: 'haiku' } }, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  await pressImprove($)

  expect(m.calls.map(l => l.model)).toEqual(['haiku'])
  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await texts(panel)).toContain('Propuesta de Haiku · 1 necesario')
  await panel.unmount()
})

test('a failure or an invalid reply says so and leaves the box as it was', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)

  for (const [reply, reason] of [
    [{ isAnswered: false, reason: 'api-error', status: 529 }, 'error de la API 529'],
    [{ isAnswered: true, text: 'Claro, aquí va el login arreglado: ...', usage: {} }, 'respondió algo que no es un prompt'],
  ] as const) {
    m.reply = () => reply
    await pressImprove($)
    const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
    const readBack = await texts(panel)
    expect(readBack).toContain(`Sonnet no pudo mejorarlo: ${reason}.`)
    expect(readBack).toContain('Tu prompt sigue igual en la caja.')
    // The settings card still works when the rewrite fails.
    expect(await buttons(panel)).toEqual(['use-effort', 'discard-effort', 'close'])
    await panel.unmount()
  }
  expect(m.fills).toEqual([])
  expect(m.box).toBe(DRAFT)
})

test('Cancelar while thinking: a late reply is not shown', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  let detach: (value: unknown) => void = () => undefined
  m.reply = () => new Promise(done => (detach = done))

  const band = await $.ui.mount(BAND)
  const pressed = band.press({ key: 'improve' })
  await settle()
  expect(await texts(band)).toContain('Sonnet mejorando el prompt…')
  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await texts(panel)).toContain('Sonnet está reescribiendo tu prompt…')
  await panel.press({ key: 'cancel' })
  expect(m.closed).toEqual(['prompt-improver'])

  detach({ isAnswered: true, text: `<mejorado>${PROPOSAL}</mejorado>`, usage: {} })
  await pressed
  await settle()
  expect(await texts(panel)).toContain('Escribe un prompt y pulsa Mejorar')
  await panel.unmount()
  await band.unmount()
})

test('/mejora improves the given text, or the last draft when given none', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })

  // No draft and no language setting yet: the answer comes in English.
  const empty = await $.command.run({ command: 'mejora', args: '' } as any)
  expect(empty.text).toBe('No prompt to improve: write one or put the text after /mejora.')
  expect(m.calls.length).toBe(0)

  const withText = await $.command.run({ command: 'mejora', args: '  añade tests al módulo de pagos  ' } as any)
  expect(withText.text).toContain('Sonnet está preparando la propuesta')
  await settle()
  expect(m.calls[0]?.prompt).toBe('<prompt>\nañade tests al módulo de pagos\n</prompt>')

  // A draft typed and then replaced by the command line is the one improved.
  await typeDraft($, DRAFT)
  await typeDraft($, '/mejora')
  await $.command.run({ command: 'mejora', args: '' } as any)
  await settle()
  expect(m.calls[1]?.prompt).toBe(`<prompt>\n${DRAFT}\n</prompt>`)
})

test('sending a prompt forgets the proposal and closes the pane; the prompt goes untouched', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  await pressImprove($)

  await $.prompt.submit({ text: DRAFT } as any)
  await settle()
  expect(m.sends[m.sends.length - 1]).toBe(DRAFT)
  expect(m.closed).toEqual(['prompt-improver'])
  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await texts(panel)).toContain('Escribe un prompt y pulsa Mejorar')
  await panel.unmount()
})

test('a proposal that runs long warns, and one that drops your words names them', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  m.reply = () => ({
    isAnswered: true,
    text: `<mejorado>Arregla el login que falla con cuentas recién creadas. ${'Más contexto. '.repeat(15)}</mejorado>`,
    usage: {},
  })
  await pressImprove($)

  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  const readBack = await texts(panel)
  expect(readBack).toContain('Más larga de lo pedido: 39 palabras sin etiquetas; tu texto tenía 8.')
  expect(readBack).toContain('Quitó "usuarios nuevos".')
  await panel.unmount()
})

test('tags are painted in the box while typing, in Spanish and English', WORDS_ONLY, async ($, on) => {
  engine(on)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  const text = 'Fix login [REQUIRED: which error?] and [ESPECIFICAR: ¿qué archivo?]'
  const box = await ($ as any).prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text } as any)
  expect((box as any).text).toBe(text)
  expect((box as any).decorations.map((d: any) => [text.slice(d.start, d.end), d.color])).toEqual([
    ['[REQUIRED: which error?]', 'error'],
    ['[ESPECIFICAR: ¿qué archivo?]', 'warning'],
  ])
  // Without tags the box comes back as the editor left it.
  const clean = await ($ as any).prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: 'Fix login' } as any)
  expect((clean as any).decorations).toBeUndefined()
})

test('when the text stays the same but tags were added, the pane does not call the prompt clear', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  m.reply = () => ({ isAnswered: true, text: `<mejorado>${DRAFT}. [OPCIONAL: ¿qué archivo?]</mejorado>`, usage: {} })
  await pressImprove($)
  const pane = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  const shown = await texts(pane)
  expect(shown).toContain('Cambios: tu texto queda igual; solo añade preguntas.')
  expect(shown).not.toContain('ya estaba claro')
  await pane.unmount()

  m.reply = () => ({ isAnswered: true, text: `<mejorado>${DRAFT}.</mejorado>`, usage: {} })
  await pressImprove($)
  const other = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  expect(await texts(other)).toContain('Cambios: ninguno. Tu prompt ya estaba claro.')
  await other.unmount()
})

test('Usar is drawn in the theme green and Descartar stays neutral', WORDS_ONLY, async ($, on) => {
  const m = engine(on)
  await afterFirst($, m)
  await typeDraft($, DRAFT)
  await pressImprove($)
  const panel = await $.ui.mount({ ...PANEL, surface: 'terminal' })
  const all = await panel.findAll({})
  const at = (key: string) => all.findIndex((x: any) => x.type === 'Button' && x.key === key)
  // The Text right after each Button is its label.
  expect(all[at('use') + 1]?.props?.color).toBe('success')
  expect(all[at('use')]?.text).toBe('Usar')
  expect(all[at('discard') + 1]?.type).not.toBe('Text')
  await panel.unmount()
})

test('/consejo and /mejora are registered in a session an SDK host starts, not only under the REPL', WORDS_ONLY, async ($, on) => {
  // Reason: engine() already answers command.register, and the kit takes one hook per event, so this test stands alone.
  on('config.list', () => ({ value: [] }))
  const registered: string[] = []
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: any) => {
    registered.push(e.name)
    return { value: { command: e.name } }
  })
  // An SDK host, such as the VS Code extension, draws nowhere at start and has no person at a REPL.
  await $.session.start({ cwd: '/', surface: null, isInteractive: false } as any)
  await settle()
  expect(registered.sort()).toEqual(['consejo', 'mejora'])
})
