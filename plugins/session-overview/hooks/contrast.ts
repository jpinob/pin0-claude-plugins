// WCAG 2.x contrast ratio between two #RRGGBB colours: from 1 (equal) to 21 (black on white).
// Pure, no engine: the signature test uses it to measure the signature colours. Copied from consejero-modelo.

// Relative luminance of one sRGB channel from 0 to 255, as WCAG defines it.
function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance of a #RRGGBB (or #RGB) colour. Throws when the text is not such a colour. */
export function luminance(hex: string): number {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)
  if (!m) throw new Error(`not a colour: ${hex}`)
  const h = m[1]!.length === 3 ? m[1]!.split('').map(c => c + c).join('') : m[1]!
  const [r, g, b] = [0, 2, 4].map(i => channel(parseInt(h.slice(i, i + 2), 16)))
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** WCAG contrast ratio between two colours, for example 4.5. The order does not matter. */
export function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}
