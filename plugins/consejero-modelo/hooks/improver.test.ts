import { expect, test } from 'claude-code/testing'

import rulesData from '../rules'
import type { Rules } from './classifier'
import { compare, isImprovable, tagsOf, readProposal, failureReason, improverRequest, tagSpans, segments } from './improver'

const RULES: Rules = rulesData
const DRAFT = 'arregla el login que falla con usuarios nuevos'

test('every improver instruction carries its source: "mía" or a URL', async () => {
  expect(RULES.improver.instructions.length).toBeGreaterThan(0)
  for (const { text, source } of RULES.improver.instructions) {
    expect(text.length).toBeGreaterThan(0)
    expect(source === 'mía' || source.startsWith('https://')).toBe(true)
  }
  expect(RULES.improver.effortSource.startsWith('https://')).toBe(true)
})

test('the request carries every instruction with its limits, and fences the prompt as data', async () => {
  const { system, prompt } = improverRequest(`  ${DRAFT}  `, RULES)
  for (const { text } of RULES.improver.instructions) expect(system).toContain(`- ${text.split('{')[0]}`)
  // The limits in the text are the numbers of rules.ts, not their names.
  expect(system).not.toContain('{max')
  expect(system).toContain(`como mucho ${RULES.improver.maxTags}`)
  expect(system).toContain(`no pases de ${RULES.improver.maxLengthFactor} veces`)
  expect(system).toContain('[NECESARIO: pregunta]')
  expect(system).toContain('[REQUIRED: question]')
  expect(system).toContain('<mejorado>')
  expect(prompt).toBe(`<prompt>\n${DRAFT}\n</prompt>`)
  const longText = improverRequest('x'.repeat(9000), RULES).prompt
  expect(longText.length).toBe(RULES.improver.maxChars + '<prompt>\n\n</prompt>'.length)
})

test('only a long enough draft that is not a command can be improved', async () => {
  expect(isImprovable(DRAFT, RULES)).toBe(true)
  expect(isImprovable('arregla eso', RULES)).toBe(false)
  expect(isImprovable('   ', RULES)).toBe(false)
  expect(isImprovable('/consejo auditar ahora mismo', RULES)).toBe(false)
})

test('a reply counts only with its tags, no control characters and no overflow', async () => {
  expect(readProposal('<mejorado>\nArregla el login.\n</mejorado>', DRAFT)).toBe('Arregla el login.')
  // Text around the tags, as a model sometimes adds, is dropped.
  expect(readProposal('Aquí tienes:\n<mejorado>Arregla el login.</mejorado>\nSuerte', DRAFT)).toBe('Arregla el login.')
  expect(readProposal('<mejorado>a\r\nb</mejorado>', DRAFT)).toBe('a\nb')
  expect(readProposal('Arregla el login.', DRAFT)).toBeNull()
  expect(readProposal('<mejorado>   </mejorado>', DRAFT)).toBeNull()
  expect(readProposal('</mejorado>al revés<mejorado>', DRAFT)).toBeNull()
  expect(readProposal('<mejorado>con \u001b[31mcolor</mejorado>', DRAFT)).toBeNull()
  // A reply many times the draft has answered the prompt instead of editing it.
  expect(readProposal(`<mejorado>${'función '.repeat(400)}</mejorado>`, DRAFT)).toBeNull()
})

test('tags are read in Spanish and English, with their level and position', async () => {
  const text = 'Arregla [NECESARIO: ¿qué error?] en [SPECIFY:  which file? ] y [OPCIONAL: ¿navegador?] [OPTIONAL:]'
  expect(tagsOf(text)).toEqual([
    { level: 'required', question: '¿qué error?' },
    { level: 'specify', question: 'which file?' },
    { level: 'optional', question: '¿navegador?' },
    { level: 'optional', question: '' },
  ])
  const [first] = tagSpans(text)
  expect(text.slice(first!.start, first!.end)).toBe('[NECESARIO: ¿qué error?]')
  // A bracket that is not one of the six tag words is plain text.
  expect(tagsOf('[HUECO: algo] [nota: otra]')).toEqual([])
  expect(segments('a [REQUIRED: x] b')).toEqual([
    { text: 'a ' },
    { text: '[REQUIRED: x]', level: 'required' },
    { text: ' b' },
  ])
})

test('an identical prompt has no changes, even if case or punctuation differ', async () => {
  const r = compare(DRAFT, 'Arregla el login que falla con usuarios nuevos.', RULES)
  expect(r.added).toBe(0)
  expect(r.dropped).toEqual([])
  expect(r.isRewritten).toBe(false)
  expect(r.isTooLong).toBe(false)
})

test('changes count the added words without tags and list the dropped ones', async () => {
  const proposal = 'Arregla el login que falla con cuentas nuevas. Hecho cuando entren. [NECESARIO: ¿qué error sale?]'
  const r = compare(DRAFT, proposal, RULES)
  expect(r.added).toBe(5)
  expect(r.dropped).toEqual(['usuarios nuevos'])
  expect(r.words).toEqual({ original: 8, proposal: 11 })
  expect(r.isRewritten).toBe(false)
})

test('when almost nothing of the draft survives, it counts as rewritten', async () => {
  const r = compare(DRAFT, 'Corrige la autenticación para cuentas recién creadas y añade un test.', RULES)
  expect(r.isRewritten).toBe(true)
  // A draft too long to compare in time is treated the same way.
  expect(compare('a '.repeat(900), 'b', RULES).isRewritten).toBe(true)
})

test('a proposal longer than allowed is flagged; tags do not count', async () => {
  // 8 words: the cap is the larger of 2 x 8 and 8 + 25, so 33.
  const longOne = `${DRAFT} ${'palabra '.repeat(26)}`
  expect(compare(DRAFT, longOne, RULES).isTooLong).toBe(true)
  const exact = `${DRAFT} ${'palabra '.repeat(25)}`
  expect(compare(DRAFT, exact, RULES).isTooLong).toBe(false)
  const withTags = `${exact} ${'[NECESARIO: una pregunta larga de muchas palabras] '.repeat(3)}`
  expect(compare(DRAFT, withTags, RULES).isTooLong).toBe(false)
})

test('a failed call is explained in a few words', async () => {
  expect(failureReason({ reason: 'aborted' })).toEqual({ es: 'tardó demasiado o se canceló', en: 'took too long or was cancelled' })
  expect(failureReason({ reason: 'api-error', status: 529 }).es).toBe('error de la API 529')
  expect(failureReason({ reason: 'api-error', status: null }).en).toBe('API error')
  expect(failureReason({ reason: 'empty-reply' }).es).toBe('respondió vacío')
})
