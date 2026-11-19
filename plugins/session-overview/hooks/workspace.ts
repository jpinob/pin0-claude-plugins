import type { EngineInterface } from 'claude-code'

import type { Workspace } from '../types'

const GIT_TIMEOUT_MS = 5_000

const normalize = (path: string) => path.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()

export const lastSegment = (path: string): string => {
  const parts = path.replace(/[\\/]+$/, '').split(/[\\/]/)

  return parts[parts.length - 1] || path
}

/**
 * `owner/name` from a remote URL in any of git's spellings:
 * `https://github.com/owner/name.git`, `git@github.com:owner/name.git`, `ssh://host/owner/name`.
 */
export const repoFromRemote = (url: string | undefined): string | undefined => {
  const match = url?.trim().match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/)

  return match ? `${match[1]}/${match[2]}` : undefined
}

/**
 * Builds the workspace from git's answers. `paths` is the output of
 * `git rev-parse --path-format=absolute --show-toplevel --git-dir --git-common-dir`;
 * undefined when the folder is not inside a repository. `remote` is the
 * `origin` URL, undefined when there is none.
 */
export const parseWorkspace = (
  cwd: string,
  paths: string | undefined,
  branch: string,
  head: string,
  remote?: string,
): Workspace => {
  const workspace: Workspace = { cwd, folder: lastSegment(cwd) }
  const [topLevel, gitDir, commonDir] = (paths ?? '').split(/\r?\n/)
  if (!topLevel || !gitDir || !commonDir) return workspace

  // Reason: a linked worktree has its own git dir under the shared one; the primary checkout's are the same.
  const isLinked = normalize(gitDir) !== normalize(commonDir)
  const name = branch.trim()
  // Reason: the common dir is `<main checkout>/.git`, so its parent names the repo from any worktree.
  const mainRoot = /[\\/]\.git[\\/]?$/.test(commonDir.trim()) ? commonDir.trim().replace(/[\\/]\.git[\\/]?$/, '') : commonDir
  const repo = repoFromRemote(remote) ?? lastSegment(mainRoot)

  return {
    ...workspace,
    git: {
      repo,
      ...(name ? { branch: name } : { head: head.trim() || undefined }),
      ...(isLinked ? { worktree: lastSegment(topLevel) } : {}),
    },
  }
}

// Function declarations, not arrows: the engine follows `$` across files only into those.
async function git($: EngineInterface, cwd: string, args: string[]) {
  try {
    const run = await $.process.run(['git', ...args], { cwd, timeoutMs: GIT_TIMEOUT_MS })

    return run.exitCode === 0 ? run.stdout : undefined
  } catch {
    // git missing or too slow: the pane shows the folder alone.
    return undefined
  }
}

export async function readWorkspace($: EngineInterface): Promise<Workspace> {
  const cwd = await $.session.cwd()
  const paths = await git($, cwd, [
    'rev-parse',
    '--path-format=absolute',
    '--show-toplevel',
    '--git-dir',
    '--git-common-dir',
  ])
  if (paths === undefined) return parseWorkspace(cwd, undefined, '', '')

  const remote = await git($, cwd, ['remote', 'get-url', 'origin'])

  const branch = (await git($, cwd, ['branch', '--show-current'])) ?? ''
  // Only a detached HEAD needs the commit id; a repo with no commits yet has none.
  const head = branch.trim() ? '' : ((await git($, cwd, ['rev-parse', '--short', 'HEAD'])) ?? '')

  return parseWorkspace(cwd, paths, branch, head, remote)
}
