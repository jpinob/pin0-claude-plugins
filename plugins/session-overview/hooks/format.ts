// Pure formatting helpers for the session overview pane. No engine calls here,
// so every function is testable on its own.

export type Level = 'ok' | 'high' | 'critical'

const HIGH_AT = 70
const CRITICAL_AT = 90

export const levelOf = (percent: number): Level =>
  percent >= CRITICAL_AT ? 'critical' : percent >= HIGH_AT ? 'high' : 'ok'

// Theme keys, so the colours follow the person's Claude Code theme.
export const LEVEL_COLOR: Record<Level, string> = {
  ok: 'success',
  high: 'warning',
  critical: 'error',
}

// Reason: colour alone must never carry the meaning, so each level has a word.
export const LEVEL_LABEL: Record<Level, string> = {
  ok: 'OK',
  high: 'HIGH',
  critical: 'CRITICAL',
}

export const LEVEL_ICON: Record<Level, string> = {
  ok: '🟢',
  high: '🟡',
  critical: '🔴',
}

export const clampPercent = (percent: number): number =>
  Math.min(100, Math.max(0, percent))

/** Splits `width` cells into filled and empty counts for `percent`. */
export const barCells = (percent: number, width: number): { filled: number; empty: number } => {
  const cells = Math.max(1, Math.floor(width))
  const filled = Math.round((clampPercent(percent) / 100) * cells)

  return { filled, empty: cells - filled }
}

/** `claude-opus-5-5[1m]` -> `Opus 5.5 · 1M`; unknown shapes come back as given. */
export const prettyModel = (id: string): string => {
  const isLongContext = /\[1m\]$/i.test(id)
  const base = id.replace(/\[[^\]]*\]$/, '').replace(/^claude-/, '')
  const [family, ...rest] = base.split('-')
  if (!family || !/^[a-z]+$/i.test(family)) return id

  // Reason: dated ids (`sonnet-4-5-20250929`) end in an 8-digit stamp that is not part of the version.
  const version = rest.filter(part => /^\d{1,2}$/.test(part)).join('.')
  const name = family[0]!.toUpperCase() + family.slice(1)
  const label = version ? `${name} ${version}` : name

  return isLongContext ? `${label} · 1M` : label
}

/** 460000 -> `460k`, 1000000 -> `1M`, 1500 -> `1.5k`. */
export const compactTokens = (tokens: number): string => {
  const trim = (value: number) => value.toFixed(1).replace(/\.0$/, '')
  if (tokens >= 1_000_000) return `${trim(tokens / 1_000_000)}M`
  if (tokens >= 1_000) return `${trim(tokens / 1_000)}k`

  return String(Math.round(tokens))
}

export const usd = (amount: number): string => `$${amount.toFixed(2)}`

const pad2 = (value: number) => String(value).padStart(2, '0')

/** Elapsed time as `HH:MM:SS`, with a day prefix past 24 hours. */
export const clockTime = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60
  const time = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`

  return days > 0 ? `${days}d ${time}` : time
}

/** Time left as the two largest units: `2d 5h`, `3h 12m`, `12m 30s`. */
export const countdown = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(total / 86_400)
  const hours = Math.floor((total % 86_400) / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const seconds = total % 60

  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`

  return `${seconds}s`
}

/** Milliseconds from `now` until an ISO timestamp; undefined when it does not parse. */
export const msUntil = (iso: string | undefined, now: number): number | undefined => {
  if (!iso) return undefined
  const at = Date.parse(iso)

  return Number.isNaN(at) ? undefined : at - now
}

/** One decimal at most, and none when it is a whole number: 23.5, 7. */
export const percentText = (percent: number): string =>
  `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`

export const freePercent = (used: number): number =>
  Math.round((100 - clampPercent(used)) * 10) / 10

const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const

/** `high` -> `high ▰▰▰▱▱`; a numeric budget or an unknown name is shown as given. */
export const prettyEffort = (effort: string | number): string => {
  const step = EFFORT_LEVELS.indexOf(String(effort).toLowerCase() as (typeof EFFORT_LEVELS)[number])
  if (step < 0) return String(effort)

  return `${EFFORT_LEVELS[step]} ${'▰'.repeat(step + 1)}${'▱'.repeat(EFFORT_LEVELS.length - step - 1)}`
}

export type BarMarker = { at: number; char: string; color: string }
export type BarSegment = { text: string; color: string; isMarker?: true }

// A marker over a filled cell of its own colour would vanish; it takes this one instead.
const MARKER_FALLBACK_COLOR = 'text'

/** The cell a percentage lands on in a bar of `cells`, kept inside the bar at 100%. */
export const markerIndex = (at: number, cells: number): number =>
  Math.min(cells - 1, Math.max(0, Math.round((clampPercent(at) / 100) * cells)))

/**
 * The bar as runs of one colour each, with each marker drawn over the cell
 * at its percentage: the filled part in `fill`, the rest in `rest`.
 */
export const barSegments = (
  percent: number,
  width: number,
  markers: readonly BarMarker[],
  fill: string,
  rest: string,
): BarSegment[] => {
  const { filled, empty } = barCells(percent, width)
  const cells: BarSegment[] = [
    ...Array.from({ length: filled }, () => ({ text: '█', color: fill })),
    ...Array.from({ length: empty }, () => ({ text: '░', color: rest })),
  ]
  for (const marker of markers) {
    const index = markerIndex(marker.at, cells.length)
    const under = cells[index]!
    const color = under.text === '█' && under.color === marker.color ? MARKER_FALLBACK_COLOR : marker.color
    cells[index] = { text: marker.char, color, isMarker: true }
  }

  return cells.reduce<BarSegment[]>((runs, cell) => {
    const last = runs[runs.length - 1]
    if (last && last.color === cell.color && last.isMarker === cell.isMarker) last.text += cell.text
    else runs.push({ ...cell })

    return runs
  }, [])
}
