// The prompt improver's engine side: the call to the model, the pane that shows the proposal and its buttons.
// The mod never sends a prompt: Usar only puts the proposal in the box, and the person presses Enter.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, PromptDecoration, RenderElement, RenderInput } from 'claude-code'

import rulesData from '../rules'
import type { ImproverState, Lang, Level } from '../types'
import { FALLBACK, t } from './i18n'
import type { Rules } from './classifier'
import { drawSignature, signatureColors } from './signature'
import {
  compare,
  isImprovable,
  tagsOf,
  readProposal,
  failureReason,
  modelName,
  improverRequest,
  tagSpans,
  segments,
} from './improver'

const RULES: Rules = rulesData

export const PANEL = 'prompt-improver'

export const EMPTY: ImproverState = {
  step: 'idle',
  model: '',
  original: '',
  proposal: '',
  added: 0,
  dropped: [],
  isRewritten: false,
  isTooLong: false,
  words: { original: 0, proposal: 0 },
  tags: [],
  before: '',
  reason: { es: '', en: '' },
}

// Reason: the shape tag declines a proposal an older version stored with a one-language reason.
export const IMPROVER_SHAPE = 'improver-2'
const improver = atom({ plugin: 'consejero-modelo', key: 'improver' } as const, EMPTY, { shape: IMPROVER_SHAPE })
const lang = atom({ plugin: 'consejero-modelo', key: 'lang' } as const, FALLBACK as Lang)
// Reason: the engine lists each file's reads from atoms declared in that file, so register.tsx declares it too.
const theme = atom({ plugin: 'consejero-modelo', key: 'theme' } as const, '')

// Reason: theme keys follow the person's light or dark theme, so the contrast is the theme's, not a fixed hex.
const COLOR: Record<Level, 'error' | 'warning' | 'success'> = {
  required: 'error',
  specify: 'warning',
  optional: 'success',
}

/** The tags of a text painted in their level's color, for the prompt box. */
export const paintTags = (text: string): PromptDecoration[] =>
  tagSpans(text).map(t => ({ start: t.start, end: t.end, color: COLOR[t.level], bold: true }))

// Reason: each request is stamped, so a late answer after Cancelar or a newer Mejorar is dropped.
let turn = 0
let controller: AbortController | null = null

/** Asks the model for a better version of `text` and shows it in the pane. The box is not touched. */
export async function requestImprovement($: EngineInterface, text: string, model: string) {
  const mine = await openImprover($, text, model)
  if (mine !== null) await runImprovement($, text, model, mine)
}

/**
 * The pane, open and showing "thinking", or null when it cannot be: a draft too short, or no room.
 * Reason: the engine places a pane at any width only when it is opened inside the hook of the command the
 * person typed or the button they pressed; opened later, in the background, a terminal under 144 columns
 * leaves it undrawn (seen by Javi on 0.7.4 in VS Code's integrated terminal). So callers open it first,
 * in their own hook, and only the model call runs in the background.
 */
export async function openImprover($: EngineInterface, text: string, model: string): Promise<number | null> {
  const m = t(await read($, lang))
  if (!isImprovable(text, RULES)) {
    $.ui.toast(m.writeMore(RULES.minChars))
    return null
  }
  controller?.abort()
  controller = new AbortController()
  const mine = ++turn
  await update($, improver, () => ({ ...EMPTY, step: 'thinking' as const, model, original: text }))
  const opened = await $.ui.open({ id: PANEL, title: m.paneTitle, closeOnEscape: true })
  if (!opened.isPlaced) {
    // Reason: a proposal nobody can see is a paid call for nothing, so the request is not sent.
    turn += 1
    await update($, improver, () => EMPTY)
    $.ui.toast(m.noRoom(opened.reason))
    return null
  }

  return mine
}

/** The paid call for an opened pane; `mine` is the stamp openImprover gave, so a newer request wins. */
export async function runImprovement($: EngineInterface, text: string, model: string, mine: number) {
  if (mine !== turn || controller === null) return
  const { system, prompt } = improverRequest(text, RULES)
  const { maxTokens, timeoutMs, effort } = RULES.improver
  const r = await $.model.complete({ model: model, system, prompt, maxTokens, effort, timeoutMs }, { signal: controller.signal })
  if (mine !== turn) return
  if (!r.isAnswered) {
    await update($, improver, a => ({ ...a, step: 'failed' as const, reason: failureReason(r) }))
    return
  }
  const proposal = readProposal(r.text, text)
  if (proposal === null) {
    await update($, improver, a => ({ ...a, step: 'failed' as const, reason: { es: t('es').notAPrompt, en: t('en').notAPrompt } }))
    return
  }
  const comparison = compare(text, proposal, RULES)
  await update($, improver, a => ({ ...a, ...comparison, step: 'ready' as const, proposal, tags: tagsOf(proposal) }))
}

/** Usar: the proposal replaces the draft in the box, its tags painted, and the box as it was is kept for Deshacer. */
export async function useProposal($: EngineInterface) {
  const state = await read($, improver)
  if (state.step !== 'ready') return
  const m = t(await read($, lang))
  const box = await $.prompt.read()
  const r = await $.prompt.fill({ text: state.proposal, mode: 'replace', decorations: paintTags(state.proposal) })
  if (!r.isFilled) {
    $.ui.toast(m.fillFailed(r.refusal))
    return
  }
  await update($, improver, a => ({ ...a, step: 'used' as const, before: box.text }))
  $.ui.toast(m.filled(state.tags.length))
}

/** Deshacer: the box gets back exactly what it held before Usar. */
export async function undoProposal($: EngineInterface) {
  const state = await read($, improver)
  if (state.step !== 'used') return
  const r = await $.prompt.fill({ text: state.before, mode: 'replace' })
  if (!r.isFilled) {
    $.ui.toast(t(await read($, lang)).undoFailed)
    return
  }
  await update($, improver, a => ({ ...a, step: 'ready' as const, before: '' }))
}

/** Forgets the proposal, cancels a call in flight, and closes the pane unless the person already did. */
export async function forgetProposal($: EngineInterface, close = true) {
  turn += 1
  controller?.abort()
  controller = null
  const state = await read($, improver)
  if (state.step === 'idle') return
  await update($, improver, () => EMPTY)
  if (close) await $.ui.close({ id: PANEL })
}

/** The changes in one sentence: words added, and the person's own words that were dropped. */
function changeSummary(state: ImproverState, lang: Lang): string {
  const m = t(lang)
  if (state.isRewritten) return m.rewritten
  if (state.added === 0 && state.dropped.length === 0) {
    // Reason: with tags the prompt was not clear yet, even when not a word of it changed.
    return state.tags.length === 0 ? m.noChanges : m.onlyQuestions
  }
  const added = m.addedWords(state.added)
  if (state.dropped.length === 0) return m.keptAll(added)
  const { maxDropped } = RULES.improver
  const list = state.dropped.slice(0, maxDropped).map(q => `"${q}"`).join(', ')

  return m.droppedSome(added, list, state.dropped.length - maxDropped)
}

/** The pane: the improver's body, then Javi's signature as its footer on every step. */
export async function drawPane($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const pieces = $.ui.resolve(e)
  const { Box, Text } = pieces
  // Reason: the terminal's table also has an Svg key but draws nothing there, so the surface decides.
  const Svg = e.surface !== 'terminal' && 'Svg' in pieces ? pieces.Svg : undefined
  const colors = signatureColors(await read($, theme))

  return (
    <Box flexDirection="column">
      {await paneBody($, e)}
      {drawSignature({ Box, Text, Svg }, colors, e.props.bodyColumns)}
    </Box>
  )
}

/** The pane's body for each step of the improver: what to read first, the buttons last. */
async function paneBody($: EngineInterface, e: RenderInput<'Pane'>): Promise<RenderElement> {
  const { Box, Button, Text } = $.ui.resolve(e)
  const state = await read($, improver)
  const language = await read($, lang)
  const m = t(language)
  const who = modelName(state.model, language)
  const closeButton = <Button key="close" label={m.close} hotkey="c" onPress={() => forgetProposal($)} />

  if (state.step === 'idle') {
    return <Text color="text">{m.idle}</Text>
  }
  if (state.step === 'thinking') {
    return (
      <Box flexDirection="column">
        <Text color="text">{m.thinking(who)}</Text>
        <Text color="text">{m.boxUntouched}</Text>
        <Box>
          <Button key="cancel" label={m.cancel} hotkey="d" onPress={() => forgetProposal($)} />
        </Box>
      </Box>
    )
  }
  if (state.step === 'failed') {
    return (
      <Box flexDirection="column">
        <Text color="text">{m.failed(who, state.reason[language])}</Text>
        <Text color="text">{m.boxSame}</Text>
        <Box>{closeButton}</Box>
      </Box>
    )
  }

  const counts = (['required', 'specify', 'optional'] as const)
    .map(level => ({ level, n: state.tags.filter(t => t.level === level).length }))
    .filter(c => c.n > 0)

  const buttons =
    state.step === 'ready' ? (
      <Box>
        {/* Reason: green marks the main action; Discard stays neutral because red already means a required tag here. */}
        <Button key="use" hotkey="u" onPress={() => useProposal($)}>
          <Text color="success">{m.use}</Text>
        </Button>
        <Button key="discard" label={m.discard} hotkey="d" onPress={() => forgetProposal($)} />
      </Box>
    ) : (
      <Box flexDirection="column">
        <Text color="text">{m.inBox}</Text>
        <Box>
          <Button key="undo" label={m.undo} hotkey="z" onPress={() => undoProposal($)} />
          {closeButton}
        </Box>
      </Box>
    )

  return (
    <Box flexDirection="column">
      <Text color="text">
        {m.proposalBy(who)}
        {counts.map(c => (
          <Text color={COLOR[c.level]}>
            {' · '}
            {c.n} {m.levels[c.level][c.n === 1 ? 0 : 1]}
          </Text>
        ))}
      </Text>
      <Box borderStyle="round" paddingX={1}>
        <Text color="text">
          {segments(state.proposal).map(t =>
            t.level === undefined ? t.text : <Text color={COLOR[t.level]} weight="bold">{t.text}</Text>,
          )}
        </Text>
      </Box>
      {state.isTooLong && (
        <Text color="warning">{m.tooLong(state.words.proposal, state.words.original)}</Text>
      )}
      <Text color="text">{changeSummary(state, language)}</Text>
      {buttons}
    </Box>
  )
}
