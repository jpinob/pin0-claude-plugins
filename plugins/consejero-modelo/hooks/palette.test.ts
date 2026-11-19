// The pane's fixed colours in VS Code are text, so every one needs 4.5:1, the heart's red included (the signature
// only asks 3:1 of it). Backgrounds: VS Code's default dark and light editors, and the signature test's own pairs.
import { expect, test } from 'claude-code/testing'

import { contrast } from './contrast'
import { paneColors } from './palette'

test('in VS Code every pane colour passes 4.5:1 on its theme backgrounds', () => {
  for (const [theme, backgrounds] of [['dark', ['#1E1E1E', '#000000']], ['light', ['#FFFFFF', '#F5F5F5']]] as const) {
    const colors = paneColors('vscode', theme)
    for (const bg of backgrounds) for (const color of Object.values(colors)) expect(contrast(color, bg)).toBeGreaterThanOrEqual(4.5)
  }
})

test('everywhere else the pane keeps the theme keys, which follow the person theme', () => {
  for (const surface of ['terminal', 'desktop', 'mobile']) {
    expect(paneColors(surface, 'light')).toEqual({ required: 'error', specify: 'warning', optional: 'success', action: 'success', alarm: 'error' })
  }
  // A light theme in VS Code takes the light set: the dark yellow would read 1.2:1 on white.
  expect(paneColors('vscode', 'light-daltonized').specify).toBe('#8A6A00')
})
