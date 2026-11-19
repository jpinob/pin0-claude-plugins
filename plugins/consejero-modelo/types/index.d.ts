/** The two languages the mod speaks. */
export type Lang = 'es' | 'en'

/** A text the person sees, in both languages. */
export type Bilingual = Readonly<Record<Lang, string>>

/** A model family a rule can point to: one of `families` in rules.ts (`opus`, `fable`). */
export type Model = string

/** The effort levels Claude Code accepts, lowest first. */
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** What the rules say about a prompt, before looking at the session settings. */
export type Classification = {
  model: Model
  effort: Effort
  /** A few words shown in the band. */
  reason: Bilingual
  /** Id of the model rule that won, or `por-defecto`. */
  modelRule: string
  /** The rule's source, with its support note when it has one. */
  modelSource: Bilingual
  /** Id of the effort rule that won, or `por-defecto`. */
  effortRule: string
  effortSource: string
  /** Ids of the conflicts (`conflicts` in rules.ts) the winning rules carry. */
  conflicts: string[]
  /** Who classified: the local word rules, or Haiku picking among the same rules. */
  origin: 'words' | 'haiku'
}

/** The model and effort the session has now. `effort` is null when it cannot be read. */
export type Settings = {
  /** The model id as `/model` shows it. */
  model: string
  effort: Effort | null
}

/** The suggestion after the effort-first step: what the band and /consejo show. */
export type Advice = {
  model: Model
  effort: Effort
  reason: Bilingual
  /** True when the rules asked for a bigger model and the step proposed more effort instead. */
  isStep: boolean
}

/** One classified draft with the settings it was compared against. */
export type Assessment = {
  classification: Classification
  settings: Settings
  advice: Advice
  /** False when the suggestion equals the current settings, so the band stays empty. */
  isShown: boolean
}

/** Where the Haiku classifier stands for the draft in the box, and why when it gave nothing. */
export type HaikuState = {
  step: 'off' | 'waiting' | 'looking' | 'answered' | 'no-answer' | 'invalid-answer'
  /** The engine's reason or the reply's first characters, for /consejo; empty when there is none. */
  detail: string
}

/** How much a missing piece matters: required, only the person knows and without it the model would guess; specify, only the person knows and it changes the result; optional, the assistant can find it in the code. */
export type Level = 'required' | 'specify' | 'optional'

/** One tag the proposal left for the person: its level and its question. */
export type Tag = { level: Level; question: string }

/** Where the prompt improver stands, and what it proposed. */
export type ImproverState = {
  /** idle: no proposal; thinking: the model is writing; ready: shown, box untouched; used: Preparar applied the picks; failed: no proposal. */
  step: 'idle' | 'thinking' | 'ready' | 'used' | 'failed'
  /** The alias the request named (`sonnet`, `haiku`). */
  model: string
  /** The draft the model was given. */
  original: string
  /** The rewritten prompt; empty until the model answers. */
  proposal: string
  /** Words of the proposal, tags left out, that are not in the draft: from the mod's own comparison. */
  added: number
  /** Runs of the draft's words the proposal dropped, from the mod's own comparison. */
  dropped: string[]
  /** True when so little of the draft survives that a list of what was dropped would say nothing. */
  isRewritten: boolean
  /** True when the proposal, tags left out, is longer than rules.ts allows. */
  isTooLong: boolean
  /** Words of the draft and of the proposal without its tags. */
  words: { original: number; proposal: number }
  /** The tags the proposal left, in order. */
  tags: Tag[]
  /** The person's pick on the prompt card: use the proposal, discard it, or not chosen yet. */
  choice: Choice
  /** The box as it was right before Preparar: what Deshacer puts back. */
  before: string
  /** The /config rows Preparar changed, with the values they had before: what Deshacer writes back. */
  rowsBefore: Array<{ key: string; value: string }>
  /** What Preparar applied and discarded, as the pane shows it until the next send; empty before Preparar. */
  applied: string
  /** Why there is no proposal, for `failed`. */
  reason: Bilingual
}

/** A pick on a card row: use it, discard it, or not chosen yet. */
export type Choice = 'use' | 'discard' | null

/** One row of the settings card: a model or an effort to change to, and the person's pick. */
export type CardRow = {
  kind: 'model' | 'effort'
  /** The model family or the effort level proposed. */
  value: string
  /** The row's line: from what, to what, and why. */
  text: Bilingual
  /** After the first prompt, the tokens a model switch would re-read without cache; null when not warned or unknown. */
  rereadTokens: number | null
  choice: Choice
}

/** The pane's settings card: Haiku's model and effort for the same draft the improver rewrites. */
export type SettingsCard = {
  /** hidden: no card (advisor off, no pane); looking: Haiku is reading; ready: rows or a note; failed: no reading. */
  step: 'hidden' | 'looking' | 'ready' | 'failed'
  rows: CardRow[]
  /** What the card says when it has no row: you're fine with the model. */
  note: Bilingual
  /** When there is no effort row: the effort stays, why it is not lowered, or that it cannot be read. */
  effortNote: Bilingual
  /** True on the first prompt of a conversation, where the model can change without re-reading anything. */
  isFirst: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'consejero-modelo': {
      /** The draft in the prompt box, classified; null when nothing applies. */
      current: Shaped<Assessment | null>
      /** The last classification made, kept after the prompt is sent, for /consejo. */
      last: Shaped<Assessment | null>
      /** True from a fresh session or a /clear until the first prompt is sent. */
      isFirst: boolean
      /** True while the person has the advisor turned off: no advice and no Haiku calls, for the whole session, /clear included. */
      isOff: boolean
      /** What Haiku is doing or did with the current draft. */
      haiku: HaikuState
      /** True while the box holds a draft long enough to improve. */
      hasDraft: boolean
      /** The value of the /config "theme" row, so the pane's signature takes the colours of the theme. */
      theme: string
      /** The prompt improver and its last proposal. */
      improver: Shaped<ImproverState>
      /** The language the mod speaks: the last one a draft was detected in, else Claude Code's setting. */
      lang: Lang
      /** The pane's settings card. */
      card: Shaped<SettingsCard>
      /** True once Preparar applied the picks, until the next prompt is sent: the band says nothing meanwhile. */
      settled: boolean
      /** The version of the loaded copy, from its own plugin.json; empty when it could not be read. */
      version: string
    }
  }
}
