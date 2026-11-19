// The pane's footer: "made with ♥ and Ai by Pin0". Javi's signature, not configurable.
// Copied from flujo-plan's firma.tsx and paleta.tsx (the reference implementation); only the names are in English.
import type { EngineInterface } from 'claude-code'

export const SIGNATURE_FULL = 'made with ♥ and Ai by Pin0'
export const SIGNATURE_SHORT = '♥ Ai Pin0'

/** The coloured letters of the signature: the heart, the A, the i and the 0 of Pin0. */
export type SignatureColors = { heart: string; a: string; i: string; zero: string }

// Reason: the bright yellow and electric blue only read on a dark background (1.2:1 on white),
// and the dark green only on a light one, so each theme has its own set. The signature test measures all eight.
export const DARK: SignatureColors = { heart: '#ff6b7d', a: '#FCEE22', i: '#7DF9FF', zero: '#6FCF3A' }
export const LIGHT: SignatureColors = { heart: '#C2185B', a: '#8A6A00', i: '#00727A', zero: '#2f5d08' }

/** The set for the value of the /config "theme" row; anything else gives the dark one. */
export const signatureColors = (theme: unknown): SignatureColors =>
  typeof theme === 'string' && theme.startsWith('light') ? LIGHT : DARK

// Reason: ♥ (U+2665) is ambiguous width: one or two columns depending on the terminal. One spare column
// keeps the row from wrapping at the edge.
const FULL_WIDTH = SIGNATURE_FULL.length + 1

// Javi's heart, with the set's colour in place of currentColor: an Svg is drawn on its own and inherits no colour.
const HEART_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.1 19c-3.9-2.9-6.6-5.6-7-8.5-.3-2.3 1.1-4.1 3.2-4.3 1.6-.2 2.9.6 3.7 2 .7-1.5 2.1-2.4 3.7-2.3 2.1.1 3.7 1.9 3.4 4.2-.4 2.9-3.2 5.8-7 8.9z" fill="currentColor" opacity="0.14" stroke="none"></path><path d="M12.1 20.2c-4.5-3.3-7.8-6.4-8.3-9.8-.4-2.8 1.3-5.1 3.9-5.4 1.9-.2 3.5.8 4.4 2.5.8-1.8 2.5-2.9 4.4-2.8 2.6.2 4.4 2.4 4 5.2-.5 3.4-3.9 6.7-8.4 10.3z"></path></svg>'

/** The heart SVG painted in `color` (a #RRGGBB of the set, never outside text). */
export const heartSvg = (color: string) => HEART_SVG.replaceAll('currentColor', color)

type Table = ReturnType<EngineInterface['ui']['resolve']>
/** The pieces the signature draws with. `Svg` only exists off the terminal (desktop, mobile, vscode). */
export interface SignaturePieces {
  Box: Table['Box']
  Text: Table['Text']
  Svg?: Extract<Table, { Svg: unknown }>['Svg']
}

/**
 * The signature as a footer row: the full one when it fits, else the short one; never empty for width.
 * Off the terminal the heart is the SVG, whose alt text "love" is what a screen reader says.
 */
export function drawSignature({ Box, Text, Svg }: SignaturePieces, colors: SignatureColors, width: number) {
  const full = width >= FULL_WIDTH
  const dim = (t: string) => <Text color="text" dimColor>{t}</Text>
  const heart = Svg ? <Svg source={heartSvg(colors.heart)} alt="love" width={12} height={12} /> : <Text color={colors.heart}>♥</Text>
  return (
    <Box justifyContent="center">
      {full ? dim('made with ') : null}
      {heart}
      {dim(full ? ' and ' : ' ')}
      <Text color={colors.a}>A</Text>
      <Text color={colors.i}>i</Text>
      {dim(full ? ' by Pin' : ' Pin')}
      <Text color={colors.zero}>0</Text>
    </Box>
  )
}
