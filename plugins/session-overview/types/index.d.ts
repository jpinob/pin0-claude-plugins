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

/** How the session first touched a file: it wrote a new one, or changed one that was there. */
export type FileChange = 'created' | 'modified'

/** One file a file tool (Write, Edit, NotebookEdit) wrote during the session. */
export type SessionFile = {
  /** The path as the tool got it, absolute. */
  path: string
  /** Set by the first write; a file the session created stays `created`. */
  change: FileChange
  /** How many successful writes the session made to it. */
  edits: number
  /** When the last write finished, in epoch milliseconds. */
  lastAt: number
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
      /** The value of the /config "theme" row, so the signature takes the colours of the theme. */
      theme: string
      /** Files the session created or modified, newest first. */
      files: SessionFile[]
    }
  }
}
