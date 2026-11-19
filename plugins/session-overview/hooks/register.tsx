import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import type { BarMarker } from './format'

import {
  LEVEL_COLOR,
  LEVEL_ICON,
  LEVEL_LABEL,
  barSegments,
  markerIndex,
  clockTime,
  compactTokens,
  countdown,
  freePercent,
  levelOf,
  msUntil,
  percentText,
  prettyEffort,
  prettyModel,
  usd,
} from './format'
import { drawSignature, signatureColors } from './signature'
import { fileListBody, filesSummary, fileToolPath, noteFileChange } from './files'
import { lastSegment, readWorkspace } from './workspace'

const PANE = 'session-overview'
const TITLE = 'Session overview'
const COMMAND = 'overview'
// Body columns the dock is asked for: room for a 26-cell bar inside the frames.
const PANE_COLUMNS = 34
const TICK_MS = 1_000
// Reason: the theme's dim grey read too dark in the pane, so secondary text uses a lighter grey.
const MUTED_COLOR = '#BDBDBD'
// git is asked this often as a fallback; Bash and worktree tools also trigger a read.
const WORKSPACE_POLL_MS = 5_000
const WORKSPACE_TOOLS = new Set(['Bash', 'EnterWorktree', 'ExitWorktree'])
// Where the pane suggests a manual /compact unless the `compactAt` option says otherwise.
const COMPACT_AT_DEFAULT = 70
// The auto-compact point rarely moves; a local estimate is read this often.
const AUTO_COMPACT_POLL_MS = 30_000

const workspace = atom({ plugin: 'session-overview', key: 'workspace' } as const, null)
const effort = atom({ plugin: 'session-overview', key: 'effort' } as const, null)
const collapsed = atom({ plugin: 'session-overview', key: 'collapsed' } as const, [])
const COLLAPSED_STORE_KEY = 'collapsed'
const autoCompactAt = atom({ plugin: 'session-overview', key: 'autoCompactAt' } as const, null)
const theme = atom({ plugin: 'session-overview', key: 'theme' } as const, '')

/** Reads the /config "theme" row into state, so the signature takes the theme's colour set. */
async function refreshTheme($: EngineInterface) {
  const row = (await $.config.list()).find(r => r.key === 'theme')
  await update($, theme, () => (typeof row?.value === 'string' ? row.value : ''))
}
// Reason: the scan lists state per file, so each file that reads or writes a value declares its own atom.
const files = atom({ plugin: 'session-overview', key: 'files' } as const, [])

// `summary` estimates the breakdown locally, so this sends no request.
async function readAutoCompact($: EngineInterface) {
  const { context } = await $.session.usage({ breakdown: 'summary' })
  const breakdown = context.breakdown
  const tokens = breakdown?.isAutoCompactEnabled ? (breakdown.autoCompactThreshold ?? null) : null
  await update($, autoCompactAt, current => (current === tokens ? current : tokens))
}

// The folded cards live in the session state for redraws and in the store across sessions.
async function loadCollapsed($: EngineInterface) {
  const saved = await $.store.get(COLLAPSED_STORE_KEY)
  if (!Array.isArray(saved)) return
  const ids = saved.filter((id): id is string => typeof id === 'string')
  await update($, collapsed, () => ids)
}

async function toggleCard($: EngineInterface, id: string) {
  const next = await update($, collapsed, list =>
    list.includes(id) ? list.filter(one => one !== id) : [...list, id],
  )
  await $.store.set(COLLAPSED_STORE_KEY, next)
}

// Before the first model request, the /config menu's effort row is the best guess.
async function readConfiguredEffort($: EngineInterface) {
  const rows = await $.config.list()
  const value = rows.find(row => /effort/i.test(row.key))?.value
  if (typeof value !== 'string' && typeof value !== 'number') return
  await update($, effort, current => current ?? value)
}

async function refreshWorkspace($: EngineInterface) {
  const next = await readWorkspace($)
  // Reason: writing an unchanged value would redraw the pane for nothing.
  await update($, workspace, current =>
    JSON.stringify(current) === JSON.stringify(next) ? current : next,
  )
}

type Meter = {
  title: string
  // Undefined while the engine has no reading for this window yet.
  percent?: number
  detail?: string
  emptyHint: string
  markers?: BarMarker[]
  // A dim line that says what the markers mean.
  legend?: string
  // A call to action drawn in the warning colour.
  hint?: string
  // A ▲ on its own line under the bar, pointing up at a percentage.
  pointer?: number
}

const findLimit = (limits: readonly SessionRateLimit[], kind: string) =>
  limits.find(limit => limit.kind === kind)

const limitDetail = (limit: SessionRateLimit | undefined, now: number) => {
  const left = msUntil(limit?.resetsAt, now)
  if (left === undefined) return undefined

  return left > 0 ? `resets in ${countdown(left)}` : 'resetting now'
}

export const register: Register = (on, options) => {
  const configured = Number(options.compactAt ?? COMPACT_AT_DEFAULT)
  const compactAt = Number.isFinite(configured) ? Math.min(99, Math.max(1, configured)) : COMPACT_AT_DEFAULT

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Show or hide the session overview pane',
    })
    void $.ui.open({ id: PANE, title: TITLE, columns: PANE_COLUMNS })
    // Reason: session time and reset countdowns move every second without any usage event.
    $.clock.every(TICK_MS, () => $.ui.invalidate('ui.render'))
    void refreshWorkspace($)
    void readConfiguredEffort($).catch(() => undefined)
    void loadCollapsed($).catch(() => undefined)
    void readAutoCompact($).catch(() => undefined)
    void refreshTheme($).catch(() => undefined)
    $.clock.every(AUTO_COMPACT_POLL_MS, () => void readAutoCompact($).catch(() => undefined))
    $.clock.every(WORKSPACE_POLL_MS, () => void refreshWorkspace($))

    return next(e)
  })

  // A new theme changes the signature's colour set at once.
  on('config.set', async ($, e, next) => {
    const result = await next(e)
    if (e.key === 'theme' && !('deny' in result)) await update($, theme, () => (typeof e.value === 'string' ? e.value : ''))

    return result
  })

  on('session.measure', async ($, e, next) => {
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const path = fileToolPath(e.tool, e as Readonly<Record<string, unknown>>)
    // Reason: whether the file was there before the write tells "created" from "modified".
    const existed = path === undefined ? true : await $.fs.exists(path).catch(() => true)
    const result = await next(e)
    if (WORKSPACE_TOOLS.has(e.tool)) void refreshWorkspace($)
    if (path !== undefined && result.deny === undefined && !result.isError) void noteFileChange($, path, existed)

    return result
  })

  // Reason: the engine only exposes the effort on each request, so the pane shows the last one sent.
  on('turn.step', async function* ($, e, next) {
    const sent = e.effort
    if (e.agentId === undefined && sent !== undefined) {
      void update($, effort, current => (current === sent ? current : sent))
    }

    return yield* next(e)
  })

  on('command.run', { command: COMMAND }, async $ => {
    const isOpen = (await $.ui.panes()).some(pane => pane.id === PANE)
    if (isOpen) {
      await $.ui.close({ id: PANE })

      return { text: 'Session overview closed.' }
    }
    await $.ui.open({ id: PANE, title: TITLE, columns: PANE_COLUMNS })

    return { text: 'Session overview opened.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const pieces = $.ui.resolve(e)
    const { Box, Button, Text } = pieces
    // Reason: the terminal's table also has an Svg key but draws nothing there, so the surface decides.
    const Svg = e.surface !== 'terminal' && 'Svg' in pieces ? pieces.Svg : undefined
    const [usage, model, now, place, level, folded, autoTokens, themeName, touched] = await Promise.all([
      $.session.usage(),
      $.session.model(),
      $.clock.now(),
      read($, workspace),
      read($, effort),
      read($, collapsed),
      read($, autoCompactAt),
      read($, theme),
      read($, files),
    ])
    // Two border cells and two padding cells sit around each bar.
    const barWidth = Math.max(8, (e.props.bodyColumns ?? PANE_COLUMNS) - 4)
    const { context, rateLimits } = usage
    const fiveHour = findLimit(rateLimits, 'five_hour')
    const weekly = findLimit(rateLimits, 'seven_day')

    // Reason: the bar is tokens over the full window, so the auto-compact point is placed on that same scale.
    function compactGuide(): Pick<Meter, 'markers' | 'legend' | 'hint' | 'pointer'> {
      const autoAt = autoTokens === null ? undefined : (autoTokens / context.window) * 100
      const markers: BarMarker[] = [{ at: compactAt, char: '┃', color: 'error' }]
      // Reason: auto-compact sits near 100%, where a mark inside the bar would be lost against the frame.
      const legend = `┃ /compact ${compactAt}%${autoAt === undefined ? '' : ` · ▲ auto ${Math.round(autoAt)}%`}`
      const isPast = (context.percent ?? 0) >= compactAt

      return { markers, legend, pointer: autoAt, hint: isPast ? '💡 Consider /compact now' : undefined }
    }

    const contextMeter: Meter = {
      title: '🧠 CONTEXT WINDOW',
      percent: context.percent,
      detail:
        context.tokens === undefined
          ? undefined
          : `${compactTokens(context.tokens)} / ${compactTokens(context.window)} tokens`,
      emptyHint: 'Shows after the first reply.',
      ...compactGuide(),
    }
    const limitMeters: Meter[] = [
      {
        title: '⌛ 5-hour',
        percent: fiveHour?.percentUsed,
        detail: limitDetail(fiveHour, now),
        emptyHint: 'Subscription plans only.',
      },
      {
        title: '📅 Weekly',
        percent: weekly?.percentUsed,
        detail: limitDetail(weekly, now),
        emptyHint: 'Subscription plans only.',
      },
    ]
    const hasLimits = limitMeters.some(limit => limit.percent !== undefined)

    // A card's frame takes the colour of its worst meter, grey with no reading.
    const frameColor = (list: Meter[]) => {
      const worst = Math.max(...list.map(meter => meter.percent ?? -1))

      return worst < 0 ? 'subtle' : LEVEL_COLOR[levelOf(worst)]
    }

    const row = (label: string, value: string) => (
      <Box justifyContent="space-between" columnGap={1}>
        <Box flexShrink={0}>
          <Text color={MUTED_COLOR} size="footnote">
            {label}
          </Text>
        </Box>
        <Text weight="bold" tabular wrap="truncate-middle">
          {value}
        </Text>
      </Box>
    )

    // Long branch names are cut in the middle so both ends stay readable.
    const repo = place?.git
    const branchText = !repo
      ? 'reading…'
      : (repo.branch ?? (repo.head ? `detached @ ${repo.head}` : 'no commits yet'))
    const worktreeText = !repo ? 'reading…' : (repo.worktree ?? 'primary')

    const chip = (percent: number) => {
      const level = levelOf(percent)

      return (
        <Text color={LEVEL_COLOR[level]} weight="bold" size="footnote">
          {LEVEL_ICON[level]} {LEVEL_LABEL[level]}
        </Text>
      )
    }

    // The bar, the used and free split and the detail line of one reading.
    const meterRows = (meter: Meter) => {
      if (meter.percent === undefined) {
        return (
          <Box flexDirection="column">
            <Text color={MUTED_COLOR} size="footnote">
              No reading yet.
            </Text>
            <Text color={MUTED_COLOR} size="footnote" wrap="wrap">
              {meter.emptyHint}
            </Text>
          </Box>
        )
      }
      const color = LEVEL_COLOR[levelOf(meter.percent)]
      const segments = barSegments(meter.percent, barWidth, meter.markers ?? [], color, 'subtle')

      return (
        <Box flexDirection="column">
          <Text>
            {segments.map(segment => (
              // Reason: a bold marker cut the colour of the run after it in the terminal, so markers rely on colour and glyph.
              <Text color={segment.color}>{segment.text}</Text>
            ))}
          </Text>
          {meter.pointer !== undefined && (
            <Box marginLeft={markerIndex(meter.pointer, barWidth)}>
              <Text color="warning">▲</Text>
            </Box>
          )}
          <Box justifyContent="space-between">
            <Text color={color} weight="bold" tabular>
              {percentText(meter.percent)} used
            </Text>
            <Text tabular size="footnote">
              {percentText(freePercent(meter.percent))} free
            </Text>
          </Box>
          {meter.detail !== undefined && (
            <Text color={MUTED_COLOR} tabular size="footnote">
              {meter.detail}
            </Text>
          )}
          {meter.legend !== undefined && (
            <Text color={MUTED_COLOR} size="footnote">
              {meter.legend}
            </Text>
          )}
          {meter.hint !== undefined && (
            <Text color="warning" weight="bold">
              {meter.hint}
            </Text>
          )}
        </Box>
      )
    }

    type Card = {
      id: string
      number: string
      title: string
      color: string
      // `open` is drawn right of the title while the card is open, `folded` while it is folded.
      aside: { open?: JSX.Element; folded: string }
      body: JSX.Element
    }

    // Reason: the header is a Button so a click or Enter folds the card. It takes no `hotkey`: the engine
    // draws that digit in its accent colour, unreadable on some backgrounds, so the number is drawn here.
    const card = ({ id, number, title, color, aside, body }: Card) => {
      const isOpen = !folded.includes(id)

      return (
        <Box flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
          <Box justifyContent="space-between" columnGap={1}>
            <Box flexShrink={0}>
              <Button key={`toggle-${id}`} plain onPress={() => void toggleCard($, id)}>
                {isOpen ? '▾' : '▸'} <Text color={MUTED_COLOR}>{number}</Text> <Text weight="bold">{title}</Text>
              </Button>
            </Box>
            {isOpen ? (
              aside.open
            ) : (
              <Text color={MUTED_COLOR} tabular wrap="truncate-end">
                {aside.folded}
              </Text>
            )}
          </Box>
          {isOpen && body}
        </Box>
      )
    }

    const cost = usage.cost ? usd(usage.cost.usd) : 'n/a'
    const limitsSummary = limitMeters
      .map(meter => (meter.percent === undefined ? '–' : `${Math.round(meter.percent)}%`))
      .join(' · ')

    const cards: Card[] = [
      {
        id: 'session',
        number: '1',
        title: '📊 SESSION',
        color: 'claude',
        aside: { folded: `${prettyModel(model)} · ${cost}` },
        body: (
          <Box flexDirection="column">
            {row('🤖 Model', prettyModel(model))}
            {row('⚡ Effort', level === null ? 'n/a' : prettyEffort(level))}
            {row('💰 Cost', cost)}
            {row('🕒 Time', clockTime(now - usage.startedAt))}
          </Box>
        ),
      },
      {
        id: 'workspace',
        number: '2',
        title: '🧭 WORKSPACE',
        color: 'suggestion',
        aside: { folded: repo ? `${lastSegment(repo.repo)} · ${branchText}` : (place?.folder ?? 'reading…') },
        body: (
          <Box flexDirection="column">
            {row('📁 Folder', place?.folder ?? 'reading…')}
            {place && (
              <Text color={MUTED_COLOR} size="footnote" wrap="truncate-start">
                {place.cwd}
              </Text>
            )}
            {/* Outside a repository, branch and worktree would only repeat it: one row says so. */}
            {place && !repo ? (
              row('📦 Repo', 'not a git repo')
            ) : (
              <Box flexDirection="column">
                {row('📦 Repo', repo ? repo.repo : 'reading…')}
                {row('🌿 Branch', branchText)}
                {row('🌳 Worktree', worktreeText)}
              </Box>
            )}
          </Box>
        ),
      },
      {
        id: 'context',
        number: '3',
        title: '🧠 CONTEXT',
        color: frameColor([contextMeter]),
        aside: {
          open: contextMeter.percent === undefined ? undefined : chip(contextMeter.percent),
          folded: contextMeter.percent === undefined ? 'n/a' : `${percentText(contextMeter.percent)} used`,
        },
        body: meterRows(contextMeter),
      },
      {
        id: 'limits',
        number: '4',
        title: '🚦 LIMITS',
        color: frameColor(limitMeters),
        aside: { folded: hasLimits ? limitsSummary : 'n/a' },
        body: hasLimits ? (
          <Box flexDirection="column" rowGap={1}>
            {limitMeters.map(meter => (
              <Box flexDirection="column">
                <Box justifyContent="space-between">
                  <Text weight="bold">{meter.title}</Text>
                  {meter.percent !== undefined && chip(meter.percent)}
                </Box>
                {meterRows(meter)}
              </Box>
            ))}
          </Box>
        ) : (
          <Text color={MUTED_COLOR} size="footnote" wrap="wrap">
            No reading yet. Subscription plans only, after the first reply.
          </Text>
        ),
      },
      {
        id: 'files',
        number: '5',
        title: '📝 FILES',
        color: touched.length > 0 ? 'claude' : 'subtle',
        aside: { folded: filesSummary(touched) },
        body: fileListBody($, { Box, Button, Text }, touched, place?.cwd, MUTED_COLOR),
      },
    ]

    return (
      <Box flexDirection="column">
        {cards.map(card)}
        {drawSignature({ Box, Text, Svg }, signatureColors(themeName), e.props.bodyColumns ?? PANE_COLUMNS)}
      </Box>
    )
  })
}
