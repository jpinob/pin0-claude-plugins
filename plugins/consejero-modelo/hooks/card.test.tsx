// The pane's settings card against a stand-in engine: Haiku with the task memory, Preparar writing /config,
// the band quiet until the next prompt, Deshacer, and the fixed colours in VS Code.
import { expect, test } from 'claude-code/testing'

import { VERSION } from './version'

const TASK = 'Migra la base de datos de MySQL a Postgres sin perder datos'
const YES = 'vale, sigue con eso por favor'
const PROPOSAL = 'Sigue con la migración de MySQL a Postgres. [ESPECIFICAR: ¿qué tablas primero?]'

const BAND = {
  plugin: 'consejero-modelo',
  component: 'AbovePrompt',
  surface: 'terminal',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 10, bodyColumns: 100, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const pane = (surface: 'terminal' | 'vscode') =>
  ({
    plugin: 'consejero-modelo',
    component: 'Pane',
    requestId: 'prompt-improver',
    surface,
    props: { title: 'Prompt mejorado', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  }) as const

type Engine = {
  box: string
  rows: Record<string, string>
  sets: Array<[string, string]>
  haiku: Array<{ system: string; prompt: string }>
  haikuReply: string
  toasts: string[]
  effortRuns: string[]
}

// The hooks here stand for the engine: the session on Sonnet at high, the /config rows, the transcript and the models.
function engine(on: any): Engine {
  const m: Engine = {
    box: '',
    rows: { model: 'sonnet', effortLevel: 'high', theme: 'dark' },
    sets: [],
    haiku: [],
    haikuReply: '{"modelo":"fable-migracion","effort":"ninguna"}',
    toasts: [],
    effortRuns: [],
  }
  on('session.model', () => ({ value: `claude-${m.rows.model}-5-5` }))
  on('config.list', () => ({
    value: Object.entries(m.rows).map(([key, value]) => ({
      key,
      label: key,
      kind: 'enum',
      value,
      options: key === 'model' ? ['haiku', 'sonnet', 'opus', 'fable'] : undefined,
      provider: { kind: 'core' },
      isLocked: false,
    })),
  }))
  on('config.set', (_: unknown, e: any) => {
    m.sets.push([e.key, e.value])
    m.rows[e.key] = e.value
    return { value: e.value }
  })
  on('classic.SessionStart', () => ({}))
  on('classic.Stop', () => ({}))
  // The built-in /effort, beneath the mod's hook: it prints nothing here.
  on('command.run', { command: 'effort' }, (_: unknown, e: any) => {
    m.effortRuns.push(e.args)
    return { text: '' }
  })
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('command.register', (_: unknown, e: any) => ({ value: { command: e.name } }))
  on('prompt.edit', (_: unknown, e: any) => {
    m.box = e.text.slice(0, e.start) + e.inputText + e.text.slice(e.end)
    return { text: m.box, cursor: m.box.length }
  })
  on('prompt.read', () => ({ value: { text: m.box, cursor: m.box.length } }))
  on('prompt.fill', (_: unknown, e: any) => {
    m.box = e.text
    return { isFilled: true }
  })
  on('prompt.submit', (_: unknown, e: any) => ({ text: e.text }))
  on('session.messages', () => ({
    value: [
      { role: 'user', text: TASK, toolUses: [] },
      { role: 'assistant', text: 'Esquema migrado. ¿Sigo con los datos?', toolUses: [{ tool: 'Edit' }] },
    ],
  }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 85000, window: 200000 }, rateLimits: [] } }))
  on('model.complete', (_: unknown, e: any) => {
    if (e.model === 'haiku') {
      m.haiku.push({ system: e.system, prompt: e.prompt })
      return { value: { isAnswered: true, text: m.haikuReply, usage: {} } }
    }
    return { value: { isAnswered: true, text: `<mejorado>${PROPOSAL}</mejorado>`, usage: {} } }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', (_: unknown, e: any) => {
    m.toasts.push(typeof e === 'string' ? e : (e.text ?? JSON.stringify(e)))
    return { value: undefined }
  })

  return m
}

const settle = () => new Promise(done => (globalThis as any).setTimeout(done, 40))
const texts = async (ui: any) => (await ui.findAll({ type: 'Text' })).map((t: any) => t.text).join('\n')
const buttons = async (ui: any) => (await ui.findAll({ type: 'Button' })).map((b: any) => b.key)

async function typeDraft($: any, text: string) {
  await $.prompt.edit({ origin: { kind: 'composer' }, text: '', cursor: 0, start: 0, end: 0, inputText: text })
  await settle()
}

async function bandButtons($: any): Promise<string[]> {
  const band = await $.ui.mount(BAND)
  const keys = await buttons(band)
  await band.unmount()
  return keys
}

async function mejora($: any, text: string) {
  await $.command.run({ command: 'mejora', args: text } as any)
  await settle()
}

// The first prompt: the migration, sent as typed. Haiku reads it with no context and it becomes the task.
async function firstTask($: any, m: Engine) {
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await mejora($, TASK)
  await $.prompt.submit({ text: TASK } as any)
  await settle()
  m.haiku.length = 0
}

test('a "yes" after the first prompt keeps its task: Haiku reads the memory, the model row warns in red', async ($, on) => {
  const m = engine(on)
  await firstTask($, m)
  // Haiku says the draft only follows the task, and that the task is a migration.
  m.haikuReply = '{"modelo":"fable-migracion","effort":"low-rapido","sola":false}'
  await mejora($, YES)

  expect(m.haiku.length).toBe(1)
  expect(m.haiku[0]?.prompt).toContain(`Tarea en curso: ${TASK}`)
  expect(m.haiku[0]?.prompt).toContain('1 ediciones de archivos, 0 errores')
  expect(m.haiku[0]?.prompt).toContain('¿Sigo con los datos?')
  const ui = await $.ui.mount(pane('terminal'))
  const shown = await texts(ui)
  expect(shown).toContain('Modelo y effort')
  expect(shown).toContain('Modelo: Sonnet → Fable · migración')
  expect(shown).toContain('El modelo nuevo relee 85.000 tokens sin caché y sale más caro.')
  // The effort is not lowered for a "yes": there is no effort row.
  expect(await buttons(ui)).toEqual(['use', 'discard', 'use-model', 'discard-model', 'close'])
  const all = await ui.findAll({ type: 'Text' })
  expect(all.find((x: any) => String(x.text).startsWith('Aviso: cambiar de modelo'))?.props?.color).toBe('error')
  await ui.unmount()
})

test('Preparar writes the picked row, puts the proposal in the box, and the band is quiet until the next send', async ($, on) => {
  const m = engine(on)
  await firstTask($, m)
  m.haikuReply = '{"modelo":"ninguna","effort":"max-sin-supervision","sola":true}'
  await typeDraft($, YES)
  expect(await bandButtons($)).toContain('improve')
  await mejora($, YES)

  const ui = await $.ui.mount(pane('terminal'))
  expect(await texts(ui)).toContain('Effort: high → max')
  await ui.press({ key: 'use' })
  await ui.press({ key: 'use-effort' })
  // The model row (Sonnet → Opus, the default rule) is discarded: only the effort is written.
  await ui.press({ key: 'discard-model' })
  await ui.press({ key: 'prepare' })
  expect(m.sets).toEqual([['effortLevel', 'max']])
  expect(m.box).toBe(PROPOSAL)
  expect(await buttons(ui)).toEqual(['undo', 'close'])
  // The pane keeps what was applied: a toast goes in seconds and VS Code shows the model nowhere.
  expect(await texts(ui)).toContain('Aplicado: prompt en la caja, effort max. Descartado: modelo.')

  // The band says nothing, not even Mejorar, while the prepared prompt waits.
  expect(await bandButtons($)).toEqual([])

  // Deshacer puts back the box and the effort row, and the band speaks again.
  await ui.press({ key: 'undo' })
  expect(m.box).toBe(YES)
  expect(m.sets).toEqual([['effortLevel', 'max'], ['effortLevel', 'high']])
  expect(await bandButtons($)).toContain('improve')

  // Prepared again, then sent: the quiet ends with the send, and the next draft gets Mejorar.
  await ui.press({ key: 'prepare' })
  expect(await bandButtons($)).toEqual([])
  await ui.unmount()
  await $.prompt.submit({ text: PROPOSAL } as any)
  await settle()
  await typeDraft($, 'añade tests al módulo de pagos')
  expect(await bandButtons($)).toContain('improve')
})

test('a /clear forgets the task, so a "yes" in the new conversation has no task to lean on', async ($, on) => {
  const m = engine(on)
  await firstTask($, m)
  await $.classic.SessionStart({ source: 'clear', cwd: '/' })
  await $.prompt.submit({ text: 'Resume este documento en cinco puntos' } as any)
  await settle()
  m.haiku.length = 0
  m.haikuReply = '{"modelo":"ninguna","effort":"ninguna","sola":false}'
  await mejora($, YES)
  expect(m.haiku[0]?.prompt).toContain('Tarea en curso: ninguna guardada')
})

test('in VS Code the pane paints with fixed colours: the theme keys do not show there', async ($, on) => {
  const m = engine(on)
  await firstTask($, m)
  m.haikuReply = '{"modelo":"fable-migracion","effort":"ninguna","sola":true}'
  await mejora($, YES)
  const ui = await $.ui.mount(pane('vscode'))
  const all = await ui.findAll({})
  const at = (key: string) => all.findIndex((x: any) => x.type === 'Button' && x.key === key)
  // The signature's dark set: green for Usar, red for the warning, yellow for a tag to specify.
  expect(all[at('use') + 1]?.props?.color).toBe('#6FCF3A')
  const textOf = (start: string) => all.find((x: any) => x.type === 'Text' && String(x.text).startsWith(start))
  expect(textOf('Aviso: cambiar de modelo')?.props?.color).toBe('#ff6b7d')
  expect(textOf('[ESPECIFICAR')?.props?.color).toBe('#FCEE22')
  await ui.unmount()

  // The terminal keeps the theme keys.
  const term = await $.ui.mount(pane('terminal'))
  const tall = await term.findAll({})
  expect(tall[tall.findIndex((x: any) => x.type === 'Button' && x.key === 'use') + 1]?.props?.color).toBe('success')
  await term.unmount()
})

test('the effort comes from /effort and from the end of each turn when /config has no effort row value', async ($, on) => {
  const m = engine(on)
  // As seen by Javi in VS Code and the terminal: the /config row holds no level. With nothing else, Sonnet 5.5
  // runs at its own default, medium, which rules.ts names.
  delete (m.rows as Record<string, string>).effortLevel
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await mejora($, TASK)
  let ui = await $.ui.mount(pane('terminal'))
  expect(await texts(ui)).toContain('Effort: medium → high · migración: antes de Fable, sube el effort')
  await ui.unmount()

  // `/effort xhigh` typed: the card now compares against it (the migration's rule asks for medium).
  await $.command.run({ command: 'effort', args: 'xhigh' } as any)
  await mejora($, TASK)
  ui = await $.ui.mount(pane('terminal'))
  expect(await texts(ui)).toContain('Effort: xhigh → medium')
  await ui.unmount()

  // A turn ends at low: that is the effort the next card starts from. The session is on Sonnet and the rules
  // want Opus, so the effort-first step raises one level instead of switching the model.
  await $.prompt.submit({ text: TASK } as any)
  await ($ as any).classic.Stop({ session_id: 's', transcript_path: '/t', cwd: '/', hook_event_name: 'Stop', stop_hook_active: false, effort: { level: 'low' } })
  await settle()
  m.haikuReply = '{"modelo":"ninguna","effort":"max-sin-supervision","sola":false}'
  await mejora($, YES)
  ui = await $.ui.mount(pane('terminal'))
  expect(await texts(ui)).toContain('Effort: low → medium · sin regla clara: antes de Opus, sube el effort')
  await ui.unmount()
})

test('the pane shows the version of the copy that runs, and /consejo says where the effort came from', async ($, on) => {
  const m = engine(on)
  delete (m.rows as Record<string, string>).effortLevel
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true } as any)
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  const before = await $.command.run({ command: 'consejo', args: '' } as any)
  // No draft yet and no language setting: English, and the line comes after the report.
  expect(before.text).toBe("No advice yet in this session.\nEffort the mod knows: medium (the model's own default).")

  await mejora($, TASK)
  const ui = await $.ui.mount(pane('terminal'))
  const shown = await texts(ui)
  expect(shown).toContain(`consejero-modelo v${VERSION}`)
  // The signature stays the pane's last line, after the version.
  expect(shown.indexOf(`consejero-modelo v${VERSION}`)).toBeLessThan(shown.indexOf('made with'))
  await ui.unmount()

  await $.command.run({ command: 'effort', args: 'high' } as any)
  const after = await $.command.run({ command: 'consejo', args: '' } as any)
  expect(after.text).toContain('Effort que conoce el mod: high (de /effort).')
})

test('with no effort row in /config, Preparar runs /effort, and Deshacer clears it back to the model default', async ($, on) => {
  const m = engine(on)
  // As in Javi's Claude Code: /config lists no effort row, so writing it there fails.
  delete (m.rows as Record<string, string>).effortLevel
  await $.classic.SessionStart({ source: 'startup', cwd: '/' })
  await mejora($, TASK)
  const ui = await $.ui.mount(pane('terminal'))
  expect(await texts(ui)).toContain('Effort: medium → high')
  await ui.press({ key: 'discard' })
  await ui.press({ key: 'use-effort' })
  await ui.press({ key: 'prepare' })
  expect(m.effortRuns).toEqual(['high'])
  expect(m.sets).toEqual([])
  expect(await texts(ui)).toContain('Aplicado: effort high.')
  // The effort was the model's own default: Deshacer clears the saved level with /effort auto.
  await ui.press({ key: 'undo' })
  expect(m.effortRuns).toEqual(['high', 'auto'])
  await ui.unmount()
})
