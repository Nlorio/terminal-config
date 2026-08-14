# boxy — Notion Boxy workstream helpers

A self-contained zsh module for running **Notion Boxy** (cloud dev
environment) workstreams from tmux. Take this one directory — nothing else in
this repo is required.

## What it does

- **`gwb <name>`** — create (or reattach to) a boxy workstream: a local tmux
  session named `<name>` that runs `notion boxy create <name>`. The create
  command provisions the remote env and attaches to its tmux, nested inside
  the local session, so you orchestrate on the boxy directly. The remote side
  survives SSH drops and laptop sleep; re-run `gwb <name>` to reconnect (or
  `notion boxy ssh <name>` from any machine).
- **`gwbr <name>`** — tear down: kill the local tmux session, then confirm
  before `notion boxy destroy <name>` (irreversible).

## Install

```zsh
# in your ~/.zshrc / ~/.zsh_profile
source /path/to/boxy/boxy.zsh
```

Requirements: `tmux` and an authenticated `notion` CLI.

### Without cloning the repo

`boxy.zsh` is the only file you need — grab it directly:

```zsh
curl -fsSL https://raw.githubusercontent.com/Nlorio/terminal-config/main/boxy/boxy.zsh -o ~/.config/boxy.zsh
echo 'source ~/.config/boxy.zsh' >> ~/.zshrc
```

Re-run the `curl` to pick up updates.

## Conventions

Sessions are named after the boxy/branch name, so they group predictably in
the tmux session picker (`<prefix> s`).

## Related: bb integration (optional)

This module is pure tmux + `notion` CLI — no bb required. If you also work in
the bb IDE, two independent companions exist:

- **notion-boxy bb plugin** (external, not in this repo) — boxy viewer plus
  agent-facing MCP tools (`list_boxes`, `create_box`, `agent_status`, …).
  Install it from its own source; neither it nor this module depends on the
  other.
- **`bb-plugin-boxy-prefix`** (in this repo under `bb/plugins/`) — cosmetic:
  prefixes bb thread titles with `boxy - ` when the thread runs on a boxy
  host. Comes along if you adopt the full bb config via `bb/setup.sh`.

### `bin/` — bb machine enrollment scripts

`boxy/bin/` holds the laptop-side scripts the notion-boxy bb plugin's
"Enroll in bb" button shells out to (symlinked into `~/.local/bin` by
`make link`):

- **`bb-boxy-up <name>`** — create the boxy if needed, install `bb-app` in
  the box, stage a one-shot bb join code, start the reverse-tunnel
  supervisor, and register `/work/notion-next` as a bb project source.
  Idempotent.
- **`bb-boxy-tunnel <name>`** — the supervisor `bb-boxy-up` launches: keeps
  an ssh `-R 0` reverse tunnel to the laptop's bb server alive (fresh remote
  port per attempt; the boxy ssh-proxy leaks listeners) and (re)starts the
  in-box `bb-host-daemon` on each cycle.
- **`bb-boxy-down <name> [--destroy]`** — tear down the tunnel and machine
  entry (optionally destroy the boxy).

Gotcha these scripts encode: `notion boxy ssh` does **not** propagate remote
exit codes (always exits 0), so all remote condition checks echo a stdout
marker and grep for it instead of branching on exit status.
