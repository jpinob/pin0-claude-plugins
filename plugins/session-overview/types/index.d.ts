/** Where the session is working: its folder, and its git checkout when there is one. */
export type Workspace = {
  /** The session's directory, absolute. */
  cwd: string
  /** The last segment of `cwd`. */
  folder: string
  /** Absent outside a git repository. */
  git?: {
    /** `owner/name` from the `origin` remote, else the main checkout's folder name. */
    repo: string
    /** The checked-out branch; absent on a detached HEAD. */
    branch?: string
    /** Short commit id, shown when HEAD is detached. */
    head?: string
    /** The linked worktree's folder name; absent in the primary checkout. */
    worktree?: string
  }
}

declare module 'claude-code' {
  interface PluginState {
    'session-overview': {
      workspace: Workspace | null
      /** The effort the last main-loop model request was sent with; null before one. */
      effort: string | number | null
      /** Ids of the cards the person folded; kept across sessions in `$.store`. */
      collapsed: string[]
      /** Tokens at which auto-compaction runs; null when it is off or not read yet. */
      autoCompactAt: number | null
    }
  }
}
