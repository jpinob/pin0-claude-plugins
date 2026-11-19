// The pane's colours by surface. Pure. Reason: the VS Code extension draws no theme colour keys (seen by Javi on
// 0.7.5: tags in grey, Usar without green), while the signature's fixed colours showed; so there the pane takes
// the signature's own sets, which hooks/palette.test.ts measures against VS Code's backgrounds.
import type { Level } from '../types'
import { signatureColors } from './signature'

/** The colours the pane paints with: a tag level, the main action's green, and the warning red. */
export type PaneColors = Record<Level, string> & { action: string; alarm: string }

// Reason: theme keys follow the person's light or dark theme, so the contrast is the theme's, not a fixed hex.
const THEME_KEYS: PaneColors = { required: 'error', specify: 'warning', optional: 'success', action: 'success', alarm: 'error' }

/** The theme keys everywhere but VS Code; there, the signature's set for the /config theme. */
export function paneColors(surface: string, theme: unknown): PaneColors {
  if (surface !== 'vscode') return THEME_KEYS
  const set = signatureColors(theme)
  return { required: set.heart, specify: set.a, optional: set.zero, action: set.zero, alarm: set.heart }
}
