// Pure rules engine: a prompt text plus rules.ts in, a suggestion out. No engine calls here.
import type { Classification, Advice, Bilingual, Effort, Lang, Model, Settings, Assessment } from '../types'
import { inBoth, pick, t } from './i18n'

export type ModelRule = {
  id: string
  model: Model
  reason: Bilingual
  words: string[]
  source: string
  /** A note on how the source backs the rule; a plain string reads the same in both languages. */
  support?: Bilingual | string
  conflicts: string[]
}

export type EffortRule = {
  id: string
  effort: Effort
  reason: Bilingual
  words: string[]
  source: string
  quote?: string
  conflicts: string[]
}

/** A sentence copied word for word from a source, and the rules that lean on it. The auditor looks for it. */
export type Quote = { url: string; text: string; usedBy: string[] }

export type Rules = {
  version: number
  minChars: number
  /** The model families the rules know, smallest first. The effort-first step climbs this list. */
  families: Model[]
  defaultModel: { model: Model; reason: Bilingual; source: string; support?: Bilingual | string }
  defaultEffort: { effort: Effort; source: string; quote?: string }
  models: ModelRule[]
  efforts: EffortRule[]
  effortStep: { enabled: boolean; ceiling: Effort; source: string; conflicts: string[] }
  /** Limits of the Haiku classifier: the typing pause before a call, time and text caps. */
  haiku: { pauseMs: number; timeoutMs: number; maxChars: number }
  /**
   * The settings card after the first prompt, effort alone: how many levels it may go down at once,
   * and how much of the assistant's last reply Haiku reads as context.
   */
  effortLater: { maxStepsDown: number; contextChars: number; source: string }
  /** The prompt improver: its instructions, each with its source, and its limits. `{name}` in an instruction is the limit of that name. */
  improver: {
    instructions: Array<{ text: string; source: string }>
    /** Characters of the draft the model is given. */
    maxChars: number
    maxTokens: number
    timeoutMs: number
    effort: Effort
    effortSource: string
    /** Below this share of the draft's words kept, the list of dropped words is left out: the text was rewritten. */
    rewriteThreshold: number
    /** Dropped runs listed in the panel; the rest are counted. */
    maxDropped: number
    /** Length cap, tags left out: this many times the draft's words, or the draft plus `minExtraWords`, whichever is more. */
    maxLengthFactor: number
    minExtraWords: number
    /** Most tags a proposal should leave. */
    maxTags: number
  }
  conflicts: Record<string, Bilingual>
  quotes: Quote[]
  /** What the auditor fetches and how much of it a model is given to read. */
  audit: {
    /** When the quotes were last read against their pages. */
    reviewed: string
    /** Where each cited URL is downloaded from, when that differs from the URL itself. */
    downloads: Record<string, string>
    /** The cited URL whose tables list the model aliases and the effort levels. */
    modelsPage: string
    nonFamilyAliases: string[]
    /** Rows of the effort table that are not levels (a setting listed beside them). */
    nonEffortLevels: string[]
    keywords: string[]
    window: number
    maxContextChars: number
    model: string
    timeoutMs: number
  }
}

export const EFFORTS: readonly Effort[] = ['low', 'medium', 'high', 'xhigh', 'max']

/** The display name of a model family: its own name, capitalised. */
export const displayName = (model: Model): string => model.charAt(0).toUpperCase() + model.slice(1)

/** Lowercase without accents, so `Migración` and `migracion` match the same word. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Whether a rule word appears in an already normalised text.
 * A word ending in `*` is a prefix (`migra*` matches `migrar`); any other must appear whole.
 */
export function matchesWord(word: string, normalized: string): boolean {
  const isPrefix = word.endsWith('*')
  const base = normalize(isPrefix ? word.slice(0, -1) : word).trim()
  if (base === '') return false
  // Reason: \b fails next to non-ASCII letters, so the borders are spelled out.
  const tail = isPrefix ? '' : '(?![a-z0-9])'
  return new RegExp(`(?<![a-z0-9])${escapeRegex(base)}${tail}`).test(normalized)
}

const countMatches = (words: string[], normalized: string): number =>
  words.filter(p => matchesWord(p, normalized)).length

/** The model family inside a model id or alias (`claude-opus-5-5[1m]` is opus); null when rules.ts lists none of it. */
export function familyOf(model: string, rules: Rules): Model | null {
  const id = model.toLowerCase()
  return rules.families.find(m => id.includes(m)) ?? null
}

/** A config value as an effort level; null for anything else (a number, `auto`, nothing). */
export function effortOf(value: unknown): Effort | null {
  const text = String(value ?? '').toLowerCase()
  return EFFORTS.find(e => e === text) ?? null
}

/**
 * What the rules say about a prompt. Null when the text is too short or is a slash command.
 * Model: the family with most matched words wins; a draw between families is doubt, and doubt
 * goes to the default. Effort: the rule with most matches; a draw goes to the higher level.
 */
export function classify(text: string, rules: Rules): Classification | null {
  const trimmed = text.trim()
  if (trimmed.length < rules.minChars || trimmed.startsWith('/')) return null
  const normalized = normalize(trimmed)

  const scores = rules.models
    .map(rule => ({ regla: rule, n: countMatches(rule.words, normalized) }))
    .filter(x => x.n > 0)
  const byFamily = rules.families.map(model => ({
    modelo: model,
    total: scores.filter(x => x.regla.model === model).reduce((sum, x) => sum + x.n, 0),
  })).filter(x => x.total > 0)
  const top = Math.max(0, ...byFamily.map(x => x.total))
  const winners = byFamily.filter(x => x.total === top)

  const single = winners.length === 1 ? winners[0] : undefined
  const bestRule = single && scores.filter(x => x.regla.model === single.modelo).sort((a, b) => b.n - a.n)[0]?.regla
  const names = winners.map(x => displayName(x.modelo))
  // Reason: a draw names the families it was between; with more than two the last pair is joined, the rest by commas.
  const doubt =
    winners.length > 1
      ? inBoth(lang => t(lang).doubt(names.slice(0, -1).join(', '), names[names.length - 1] ?? ''))
      : undefined

  const bestEffort = rules.efforts
    .map(rule => ({ regla: rule, n: countMatches(rule.words, normalized) }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n || EFFORTS.indexOf(b.regla.effort) - EFFORTS.indexOf(a.regla.effort))[0]?.regla

  return compose(bestRule, bestEffort, rules, 'words', doubt)
}

/**
 * A classification from the rules that won, whoever picked them. A missing rule means the default;
 * `reason` replaces the default reason (a draw between families says which ones).
 */
export function compose(
  model: ModelRule | undefined,
  effort: EffortRule | undefined,
  rules: Rules,
  origin: Classification['origin'],
  reason?: Bilingual,
): Classification {
  return {
    model: model?.model ?? rules.defaultModel.model,
    effort: effort?.effort ?? rules.defaultEffort.effort,
    reason: model?.reason ?? reason ?? rules.defaultModel.reason,
    modelRule: model?.id ?? 'por-defecto',
    modelSource: model?.support
      ? inBoth(lang => `${model.source} (${pick(model.support ?? '', lang)})`)
      : inBoth(() => model?.source ?? rules.defaultModel.source),
    effortRule: effort?.id ?? 'por-defecto',
    effortSource: effort?.source ?? rules.defaultEffort.source,
    conflicts: [...new Set([...(model?.conflicts ?? []), ...(effort?.conflicts ?? [])])],
    origin,
  }
}

/**
 * The effort-first step: when the rules ask for a bigger model than the session has and its
 * effort is under the ceiling, propose one more level of effort on the same model instead.
 * Reason: with an unknown model or effort there is nothing to climb from, so the model goes as is.
 */
export function advise(c: Classification, settings: Settings, rules: Rules): Advice {
  const direct: Advice = { model: c.model, effort: c.effort, reason: c.reason, isStep: false }
  const current = familyOf(settings.model, rules)
  if (!rules.effortStep.enabled || current === null || settings.effort === null) return direct
  const wantsBigger = rules.families.indexOf(c.model) > rules.families.indexOf(current)
  const level = EFFORTS.indexOf(settings.effort)
  if (!wantsBigger || level >= EFFORTS.indexOf(rules.effortStep.ceiling)) return direct

  return {
    model: current,
    effort: EFFORTS[level + 1] ?? settings.effort,
    reason: inBoth(lang => t(lang).stepUp(c.reason[lang], displayName(c.model))),
    isStep: true,
  }
}

/** Whether a suggestion differs from the session's settings. An unreadable effort compares the model alone. */
export function differs(advice: Advice, settings: Settings, rules: Rules): boolean {
  if (familyOf(settings.model, rules) !== advice.model) return true
  return settings.effort !== null && settings.effort !== advice.effort
}

/** Text to settings to record: the whole decision for one draft, or null when nothing applies. */
export function assess(text: string, settings: Settings, rules: Rules): Assessment | null {
  const classification = classify(text, rules)
  return classification === null ? null : assessWith(classification, settings, rules)
}

/** The same decision for a classification already made, by the words or by Haiku. */
export function assessWith(classification: Classification, settings: Settings, rules: Rules): Assessment {
  const advice = advise(classification, settings, rules)
  return { classification, settings, advice, isShown: differs(advice, settings, rules) }
}

/** The one line of the band: model, effort and the reason, in the person's language. */
export const line = (advice: Advice, lang: Lang): string =>
  `${displayName(advice.model)} · ${advice.effort} · ${advice.reason[lang]}`

/**
 * What the band says for a draft, or null for nothing. A suggestion that differs is shown as it is.
 * One that matches the settings is silent, unless Haiku made it: then the band confirms, so the
 * line the words drew does not just vanish when Haiku disagrees with them.
 */
export function bandText(r: Assessment, lang: Lang): string | null {
  if (r.isShown) return line(r.advice, lang)
  if (r.classification.origin !== 'haiku') return null
  const effort = r.settings.effort === null ? '' : ` · ${r.advice.effort}`
  return `${t(lang).fineWith(displayName(r.advice.model))}${effort} · ${r.advice.reason[lang]}`
}

/** What /consejo answers: the suggestion, the settings it was compared with, each rule and its source. */
export function report(r: Assessment | null, rules: Rules, lang: Lang, haiku?: string): string {
  const m = t(lang)
  if (r === null) return m.noAdvice
  const c = r.classification
  const rows = [
    m.reportAdvice(line(r.advice, lang)),
    m.reportSettings(r.settings.model, r.settings.effort),
    r.isShown ? m.reportShown : bandText(r, lang) === null ? m.reportSilent : m.reportConfirmed,
    m.reportBy(c.origin === 'haiku'),
    m.reportModelRule(c.modelRule, displayName(c.model), c.modelSource[lang]),
    m.reportEffortRule(c.effortRule, c.effort, c.effortSource),
  ]
  if (r.advice.isStep) rows.push(m.reportStep(rules.effortStep.source))
  const ids = [...new Set([...c.conflicts, ...(r.advice.isStep ? rules.effortStep.conflicts : [])])]
  for (const id of ids) rows.push(m.reportConflict(id, rules.conflicts[id]?.[lang]))
  if (haiku !== undefined) rows.splice(3, 0, haiku)
  rows.push('made with ♥ and Ai by Pin0')
  return rows.join('\n')
}
