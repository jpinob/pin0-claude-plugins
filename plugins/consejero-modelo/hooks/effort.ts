// The settings card's decision: one row for the model and one for the effort, each chosen on its own. Pure.
// Reason: each model has its own prompt cache, so a model switch mid-session re-reads the whole conversation
// uncached; on the 5.5 models an effort change keeps the cache (https://code.claude.com/docs/en/prompt-caching,
// read 19 nov 2026). So after the first prompt the model row carries a red warning with the tokens re-read.
import type { Bilingual, CardRow, Classification, Settings } from '../types'
import { advise, displayName, EFFORTS, familyOf } from './classifier'
import type { Rules } from './classifier'
import { inBoth, t } from './i18n'

/** What the last turn left behind, read from the transcript: free evidence, no model call. */
export type TurnEvidence = {
  /** Tool calls the assistant made since the last prompt the person typed. */
  tools: number
  /** Of those, the ones that edited a file. */
  edits: number
  /** Of those, the ones that came back as an error. */
  errors: number
  /** The end of the assistant's last reply, for Haiku to read as context. */
  lastReply: string
  /** The last prompts the person sent, oldest first, each cut short. */
  prompts: string[]
}

export const NO_EVIDENCE: TurnEvidence = { tools: 0, edits: 0, errors: 0, lastReply: '', prompts: [] }

/** The part of a transcript message this file reads, as `$.session.messages()` gives it. */
export type Message = {
  role: 'user' | 'assistant'
  text: string
  toolUses: ReadonlyArray<{ tool: string; isError?: true }>
  toolResults?: ReadonlyArray<{ isError?: boolean }>
}

const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const PROMPTS_KEPT = 5
const PROMPT_CHARS = 300

// Reason: a user message that carries tool results is the loop answering a tool, not a prompt the person typed.
const isTyped = (m: Message): boolean => m.role === 'user' && (m.toolResults ?? []).length === 0 && m.text.trim() !== ''

/** The evidence of the last turn (the messages after the last prompt typed) and the prompts before it. */
export function turnEvidence(messages: readonly Message[], maxChars: number): TurnEvidence {
  let start = messages.length
  while (start > 0 && !isTyped(messages[start - 1]!)) start -= 1
  const turn = messages.slice(start)
  const uses = turn.filter(m => m.role === 'assistant').flatMap(m => m.toolUses)
  const failedResults = turn.flatMap(m => m.toolResults ?? []).filter(r => r.isError === true).length
  const lastReply = [...turn].reverse().find(m => m.role === 'assistant' && m.text.trim() !== '')?.text ?? ''

  return {
    tools: uses.length,
    edits: uses.filter(u => EDIT_TOOLS.has(u.tool)).length,
    errors: Math.max(uses.filter(u => u.isError === true).length, failedResults),
    lastReply: lastReply.trim().slice(-maxChars),
    prompts: messages.filter(isTyped).slice(-PROMPTS_KEPT).map(m => m.text.trim().slice(0, PROMPT_CHARS)),
  }
}

/** Why a lower effort was not proposed. */
export type Hold = 'continues' | 'errors' | 'no-judge'

/** What the card proposes: its rows, each still unchosen, and a line for when there is no row. */
export type CardProposal = { rows: CardRow[]; note: Bilingual }

/** What the card is decided from, beside the classification and the settings. */
export type CardContext = {
  /** True on the first prompt of a conversation: no warning, and the effort may go down freely. */
  isFirst: boolean
  /** Haiku's reading: the draft is a task of its own (true), it follows the task before (false), or no reading. */
  standalone: boolean | null
  evidence: TurnEvidence
  /** Input tokens of the last response: what a model switch would re-read uncached; null when unknown. */
  tokens: number | null
  /** True when the word lists classified, not Haiku: a rule that matched no word says nothing. */
  byWords: boolean
}

/**
 * The card's rows for one draft. Model: whenever the family differs, with the re-read warning after the first
 * prompt. Effort up: as far as the rules ask. Effort down after the first prompt: one level, and only when Haiku
 * read a task of its own and the last turn ended without errors. Reason: a wrong lower is the costly mistake,
 * and a "yes, go on" in the middle of a migration reads as easy.
 */
export function cardRows(c: Classification, settings: Settings, rules: Rules, ctx: CardContext): CardProposal {
  const m = t
  const current = familyOf(settings.model, rules)
  // Reason: in words mode a later "yes" matches no rule, and the default rule would propose a change from nothing.
  if (!ctx.isFirst && ctx.byWords && c.modelRule === 'por-defecto' && c.effortRule === 'por-defecto') {
    return { rows: [], note: inBoth(lang => m(lang).cardNoJudge) }
  }
  const advice = advise(c, settings, rules)
  const reason = advice.reason
  const rows: CardRow[] = []

  const wordsSayNothing = ctx.byWords && c.modelRule === 'por-defecto'
  if (current !== advice.model && !(!ctx.isFirst && wordsSayNothing)) {
    const from = current === null ? settings.model : displayName(current)
    rows.push({
      kind: 'model',
      value: advice.model,
      text: inBoth(lang => m(lang).modelRowText(from, displayName(advice.model), reason[lang])),
      rereadTokens: ctx.isFirst ? null : ctx.tokens,
      choice: null,
    })
  }

  let hold: Hold | null = null
  if (settings.effort !== null) {
    const from = EFFORTS.indexOf(settings.effort)
    const wanted = EFFORTS.indexOf(advice.effort)
    let to = wanted
    if (!ctx.isFirst && wanted < from) {
      hold = ctx.standalone === null ? 'no-judge' : !ctx.standalone ? 'continues' : ctx.evidence.errors > 0 ? 'errors' : null
      to = hold === null ? Math.max(wanted, from - rules.effortLater.maxStepsDown) : from
    }
    if (to !== from) {
      const effort = EFFORTS[to]!
      const isLower = !ctx.isFirst && to < from
      rows.push({
        kind: 'effort',
        value: effort,
        text: inBoth(lang => m(lang).rowEffort(settings.effort!, effort, reason[lang], isLower)),
        rereadTokens: null,
        choice: null,
      })
    }
  }

  if (rows.length > 0) return { rows, note: inBoth(() => '') }
  if (hold !== null) return { rows, note: inBoth(lang => m(lang).cardHold(settings.effort!, m(lang).holds[hold!])) }
  const effort = settings.effort === null ? '' : ` · ${settings.effort}`
  const model = current === null ? settings.model : displayName(current)

  return { rows, note: inBoth(lang => `${m(lang).fineWith(model)}${effort} · ${reason[lang]}`) }
}
