// The pane's settings card: Haiku's model and effort for the draft the improver rewrites, one row each,
// and the /config writes Preparar makes. The rows are decided in effort.ts; this file talks to the engine.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderElement, RenderInput } from 'claude-code'

import rulesData from '../rules'
import type { CardRow, Choice, Classification, Effort, Lang, Settings, SettingsCard } from '../types'
import { findRow, effortValue, modelValue } from './apply'
import { classify, displayName, effortOf } from './classifier'
import type { Rules } from './classifier'
import { cardRows, effortFromSettings, NO_EVIDENCE, turnEvidence } from './effort'
import type { EffortSource, Message, TurnEvidence } from './effort'
import { haikuRequest, haikuTaskRequest, readHaikuReply, readStandalone } from './haiku'
import { FALLBACK, t } from './i18n'
import { paneColors } from './palette'

const RULES: Rules = rulesData

export const HIDDEN: SettingsCard = { step: 'hidden', rows: [], note: { es: '', en: '' }, effortNote: { es: '', en: '' }, isFirst: false }
// Reason: the shape tag declines a card an older version stored in another form.
export const CARD_SHAPE = 'card-2'
const card = atom({ plugin: 'consejero-modelo', key: 'card' } as const, HIDDEN, { shape: CARD_SHAPE })
const lang = atom({ plugin: 'consejero-modelo', key: 'lang' } as const, FALLBACK as Lang)
const theme = atom({ plugin: 'consejero-modelo', key: 'theme' } as const, '')

// Reason: each card is stamped, so a late Haiku answer after Descartar, a send or a newer Mejorar is dropped.
let stamp = 0
let controller = new AbortController()
// The task memory: the last draft Haiku read as a task of its own, so a run of "yes" keeps its task.
let task: string | null = null

// The session's effort as the mod last learned it: a `/effort <level>` typed, a /config write, or the level the
// engine reports at the end of each turn. Reason: the engine has no call for the session's effort, and `/effort`
// does not show in the /config row (seen by Javi on 0.8.2, in VS Code and in the terminal).
let knownEffort: Effort | null = null
let effortSource: EffortSource | null = null

/** Learns the session's effort from any of its sources; `auto` forgets it, anything else is ignored. */
export function noteEffort(value: unknown, source: EffortSource) {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'auto') {
    knownEffort = null
    effortSource = null
    return
  }
  const level = effortOf(typeof value === 'string' ? value.trim() : value)
  if (level === null) return
  knownEffort = level
  effortSource = source
}

// Reason: a read that fails (no settings, no variable) is no reading, never an error in the pane.
async function quiet<T>(work: Promise<T>): Promise<T | undefined> {
  try {
    return await work
  } catch {
    return undefined
  }
}

/**
 * The session's effort and where it came from, in Claude Code's own order: the environment variable; what this
 * session showed (a turn's end, a typed /effort, a /config write); the level saved for the model; a top-level
 * effortLevel; the /config row; the model's own default. Null when none gives one.
 * Source: https://code.claude.com/docs/en/model-config, "Claude Code resolves the session's effort level".
 */
export async function readEffort($: EngineInterface, model: string): Promise<{ effort: Effort | null; source: EffortSource | null }> {
  const fromEnv = effortOf(await quiet($.env.get('CLAUDE_CODE_EFFORT_LEVEL')))
  if (fromEnv !== null) return { effort: fromEnv, source: 'env' }
  if (knownEffort !== null) return { effort: knownEffort, source: effortSource }
  const [modelSettings, effortLevel, rows] = await Promise.all([
    quiet($.settings.read({ key: 'modelSettings' })),
    quiet($.settings.read({ key: 'effortLevel' })),
    quiet($.config.list()),
  ])
  const saved = effortFromSettings(model, modelSettings, effortLevel, RULES)
  if (saved !== null && saved.source !== 'default') return saved
  const row = effortOf((rows ?? []).find(f => /effort/i.test(f.key))?.value)
  if (row !== null) return { effort: row, source: 'row' }

  return saved ?? { effort: null, source: null }
}

/** The model and the effort, as readEffort finds it. */
export async function readSettings($: EngineInterface): Promise<Settings> {
  const model = await $.session.model()
  return { model, effort: (await readEffort($, model)).effort }
}

// One /config row written as the person would in the menu; the engine's refusal comes back as text.
export async function writeRow($: EngineInterface, key: string, value: string, language: Lang): Promise<string | null> {
  try {
    const r = await $.config.set({ key, value })
    return r.deny ?? null
  } catch {
    return t(language).menuRefused
  }
}

/** A fresh load knows nothing yet: no task and no effort. Reason: module values outlive a test, not a reload. */
export function startOver() {
  task = null
  knownEffort = null
  effortSource = null
}

/** A new conversation keeps no task from the one before. */
export function forgetTask() {
  task = null
}

/** The card goes: a call in flight is cut, and its answer is not shown. */
export async function resetCard($: EngineInterface) {
  stamp += 1
  controller.abort()
  await update($, card, before => (before.step === 'hidden' ? before : HIDDEN))
}

/** What the card is started from: where the conversation is, and what the band already knows. */
export type CardStart = {
  isFirst: boolean
  useHaiku: boolean
  isOff: boolean
  /** Haiku's classification of this very draft from the band's own call, so it is not asked twice. */
  known: Classification | null
}

async function evidenceNow($: EngineInterface): Promise<{ evidence: TurnEvidence; tokens: number | null }> {
  try {
    const [messages, usage] = await Promise.all([$.session.messages({ last: 60 }), $.session.usage()])
    const evidence = 'deny' in messages ? NO_EVIDENCE : turnEvidence(messages as readonly Message[], RULES.effortLater.contextChars)
    return { evidence, tokens: usage.context.tokens ?? null }
  } catch {
    return { evidence: NO_EVIDENCE, tokens: null }
  }
}

/** Haiku's reading of a draft: the classification and, after the first prompt, whether it is a task of its own. */
async function askHaiku(
  $: EngineInterface,
  text: string,
  evidence: TurnEvidence | null,
): Promise<{ classification: Classification; standalone: boolean | null } | null> {
  const { system, prompt } =
    evidence === null
      ? haikuRequest(text, RULES)
      : haikuTaskRequest(text, RULES, {
          task,
          prompts: evidence.prompts,
          lastReply: evidence.lastReply,
          summary: `Último turno del asistente: ${evidence.tools} herramientas, ${evidence.edits} ediciones de archivos, ${evidence.errors} errores.`,
        })
  const r = await $.model.complete(
    { model: 'haiku', system, prompt, maxTokens: 400, effort: 'low', timeoutMs: RULES.haiku.timeoutMs },
    { signal: controller.signal },
  )
  if (!r.isAnswered) return null
  const classification = readHaikuReply(r.text, RULES)
  if (classification === null) return null

  return { classification, standalone: evidence === null ? true : readStandalone(r.text) }
}

/**
 * Fills the card for `text`. First prompt: the band's Haiku answer when it has one, else one call.
 * After it: one Haiku call with the task memory and the last turn's evidence; in words mode, the words alone.
 */
export async function startCard($: EngineInterface, text: string, start: CardStart) {
  const mine = ++stamp
  controller.abort()
  controller = new AbortController()
  if (start.isOff) {
    await update($, card, () => HIDDEN)
    return
  }
  await update($, card, () => ({ ...HIDDEN, step: 'looking' as const, isFirst: start.isFirst }))
  const settings = await readSettings($)
  const { evidence, tokens } = start.isFirst ? { evidence: NO_EVIDENCE, tokens: null } : await evidenceNow($)

  let classification: Classification | null = null
  let standalone: boolean | null = null
  let byWords = false
  if (start.known !== null) {
    classification = start.known
    standalone = true
  } else if (start.useHaiku) {
    const reading = await askHaiku($, text, start.isFirst ? null : evidence)
    classification = reading?.classification ?? null
    standalone = reading?.standalone ?? null
  } else {
    classification = classify(text, RULES)
    byWords = true
  }
  if (mine !== stamp) return
  if (classification === null) {
    await update($, card, () => ({ ...HIDDEN, step: 'failed' as const, isFirst: start.isFirst }))
    return
  }
  // Reason: the first prompt always starts a task; later, only a draft Haiku read as one replaces it.
  if (start.isFirst || standalone === true) task = text.trim().slice(0, 300)
  const proposal = cardRows(classification, settings, RULES, { isFirst: start.isFirst, standalone, evidence, tokens, byWords })
  await update($, card, () => ({ step: 'ready' as const, rows: proposal.rows, note: proposal.note, effortNote: proposal.effortNote, isFirst: start.isFirst }))
}

/** A pick on one row; pressing the same pick again keeps it. */
export async function chooseRow($: EngineInterface, kind: CardRow['kind'], choice: Choice) {
  await update($, card, before => ({ ...before, rows: before.rows.map(r => (r.kind === kind ? { ...r, choice } : r)) }))
}

/** True while some row of a ready card still waits for a pick; a card still looking waits too. */
export const cardPending = (c: SettingsCard): boolean =>
  c.step === 'looking' || (c.step === 'ready' && c.rows.some(r => r.choice === null))

/** What Preparar did to /config: the parts for the toast, the failures, and the rows as they were. */
export type Applied = { parts: string[]; failures: string[]; rowsBefore: Array<{ key: string; value: string }> }

/** Writes the rows the person picked, model first: a new model can bring its own saved effort. */
export async function applyCard($: EngineInterface, c: SettingsCard, language: Lang): Promise<Applied> {
  const m = t(language)
  const out: Applied = { parts: [], failures: [], rowsBefore: [] }
  for (const kind of ['model', 'effort'] as const) {
    const row = c.rows.find(r => r.kind === kind && r.choice === 'use')
    if (row === undefined) continue
    const config = findRow(await $.config.list(), kind)
    if (config === undefined) {
      out.failures.push(kind === 'model' ? m.noModelRow : m.noEffortRow)
      continue
    }
    const value = kind === 'model' ? modelValue(config, row.value) : effortValue(config, row.value as Effort)
    const failure = await writeRow($, config.key, value, language)
    if (failure !== null) {
      out.failures.push(`${kind === 'model' ? m.rowModel : 'effort'}: ${failure}`)
      continue
    }
    out.rowsBefore.push({ key: config.key, value: String(config.value ?? '') })
    if (kind === 'effort') noteEffort(row.value, 'config')
    out.parts.push(kind === 'model' ? m.partModel(displayName(row.value)) : m.partEffort(row.value))
  }

  return out
}

/** Deshacer for the rows: each written back to what it held. True when every one was taken. */
export async function undoRows($: EngineInterface, rows: ReadonlyArray<{ key: string; value: string }>, language: Lang) {
  let isOk = true
  // Reason: written back in reverse, so the model's own saved effort cannot overwrite the effort restored after it.
  for (const r of [...rows].reverse()) {
    if ((await writeRow($, r.key, r.value, language)) !== null) isOk = false
    else if (/effort/i.test(r.key)) noteEffort(r.value, 'config')
  }
  return isOk
}

/** The card as a bordered box, or null when it is hidden. Locked, after Preparar, it shows the picks without buttons. */
export async function drawCard($: EngineInterface, e: RenderInput<'Pane'>, isLocked = false): Promise<RenderElement | null> {
  const c = await read($, card)
  if (c.step === 'hidden') return null
  const { Box, Button, Text } = $.ui.resolve(e)
  const language = await read($, lang)
  const m = t(language)
  const colors = paneColors(e.surface, await read($, theme))
  const body =
    c.step === 'looking' ? (
      <Text color="text">{m.cardLooking}</Text>
    ) : c.step === 'failed' ? (
      <Text color="text">{m.cardFailed}</Text>
    ) : c.rows.length === 0 ? (
      <Text color="text">{c.note[language]}</Text>
    ) : (
      <Box flexDirection="column">
        {c.rows.map(row => (
          <Box flexDirection="column">
            <Text color="text">{row.text[language]}</Text>
            {row.kind === 'model' && !c.isFirst && <Text color={colors.alarm} weight="bold">{m.reread(row.rereadTokens)}</Text>}
            {/* Reason: once applied, the pane's fixed "Aplicado" line says what happened; the picks would only repeat it. */}
            {isLocked ? null : (
            <Box>
              <Button key={`use-${row.kind}`} hotkey={row.kind === 'model' ? 'm' : 'e'} onPress={() => chooseRow($, row.kind, 'use')}>
                <Text color={colors.action}>{m.use}</Text>
              </Button>
              <Button
                key={`discard-${row.kind}`}
                label={m.discard}
                hotkey={row.kind === 'model' ? 'x' : 'r'}
                onPress={() => chooseRow($, row.kind, 'discard')}
              />
              {row.choice !== null && <Text color="text">{m.picked[row.choice]}</Text>}
            </Box>
            )}
          </Box>
        ))}
      </Box>
    )

  return (
    <Box flexDirection="column" borderStyle="round" paddingX={1}>
      <Text color="text" weight="bold">{m.cardTitle}</Text>
      {body}
      {c.step === 'ready' && c.effortNote[language] !== '' && <Text color="text">{c.effortNote[language]}</Text>}
    </Box>
  )
}
