// Wiring: which events feed the classifier and where the suggestion is drawn. The rules live in rules.ts.
import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import rulesData from '../rules'
import { findRow, modelValue } from './apply'
import { auditRules, auditReport, auditorRequest } from './auditor'
import type { Pages } from './auditor'
import { classify, familyOf, report, displayName, assessWith, bandText } from './classifier'
import type { Rules } from './classifier'
import { haikuTail, haikuSentence, readHaikuReply, haikuRequest } from './haiku'
import { isImprovable, modelName } from './improver'
import { detectLang, FALLBACK, langFromSetting, t } from './i18n'
import { drawPane, forgetProposal, openImprover, PANEL, runImprovement, paintTags, EMPTY, IMPROVER_SHAPE } from './panel'
import { forgetTask, noteEffort, readEffort, readSettings, setEffort, startCard, startOver, writeRow } from './card'
import { VERSION } from './version'
import type { Classification, Advice, HaikuState, Lang, Assessment } from '../types'

const RULES: Rules = rulesData

// Reason: the shape tag declines an assessment an older version stored with one-language reasons.
const ASSESSMENT_SHAPE = 'assessment-2'
const current = atom({ plugin: 'consejero-modelo', key: 'current' } as const, null, { shape: ASSESSMENT_SHAPE })
const last = atom({ plugin: 'consejero-modelo', key: 'last' } as const, null, { shape: ASSESSMENT_SHAPE })
// Reason: false until a SessionStart says the conversation is new, so a reload mid-session stays quiet.
const isFirst = atom({ plugin: 'consejero-modelo', key: 'isFirst' } as const, false)
// Reason: a session-wide switch, so /clear does not reset it; a new session starts with the advisor on.
const isOff = atom({ plugin: 'consejero-modelo', key: 'isOff' } as const, false)
// Reason: the real engine starts $.state afresh on /clear (seen by Javi on 0.7.2), so the switch also lives
// in the module, which a /clear does not reload, and is written back to state on every SessionStart.
let advisorOff = false
const haiku = atom({ plugin: 'consejero-modelo', key: 'haiku' } as const, { step: 'off', detail: '' })
// Reason: the band redraws on a state write, so whether the draft can be improved is kept as state, not only in `draft`.
const hasDraft = atom({ plugin: 'consejero-modelo', key: 'hasDraft' } as const, false)
// Reason: the engine lists each file's reads from atoms written in that file, so panel.tsx's atom is declared here too.
const improver = atom({ plugin: 'consejero-modelo', key: 'improver' } as const, EMPTY, { shape: IMPROVER_SHAPE })
// The language the mod speaks: the last one a draft was written in, else Claude Code's `language` setting.
const lang = atom({ plugin: 'consejero-modelo', key: 'lang' } as const, FALLBACK as Lang)
// The /config theme, read by panel.tsx for the signature's colour set.
const theme = atom({ plugin: 'consejero-modelo', key: 'theme' } as const, '')
// True once Preparar applied the picks, until the next prompt is sent: the band stays quiet meanwhile.
const settled = atom({ plugin: 'consejero-modelo', key: 'settled' } as const, false)
// The version the engine loaded, read from the plugin's own manifest, for the pane's footer.
const version = atom({ plugin: 'consejero-modelo', key: 'version' } as const, '')

/** Follows the language of a text when it shows one; a text that says too little keeps the current language. */
async function followLanguage($: EngineInterface, text: string) {
  const found = detectLang(text)
  if (found !== null) await update($, lang, before => (before === found ? before : found))
}

/** The language before any draft: Claude Code's `language` setting, or the fallback when it names neither. */
async function startLanguage($: EngineInterface): Promise<Lang> {
  try {
    const value = langFromSetting(await $.settings.read({ key: 'language' }))
    await update($, lang, () => value)
    return value
  } catch {
    return read($, lang)
  }
}

/** Reads the /config "theme" row into state; on failure the colours stay as they were. */
async function refreshTheme($: EngineInterface) {
  try {
    const row = (await $.config.list()).find(r => r.key === 'theme')
    await update($, theme, () => (typeof row?.value === 'string' ? row.value : ''))
  } catch {
    // No readable theme: the dark set stays.
  }
}

async function markHaiku($: EngineInterface, step: HaikuState['step'], detail = '') {
  await update($, haiku, before => (before.step === step && before.detail === detail ? before : { step, detail }))
}

const sameAssessment = (a: Assessment | null, b: Assessment | null): boolean => JSON.stringify(a) === JSON.stringify(b)

async function publish($: EngineInterface, assessment: Assessment | null) {
  // Reason: writing an unchanged value would redraw the band on every key.
  await update($, current, before => (sameAssessment(before, assessment) ? before : assessment))
  if (assessment !== null) await update($, last, before => (sameAssessment(before, assessment) ? before : assessment))
}

// Reason: each draft is stamped so a slow older read or a late Haiku answer cannot overwrite a newer one.
let stamp = 0
let draft = ''
let useHaiku = true
// The model that rewrites the prompt (userConfig `mejorador`), and the last draft worth improving, for a bare /mejora.
let improverModel = 'sonnet'
let lastWritten = ''
// What Haiku answered in this conversation: answers by draft, and the last one.
const seen = new Map<string, Classification>()
let lastHaiku: { text: string; classification: Classification } | null = null
let pause: Timer | null = null
let controller = new AbortController()

function stopHaiku() {
  pause?.cancel()
  pause = null
  controller.abort()
}

function forget() {
  stopHaiku()
  stamp += 1
  seen.clear()
  lastHaiku = null
}

// One paid call: Haiku picks among the rules for a draft the person stopped typing.
async function askHaiku($: EngineInterface, text: string, mine: number) {
  if (mine !== stamp) return
  controller = new AbortController()
  await markHaiku($, 'looking')
  const { system, prompt } = haikuRequest(text, RULES)
  // Reason: a reply cut by the token cap comes back empty, so the cap leaves room well past the one JSON line.
  const r = await $.model.complete(
    { model: 'haiku', system, prompt, maxTokens: 400, effort: 'low', timeoutMs: RULES.haiku.timeoutMs },
    { signal: controller.signal },
  )
  const classification = r.isAnswered ? readHaikuReply(r.text, RULES) : null
  if (classification !== null) {
    seen.set(text, classification)
    lastHaiku = { text, classification }
  }
  // Reason: a newer draft owns the band and the state by now.
  if (mine !== stamp) return
  if (classification === null) {
    // No answer or one that names an unknown rule leaves the word rules' line, and says so.
    if (r.isAnswered) await markHaiku($, 'invalid-answer', r.text.trim().slice(0, 60))
    else await markHaiku($, 'no-answer', r.reason === 'api-error' ? `${r.reason} ${r.status}` : r.reason)
    return
  }
  await publish($, assessWith(classification, await readSettings($), RULES))
  await markHaiku($, 'answered')
}

// Reason: the engine only follows `$` into functions declared at the top of the file.
async function note($: EngineInterface, text: string) {
  draft = text
  const mine = ++stamp
  stopHaiku()
  const improvable = isImprovable(text, RULES)
  if (improvable) lastWritten = text
  // Reason: the Mejorar button is offered on every prompt, so this runs before the first-prompt check below.
  await update($, hasDraft, before => (before === improvable ? before : improvable))
  await followLanguage($, text)
  if (!(await read($, isFirst))) return
  const off = advisorOff || (await read($, isOff))
  const byWords = classify(text, RULES)
  // Reason: while a draft only grows, Haiku's last answer stays on screen instead of flipping back to the words.
  const grows = lastHaiku !== null && text.startsWith(lastHaiku.text) ? lastHaiku.classification : undefined
  const classification = byWords === null ? null : (seen.get(text) ?? grows ?? byWords)
  const assessment = classification === null ? null : assessWith(classification, await readSettings($), RULES)
  if (mine !== stamp) return
  await publish($, assessment)

  // Reason: no cap on calls (Javi's choice, 0.7.1): the pause and the per-text memory are the brakes.
  const due = useHaiku && !off && byWords !== null && !seen.has(text)
  await markHaiku($, !useHaiku || off ? 'off' : seen.has(text) ? 'answered' : 'waiting')
  if (due && mine === stamp) {
    // Reason: Haiku is asked only after a pause in typing, never per key.
    pause = $.clock.after(RULES.haiku.pauseMs, () => detach(askHaiku($, text, mine)))
  }
}

// The Aplicar button: the person takes the suggestion, so its model and effort are set. The draft is not touched.
async function applyAdvice($: EngineInterface, advice: Advice) {
  const failures: string[] = []
  const language = await read($, lang)
  const m = t(language)
  const settings = await readSettings($)
  if (familyOf(settings.model, RULES) !== advice.model) {
    const row = findRow(await $.config.list(), 'model')
    const failure = row ? await writeRow($, row.key, modelValue(row, advice.model), language) : m.noModelRow
    if (failure !== null) failures.push(`${m.rowModel}: ${failure}`)
  }
  // Reason: the rows are read again because a new model can bring its own saved effort.
  if ((await readSettings($)).effort !== advice.effort) {
    const { failure } = await setEffort($, advice.effort, language)
    if (failure !== null) failures.push(`effort: ${failure}`)
  }
  $.ui.toast(failures.length === 0 ? m.applied(displayName(advice.model), advice.effort) : m.applyFailed(failures.join('; ')))
  // Reason: this mod's own config.set hook is skipped for its own writes, so the draft is compared again here.
  await note($, draft)
}

let isAuditing = false

async function download($: EngineInterface, url: string): Promise<string | null> {
  try {
    const r = await $.http.fetch(RULES.audit.downloads[url] ?? url)
    return r.ok ? r.text : null
  } catch {
    return null
  }
}

// /consejo auditar: the data check, free; then one model's opinion, only when the check found something.
// It reports to the transcript and never edits rules.ts.
async function runAudit($: EngineInterface) {
  if (isAuditing) return
  isAuditing = true
  try {
    const language = await read($, lang)
    const m = t(language)
    const urls = [...new Set(RULES.quotes.map(c => c.url))]
    const texts = await Promise.all(urls.map(url => download($, url)))
    const pages: Pages = Object.fromEntries(urls.map((url, i) => [url, texts[i] ?? null]))
    const findings = auditRules(RULES, pages)
    $.ui.log(auditReport(RULES, findings, language))
    if (findings.length === 0) return

    $.ui.log(m.askingOpinion(RULES.audit.model))
    const { system, prompt } = auditorRequest(RULES, findings, pages, language)
    const r = await $.model.complete({
      model: RULES.audit.model,
      system,
      prompt,
      maxTokens: 1500,
      timeoutMs: RULES.audit.timeoutMs,
    })
    $.ui.log(
      r.isAnswered ? m.opinion(RULES.audit.model, r.text.trim()) : m.noOpinion(r.reason),
    )
  } finally {
    isAuditing = false
  }
}

// The band's switch: off stops Haiku at once; on looks at the draft in the box again.
async function turnAdvisor($: EngineInterface, on: boolean) {
  advisorOff = !on
  await update($, isOff, () => !on)
  if (!on) stopHaiku()
  await note($, draft)
}

// The pane for one draft: opened in the caller's own hook, then the rewrite and the settings card in the background.
async function improve($: EngineInterface, text: string): Promise<boolean> {
  const mine = await openImprover($, text, improverModel)
  if (mine === null) return false
  detach(runImprovement($, text, improverModel, mine))
  const isFirstPrompt = await read($, isFirst)
  const off = advisorOff || (await read($, isOff))
  // Reason: on the first prompt the band's own Haiku answer for this very draft is reused, never asked twice.
  const known = isFirstPrompt ? (seen.get(text) ?? null) : null
  detach(startCard($, text, { isFirst: isFirstPrompt, useHaiku, isOff: off, known }))
  return true
}

// The band's Mejorar: the box as it stands now, not the last edit the mod heard.
async function improveBox($: EngineInterface) {
  const box = await $.prompt.read()
  await improve($, box.text === '' ? draft : box.text)
}

// Background work never holds a key or a prompt; an engine call that fails there leaves the band as it was.
function detach(work: Promise<unknown>) {
  void work.catch(() => undefined)
}

export const register: Register = (on, options) => {
  useHaiku = options.clasificador !== 'palabras'
  improverModel = options.mejorador === 'haiku' ? 'haiku' : 'sonnet'
  draft = ''
  lastWritten = ''
  forget()
  startOver()

  on('session.start', async ($, e, next) => {
    detach(refreshTheme($))
    // Reason: the person can tell which code runs; an installed plugin can lag behind the folder unzipped.
    await update($, version, () => VERSION)
    const m = t(await startLanguage($))
    // Reason: an SDK host (the VS Code extension, seen by Javi on 0.7.4) starts its sessions with isInteractive
    // false, and a command registered only under the REPL never reached it. Registering is harmless elsewhere.
    await $.command.register({ name: 'consejo', description: m.consejoDescription, argumentHint: m.consejoHint })
    await $.command.register({ name: 'mejora', description: m.mejoraDescription, argumentHint: m.mejoraHint })

    return next(e)
  })

  // A fresh session and a /clear open the window in which the mod speaks; a resume or a compaction do not.
  on('classic.SessionStart', async ($, e, next) => {
    const isNew = e.source === 'startup' || e.source === 'clear'
    forget()
    // Reason: a pane that will not close must not keep a new conversation from opening the consejo window.
    await forgetProposal($).catch(() => undefined)
    // Reason: a bare /mejora improves this conversation's last draft, never one from before a /clear.
    if (isNew) {
      lastWritten = ''
      forgetTask()
    }
    await update($, settled, () => false)
    await update($, isFirst, () => isNew)
    await update($, isOff, () => advisorOff)
    await update($, current, () => null)

    return next(e)
  })

  // While typing: the text is read after the edit and handed back untouched, the improver's tags painted by level.
  on('prompt.edit', async ($, e, next) => {
    const box = await next(e)
    detach(note($, box.text))
    const ours = paintTags(box.text)

    return ours.length === 0 ? box : { ...box, decorations: [...(box.decorations ?? []), ...ours] }
  })

  // A recalled history entry or an emptied box changes the draft without a prompt.edit.
  on('prompt.change', ($, e, next) => {
    detach(note($, e.text))

    return next(e)
  })

  // The first real prompt closes the window. `e` goes down exactly as it came.
  on('prompt.submit', ($, e, next) => {
    if (e.command === undefined && e.isMeta !== true) {
      stopHaiku()
      stamp += 1
      detach(update($, isFirst, () => false))
      detach(update($, current, () => null))
      // Reason: a proposal belongs to the draft it was made for; once a prompt is sent it is stale.
      detach(forgetProposal($))
      detach(update($, settled, () => false))
    }

    return next(e)
  })

  // `/effort high` sets the session's effort without touching the /config row. Reason: the built-in command
  // never showed in prompt.submit (seen by Javi on 0.8.4), so the mod reads it as the command runs.
  on('command.run', { command: 'effort' }, async ($, e, next) => {
    const result = await next(e)
    noteEffort(e.args.trim().split(/\s+/)[0] ?? '', 'command')

    return result
  })

  // Each turn ends with the effort it ran at: the surest reading the mod gets.
  on('classic.Stop', ($, e, next) => {
    noteEffort(e.effort?.level, 'turn')

    return next(e)
  })

  // After /model the comparison is stale: classify the same draft again.
  on('classic.PostModelSwitch', ($, e, next) => {
    detach(note($, draft))

    return next(e)
  })

  on('config.set', async ($, e, next) => {
    const result = await next(e)
    // A new theme changes the signature's colour set at once.
    if (e.key === 'theme' && !('deny' in result)) await update($, theme, () => (typeof e.value === 'string' ? e.value : ''))
    if (/effort/i.test(e.key) && !('deny' in result)) noteEffort(e.value, 'config')
    detach(note($, draft))

    return result
  })

  on('command.run', { command: 'consejo' }, async ($, e) => {
    const language = await read($, lang)
    const m = t(language)
    if (['auditar', 'audit'].includes((e.args ?? '').trim().toLowerCase())) {
      if (isAuditing) return { text: m.auditRunning, isTextDisplayOnly: true }
      // Reason: the downloads and the opinion take seconds, and a command hook that waits on them freezes the command.
      detach(runAudit($))

      return { text: m.auditStarted, isTextDisplayOnly: true }
    }

    const lines = report(await read($, last), RULES, language, haikuSentence(await read($, haiku), language)).split('\n')
    // Reason: the effort is the one reading that can fail silently, so /consejo says where it came from.
    const reading = await readEffort($, await $.session.model())
    const line = reading.effort === null ? m.effortUnknown : m.effortKnown(reading.effort, m.effortSources[reading.source!])
    // The signature, when the report has one, stays its last line.
    lines.splice(lines[lines.length - 1]?.startsWith('made with') ? -1 : lines.length, 0, line)

    return { text: lines.join('\n'), isTextDisplayOnly: true }
  })

  // /mejora improves the text after it, or the last draft written when there is none.
  on('command.run', { command: 'mejora' }, async ($, e) => {
    const text = (e.args ?? '').trim() || lastWritten
    await followLanguage($, text)
    const language = await read($, lang)
    if (!isImprovable(text, RULES)) return { text: t(language).nothingToImprove, isTextDisplayOnly: true }
    // Reason: the pane opens here, inside the command's own hook, so the engine places it at any width;
    // the model call takes seconds, and a command hook that waits on it freezes the command.
    await improve($, text)

    return { text: t(language).preparing(modelName(improverModel, language)), isTextDisplayOnly: true }
  })

  on('ui.render', { component: 'Pane', requestId: PANEL }, ($, e) => drawPane($, e))

  // The person closed the pane: the proposal goes with it. A close of the mod's own was already handled.
  on('ui.close', { id: PANEL }, ($, e, next) => {
    if (e.origin.kind === 'person') detach(forgetProposal($, false))

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Preparar applied the picks: neither advice nor Mejorar until the next prompt is sent (Javi's choice, 0.8.0).
    if (await read($, settled)) return next(e)
    const assessment = await read($, current)
    const language = await read($, lang)
    const m = t(language)
    const text = assessment === null ? null : bandText(assessment, language)
    const inWindow = (await read($, isFirst)) && assessment !== null
    // Reading the atom keeps the band subscribed to it; the module value covers a state the engine emptied.
    const off = (await read($, isOff)) || advisorOff
    const showAdvice = text !== null && inWindow && !off
    const isThinking = (await read($, improver)).step === 'thinking'
    const showImprove = (await read($, hasDraft)) || isThinking
    if (!showAdvice && !showImprove && !(inWindow && off)) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const improveButton = isThinking ? (
      <Text color="text">{m.improving(modelName(improverModel, language))}</Text>
    ) : (
      <Button key="improve" label={m.improve} onPress={() => improveBox($)} />
    )
    const toggle = off ? (
      <Button key="turn-on" label={m.turnOn} onPress={() => turnAdvisor($, true)} />
    ) : (
      <Button key="turn-off" label={m.turnOff} onPress={() => turnAdvisor($, false)} />
    )
    // Off, in the first-prompt window: the band says so and offers to turn it back on.
    if (inWindow && off) {
      return (
        <Box>
          <Text color="text">{m.advisorOff}</Text>
          {improveButton}
          {toggle}
        </Box>
      )
    }
    // Reason: word matching can name the wrong model, so with Haiku on its guess is never shown or applied;
    // the band says what Haiku is doing until it answers (Javi's choice, 0.7.2).
    if (inWindow && useHaiku && assessment.classification.origin === 'words') {
      const step = (await read($, haiku)).step
      const pending =
        step === 'looking' ? m.pendingLooking
        : step === 'no-answer' ? m.pendingNoAnswer
        : step === 'invalid-answer' ? m.pendingInvalid
        : m.pendingPause
      return (
        <Box>
          <Text color="text">{m.advice}</Text>
          <Text color="text">{pending} </Text>
          {improveButton}
          {toggle}
        </Box>
      )
    }
    // Any prompt, not only the first: the band then holds the Mejorar button alone.
    if (!showAdvice) return <Box>{improveButton}</Box>

    const tail = haikuTail(await read($, haiku), assessment?.classification.origin ?? 'words', language)
    // The model the session runs is in no family of rules.ts: the rules are behind, and the band says so.
    const unknownModel = assessment !== null && familyOf(assessment.settings.model, RULES) === null

    return (
      <Box>
        <Text color="text">{m.advice}</Text>
        <Text color="text">{text} </Text>
        {tail !== '' && <Text color="text">{tail} </Text>}
        {unknownModel && <Text color="warning">{m.unknownModel}</Text>}
        {assessment?.isShown === true && (
          <Button key="apply" label={m.apply} onPress={() => applyAdvice($, assessment.advice)} />
        )}
        {improveButton}
        {toggle}
      </Box>
    )
  })
}
