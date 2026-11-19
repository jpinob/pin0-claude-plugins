// Which /config rows the Aplicar button writes and with what value. Pure; the writes are in register.tsx.
import type { Effort, Model } from '../types'

/** The part of a /config row this file reads. */
export type Row = { key: string; value: unknown; options?: readonly string[] }

/** The /config row of the model or of the effort; undefined when the menu has none. */
export function findRow(rows: readonly Row[], which: 'model' | 'effort'): Row | undefined {
  if (which === 'effort') return rows.find(f => /effort/i.test(f.key))
  const withoutEffort = rows.filter(f => !/effort/i.test(f.key))
  return withoutEffort.find(f => f.key.toLowerCase() === 'model') ?? withoutEffort.find(f => /model/i.test(f.key))
}

/**
 * The value to write for a model family. Reason: a row that lists its options only takes one of
 * them, so the family's own alias is preferred, then the first option that names the family.
 */
export function modelValue(row: Row, model: Model): string {
  const choices = row.options ?? []
  return (
    choices.find(o => o.toLowerCase() === model) ?? choices.find(o => o.toLowerCase().includes(model)) ?? model
  )
}

/** The value to write for an effort level, spelled as the row's own option when it lists one. */
export function effortValue(row: Row, effort: Effort): string {
  return (row.options ?? []).find(o => o.toLowerCase() === effort) ?? effort
}
