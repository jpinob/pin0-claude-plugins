// The prompt improver: what the model is asked, how its answer is read and what changed. Pure; the calls are in panel.tsx.
import type { Bilingual, Lang, Tag, Level } from '../types'
import { inBoth, t } from './i18n'
import type { Rules } from './classifier'

const OPEN_TAG = '<mejorado>'
const CLOSE_TAG = '</mejorado>'

/** Whether a draft is worth improving: long enough, and not a slash command. */
export function isImprovable(text: string, rules: Rules): boolean {
  const trimmed = text.trim()

  return trimmed.length >= rules.minChars && !trimmed.startsWith('/')
}

/** An instruction with each `{name}` replaced by that limit of `improver`, so the text and the check share one number. */
function fillLimits(text: string, rules: Rules): string {
  const limits: Record<string, number> = {
    maxTags: rules.improver.maxTags,
    maxLengthFactor: rules.improver.maxLengthFactor,
    minExtraWords: rules.improver.minExtraWords,
  }

  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in limits ? String(limits[name]) : match))
}

/**
 * The request for one draft: the instructions of rules.ts, then the draft fenced as data.
 * Reason: the draft can hold instructions of its own, and the model is there to edit it, not to obey it.
 */
export function improverRequest(text: string, rules: Rules): { system: string; prompt: string } {
  const system = [
    'Editas el prompt que una persona va a enviar a un asistente de programación, para que funcione mejor.',
    '',
    'Reglas:',
    ...rules.improver.instructions.map(i => `- ${fillLimits(i.text, rules)}`),
    '',
    `Responde solo con el prompt reescrito entre ${OPEN_TAG} y ${CLOSE_TAG}, sin nada más.`,
  ].join('\n')

  return { system, prompt: `<prompt>\n${text.trim().slice(0, rules.improver.maxChars)}\n</prompt>` }
}

// Reason: the proposal goes into the person's prompt box, so control characters other than tab and newline are refused.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F]/

/**
 * The rewritten prompt from the model's reply, or null when the reply is not one: no tags, empty,
 * control characters, or far longer than the draft. The model's output is untrusted input.
 */
export function readProposal(reply: string, original: string): string | null {
  const from = reply.indexOf(OPEN_TAG)
  const to = reply.lastIndexOf(CLOSE_TAG)
  if (from < 0 || to <= from) return null
  const text = reply.slice(from + OPEN_TAG.length, to).replace(/\r\n?/g, '\n').trim()
  if (text === '' || CONTROL.test(text)) return null
  // Reason: a reply many times the draft's size has answered the prompt instead of editing it.
  if (text.length > original.trim().length * 4 + 1500) return null

  return text
}

// The tag words, Spanish and English, by level.
const LEVELS: Record<string, Level> = {
  NECESARIO: 'required',
  REQUIRED: 'required',
  ESPECIFICAR: 'specify',
  SPECIFY: 'specify',
  OPCIONAL: 'optional',
  OPTIONAL: 'optional',
}

const TAG_PATTERN = /\[(NECESARIO|REQUIRED|ESPECIFICAR|SPECIFY|OPCIONAL|OPTIONAL):\s*([^\]]*?)\s*\]/g

/** Each tag in a text with where it sits, so it can be painted. An empty question is still a tag. */
export function tagSpans(text: string): Array<Tag & { start: number; end: number }> {
  return [...text.matchAll(TAG_PATTERN)].map(m => ({
    level: LEVELS[m[1] ?? ''] ?? 'required',
    question: m[2] ?? '',
    start: m.index,
    end: m.index + m[0].length,
  }))
}

/** The tags a proposal left, in order, without their positions. */
export const tagsOf = (text: string): Tag[] => tagSpans(text).map(({ level, question }) => ({ level, question }))

/** The text cut into plain runs and tag runs, in order, for drawing. */
export function segments(text: string): Array<{ text: string; level?: Level }> {
  const out: Array<{ text: string; level?: Level }> = []
  let from = 0
  for (const t of tagSpans(text)) {
    if (t.start > from) out.push({ text: text.slice(from, t.start) })
    out.push({ text: text.slice(t.start, t.end), level: t.level })
    from = t.end
  }
  if (from < text.length) out.push({ text: text.slice(from) })

  return out
}

// Reason: past this many words a side, the comparison table grows too large for a hook's time budget.
const MAX_WORDS = 800

const words = (text: string): string[] => text.split(/\s+/).filter(p => p !== '')

// Reason: "Arregla" for "arregla" or "nuevos." for "nuevos" is no change worth reading.
const wordKey = (word: string): string => word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')

export type Comparison = {
  added: number
  dropped: string[]
  isRewritten: boolean
  isTooLong: boolean
  words: { original: number; proposal: number }
}

/**
 * What the proposal, tags left out, added to and dropped from the draft, from a longest common
 * subsequence of their words. Reason: this is the mod's own reading of both texts, so it cannot
 * hide a dropped word the way a model's summary of its own edit could.
 */
export function compare(original: string, proposal: string, rules: Rules): Comparison {
  const a = words(original)
  const b = words(proposal.replace(TAG_PATTERN, ' '))
  const { maxLengthFactor, minExtraWords, rewriteThreshold } = rules.improver
  const cap = Math.max(a.length * maxLengthFactor, a.length + minExtraWords)
  const base = { words: { original: a.length, proposal: b.length }, isTooLong: b.length > cap }
  if (a.length > MAX_WORDS || b.length > MAX_WORDS) return { ...base, added: b.length, dropped: [], isRewritten: true }

  const ka = a.map(wordKey)
  const kb = b.map(wordKey)
  // largo[i][j]: the longest common run of a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i]![j] = ka[i] === kb[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!)
    }
  }

  const dropped: string[] = []
  let inRun = false
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && ka[i] === kb[j]) {
      inRun = false
      i++
      j++
    } else if (j < b.length && (i >= a.length || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) {
      j++
    } else {
      // Consecutive dropped words make one run; a kept word in between starts another.
      if (inRun) dropped[dropped.length - 1] += ` ${a[i]!}`
      else dropped.push(a[i]!)
      inRun = true
      i++
    }
  }

  const common = lcs[0]![0]!

  return {
    ...base,
    added: b.length - common,
    dropped,
    isRewritten: a.length > 0 && common / a.length < rewriteThreshold,
  }
}

/** The model's alias as a name for the person: `sonnet` is Sonnet. */
export const modelName = (alias: string, lang: Lang): string =>
  alias === '' ? t(lang).someModel : alias[0]!.toUpperCase() + alias.slice(1)

/** A failed call as a few words for the pane, in both languages. */
export function failureReason(r: { reason?: string; status?: number | null }): Bilingual {
  // Reason: a call past its timeoutMs comes back aborted, as a cancelled one does.
  if (r.reason === 'aborted') return inBoth(lang => t(lang).failTimeout)
  if (r.reason === 'empty-reply') return inBoth(lang => t(lang).failEmpty)
  if (r.reason === 'api-error') return inBoth(lang => t(lang).failApi(r.status))

  return inBoth(lang => (r.reason === undefined ? t(lang).failOther : r.reason))
}
