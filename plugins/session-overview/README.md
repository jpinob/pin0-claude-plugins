# session-overview

A Claude Code mod that keeps a small pane next to the chat with what I kept checking by hand: which model and effort I'm on, what the session has cost, how full the context window is, and how much of the 5-hour and weekly limits is left.

```
▾ 1  📊 SESSION
  🤖 Model            Opus 5.5
  ⚡ Effort       high ▰▰▰▱▱
  💰 Cost                $1.84
  🕒 Time             00:42:17
▾ 2  🧭 WORKSPACE
  📁 Folder            my-app
  📦 Repo         acme/my-app
  🌿 Branch        feat/login
  🌳 Worktree         primary
▾ 3  🧠 CONTEXT        🟡 HIGH
  ██████████████████┃░░░░░░░░
                            ▲
  72% used           28% free
  ┃ /compact 70% · ▲ auto 97%
  💡 Consider /compact now
▾ 4  🚦 LIMITS
  ⌛ 5-hour 28% used, resets in 3h 12m
  📅 Weekly 92% used, resets in 2d 5h
```

## Install

Type this at the Claude Code prompt:

```text
/plugin install session-overview --marketplace jpinob/pin0-claude-plugins
```

Answer `y` to add the marketplace, then pick a scope. To try it for one session from a clone of the repository, without installing anything:

```bash
claude --plugin-dir plugins/session-overview
```

## Using it

- The pane opens by itself when the terminal is in fullscreen and wide enough (about 144 columns). Below that, type `/overview` to open or close it.
- Each card folds to a one-line summary. Click its header, or focus the pane (`ctrl+x` then `tab`), move to the header and press Enter. The pane remembers which cards you folded.
- Colours follow your Claude Code theme. Green is under 70%, yellow from 70%, red from 90%, and every level also carries a word (OK, HIGH, CRITICAL).

## What the context bar marks

- **`┃` (red)**: where it's a good moment to run `/compact`. 70% by default; change it in `/config` under "Suggest /compact at (%)".
- **`▲` (yellow)**: where Claude Code will compact on its own.

## Good to know

- The 5-hour and weekly limits only show on a subscription plan, and only after the first reply of the session.
- Effort is read from each request the main conversation sends, so after you change it with `/effort` the pane catches up on the next reply.
- Repo, branch and worktree come from running `git` in the session's folder, after each Bash command and every 5 seconds. The repo is `owner/name` from the `origin` remote, or the folder name when there is no remote.
- In the terminal everything is one font size. The desktop app draws labels and details smaller.

## Development

If you change the code, check it from the mod's folder with:

```
claude plugin test .
claude plugin validate .
```
