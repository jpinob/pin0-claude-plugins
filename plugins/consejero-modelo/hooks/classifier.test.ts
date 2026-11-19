import { expect, test } from 'claude-code/testing'

import rulesData from '../rules'
import { findRow, effortValue, modelValue } from './apply'
import { advise, matchesWord, classify, differs, effortOf, familyOf, report, line, normalize, assess } from './classifier'
import type { Rules } from './classifier'
import type { Model, Settings } from '../types'

const RULES: Rules = rulesData

// Three prompts per model, written the way they are typed day to day.
const EXAMPLES: ReadonlyArray<[string, Model, string]> = [
  ['Clasifica estos tickets por prioridad', 'haiku', 'haiku-clasificar'],
  ['Etiqueta cada issue con su área', 'haiku', 'haiku-clasificar'],
  ['Lee estos logs y dime qué servicio aparece más', 'haiku', 'haiku-clasificar'],
  ['Redacta un email para el cliente con el resumen de la reunión', 'sonnet', 'sonnet-documentos'],
  ['Resume este documento en cinco puntos', 'sonnet', 'sonnet-documentos'],
  ['Traduce este README al inglés', 'sonnet', 'sonnet-documentos'],
  ['Implementa el endpoint de login con sus tests', 'opus', 'opus-codigo'],
  ['Arregla el bug del carrito: el total sale negativo', 'opus', 'opus-depurar'],
  ['Haz clic en el botón de exportar y dame una captura de pantalla', 'opus', 'opus-computer-use'],
  ['Diseña la arquitectura para separar el monolito en servicios', 'fable', 'fable-arquitectura'],
  ['Migra la base de datos de MySQL a Postgres sin parar el servicio', 'fable', 'fable-migracion'],
  ['Investiga a fondo qué opciones hay para sincronizar offline', 'fable', 'fable-investigacion'],
  // The same twelve tasks in English: the word lists carry both languages.
  ['Classify these tickets by priority', 'haiku', 'haiku-clasificar'],
  ['Label each issue with its area', 'haiku', 'haiku-clasificar'],
  ['Read these logs and tell me which service shows up most', 'haiku', 'haiku-clasificar'],
  ['Write an email to the client summarizing the meeting', 'sonnet', 'sonnet-documentos'],
  ['Summarize this document in five points', 'sonnet', 'sonnet-documentos'],
  ['Translate this README into Spanish', 'sonnet', 'sonnet-documentos'],
  ['Implement the login endpoint with its tests', 'opus', 'opus-codigo'],
  ['Fix the cart bug: the total comes out negative', 'opus', 'opus-depurar'],
  ['Click the export button and give me a screenshot', 'opus', 'opus-computer-use'],
  ['Design the architecture to split the monolith into services', 'fable', 'fable-arquitectura'],
  ['Migrate the database from MySQL to Postgres without downtime', 'fable', 'fable-migracion'],
  ['Research in depth the options for offline sync', 'fable', 'fable-investigacion'],
]

for (const [prompt, model, rule] of EXAMPLES) {
  test(`${model}: ${prompt}`, async () => {
    const c = classify(prompt, RULES)
    expect(c?.model).toBe(model)
    expect(c?.modelRule).toBe(rule)
  })
}

test('with no clear rule it goes to Opus, with the source of the default rule', async () => {
  const c = classify('Hola, ¿qué tal vas hoy con todo esto?', RULES)
  expect(c?.model).toBe('opus')
  expect(c?.modelRule).toBe('por-defecto')
  expect(c?.modelSource).toEqual({ es: 'mía', en: 'mía' })
  expect(c?.effort).toBe('medium')
})

test('a draw between families is doubt, and doubt goes to Opus', async () => {
  // "investiga" pide Fable y "falla" pide Opus: una palabra cada una.
  const c = classify('Investiga por qué falla el login', RULES)
  expect(c?.model).toBe('opus')
  expect(c?.modelRule).toBe('por-defecto')
  expect(c?.reason).toEqual({ es: 'duda entre Opus y Fable', en: 'torn between Opus and Fable' })
})

test('short text and slash commands are not classified', async () => {
  expect(classify('migra', RULES)).toBeNull()
  expect(classify('/cambio migra la base de datos entera', RULES)).toBeNull()
  expect(classify('               ', RULES)).toBeNull()
})

test('the effort comes from the docs rules and carries its source', async () => {
  const bug = classify('Arregla el bug del carrito: el total sale negativo', RULES)
  expect(bug?.effort).toBe('high')
  expect(bug?.effortRule).toBe('high-verificar')
  expect(bug?.effortSource).toBe('https://code.claude.com/docs/en/model-config')
  expect(classify('Renombra la variable total a totalCarrito', RULES)?.effort).toBe('low')
  expect(classify('Busca vulnerabilidades en el módulo de pagos', RULES)?.effort).toBe('max')
  expect(classify('Resume este documento en cinco puntos', RULES)?.effort).toBe('medium')
})

test('every rule carries its source: "mía" or a URL', async () => {
  const sources = [
    RULES.defaultModel.source,
    RULES.defaultEffort.source,
    RULES.effortStep.source,
    ...RULES.models.map(r => r.source),
    ...RULES.efforts.map(r => r.source),
  ]
  for (const source of sources) expect(source === 'mía' || source.startsWith('https://')).toBe(true)
  const cited = [...RULES.models, ...RULES.efforts].flatMap(r => r.conflicts).concat(RULES.effortStep.conflicts)
  for (const id of cited) {
    expect(typeof RULES.conflicts[id]?.es).toBe('string')
    expect(typeof RULES.conflicts[id]?.en).toBe('string')
  }
})

test('words: accents ignored, prefix with *, whole word without it', async () => {
  expect(normalize('Migración')).toBe('migracion')
  expect(matchesWord('migra*', normalize('hay que migrarlo todo'))).toBe(true)
  expect(matchesWord('log', normalize('el login no va'))).toBe(false)
  expect(matchesWord('log', normalize('mira el log.'))).toBe(true)
  expect(matchesWord('causa raiz', normalize('busca la causa raíz'))).toBe(true)
  expect(matchesWord('*', 'cualquier cosa')).toBe(false)
})

test('the current model and effort are read from real ids and values', async () => {
  expect(familyOf('claude-opus-5-5[1m]', RULES)).toBe('opus')
  expect(familyOf('claude-fable-5-2', RULES)).toBe('fable')
  expect(familyOf('arn:aws:bedrock:eu:1:model/x', RULES)).toBeNull()
  expect(effortOf('High')).toBe('high')
  expect(effortOf('auto')).toBeNull()
  expect(effortOf(undefined)).toBeNull()
})

const FABLE = 'Diseña la arquitectura para separar el monolito en servicios'
const settingsOf = (model: string, effort: Settings['effort']): Settings => ({ model, effort })

test('before a bigger model it proposes more effort, up to the ceiling', async () => {
  const c = classify(FABLE, RULES)!
  const effortStep = advise(c, settingsOf('claude-opus-5-5', 'medium'), RULES)
  expect(effortStep).toEqual({
    model: 'opus',
    effort: 'high',
    reason: { es: 'arquitectura: antes de Fable, sube el effort', en: 'architecture: before Fable, raise the effort' },
    isStep: true,
  })
  // With the effort already at the ceiling, the model goes up.
  expect(advise(c, settingsOf('claude-opus-5-5', 'high'), RULES)).toEqual({
    model: 'fable',
    effort: 'medium',
    reason: { es: 'arquitectura', en: 'architecture' },
    isStep: false,
  })
  // With no readable effort or an unknown model there is no step.
  expect(advise(c, settingsOf('claude-opus-5-5', null), RULES).model).toBe('fable')
  expect(advise(c, settingsOf('arn:aws:bedrock:x', 'low'), RULES).model).toBe('fable')
  // Towards a smaller model there is no step.
  const haiku = classify('Clasifica estos tickets por prioridad', RULES)!
  expect(advise(haiku, settingsOf('claude-opus-5-5', 'low'), RULES).model).toBe('haiku')
})

test('shown only when it differs from the current settings', async () => {
  const same = assess('Implementa el endpoint de login con sus tests', settingsOf('claude-opus-5-5', 'medium'), RULES)
  expect(same?.isShown).toBe(false)
  const otherEffort = assess('Implementa el endpoint de login con sus tests', settingsOf('claude-opus-5-5', 'high'), RULES)
  expect(otherEffort?.isShown).toBe(true)
  const otherModel = assess('Implementa el endpoint de login con sus tests', settingsOf('claude-sonnet-5-5', 'medium'), RULES)
  expect(otherModel?.isShown).toBe(true)
  // With no readable effort only the model is compared.
  expect(differs({ model: 'opus', effort: 'high', reason: { es: '', en: '' }, isStep: false }, settingsOf('opus', null), RULES)).toBe(false)
})

test('the line and the /consejo report carry rule, source and conflicts', async () => {
  const r = assess(FABLE, settingsOf('claude-opus-5-5', 'medium'), RULES)!
  expect(line(r.advice, 'es')).toBe('Opus · high · arquitectura: antes de Fable, sube el effort')
  expect(line(r.advice, 'en')).toBe('Opus · high · architecture: before Fable, raise the effort')
  const text = report(r, RULES, 'es')
  expect(text).toContain('Tienes puesto: claude-opus-5-5 · medium')
  expect(text).toContain('Regla de modelo: fable-arquitectura (Fable). Fuente: mía')
  expect(text).toContain('Regla de effort: por-defecto (medium). Fuente: https://code.claude.com/docs/en/model-config')
  expect(text).toContain('Regla aplicada: effort antes que modelo. Fuente: mía')
  expect(text).toContain('Choque C3:')
  expect(report(null, RULES, 'es')).toBe('Todavía no hay ninguna sugerencia en esta sesión.')
  const english = report(r, RULES, 'en')
  expect(english).toContain('You have: claude-opus-5-5 · medium')
  expect(english).toContain('Model rule: fable-arquitectura (Fable). Source: mía')
  expect(english).toContain('Rule applied: effort before model. Source: mía')
  expect(english).toContain('Conflict C3: The blog')
  expect(report(null, RULES, 'en')).toBe('No advice yet in this session.')
})

test('Aplicar finds the /config rows and writes a value the row accepts', async () => {
  const rows = [
    { key: 'theme', value: 'dark' },
    { key: 'modelEffort', value: 'high', options: ['Low', 'Medium', 'High'] },
    { key: 'model', value: 'opus', options: ['default', 'opus[1m]', 'opus', 'claude-fable-5-2'] },
  ]
  expect(findRow(rows, 'model')?.key).toBe('model')
  expect(findRow(rows, 'effort')?.key).toBe('modelEffort')
  expect(findRow([{ key: 'theme', value: 'dark' }], 'model')).toBeUndefined()
  const model = findRow(rows, 'model')!
  // The alias itself when the row lists it; else the option that names the family; else the alias.
  expect(modelValue(model, 'opus')).toBe('opus')
  expect(modelValue(model, 'fable')).toBe('claude-fable-5-2')
  expect(modelValue(model, 'haiku')).toBe('haiku')
  expect(effortValue(findRow(rows, 'effort')!, 'medium')).toBe('Medium')
  expect(effortValue({ key: 'effortLevel', value: 'low' }, 'xhigh')).toBe('xhigh')
})

test('a new family is added in rules.ts, without touching code', async () => {
  // A family the code has never heard of, bigger than all the others, with one rule of its own.
  const rules: Rules = {
    ...RULES,
    families: [...RULES.families, 'nova'],
    models: [
      ...RULES.models,
      {
        id: 'nova-ciencia',
        model: 'nova',
        reason: { es: 'ciencia', en: 'science' },
        words: ['teorema*', 'demostra*'],
        source: 'mía',
        conflicts: [],
      },
    ],
  }
  const c = classify('Demuestra este teorema paso a paso', rules)!
  expect(c.model).toBe('nova')
  expect(familyOf('claude-nova-1-0', rules)).toBe('nova')
  expect(familyOf('claude-nova-1-0', RULES)).toBeNull()
  // It sits above Fable, so from Fable the effort-first step applies, and from itself nothing changes.
  expect(advise(c, settingsOf('claude-fable-5-2', 'medium'), rules)).toEqual({
    model: 'fable',
    effort: 'high',
    reason: { es: 'ciencia: antes de Nova, sube el effort', en: 'science: before Nova, raise the effort' },
    isStep: true,
  })
  expect(assess('Demuestra este teorema paso a paso', settingsOf('claude-nova-1-0', 'medium'), rules)?.isShown).toBe(false)
  expect(line(advise(c, settingsOf('claude-fable-5-2', 'high'), rules), 'es')).toBe('Nova · medium · ciencia')
})
