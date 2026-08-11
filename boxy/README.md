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

## Conventions

Sessions are named after the boxy/branch name, so they group predictably in
the tmux session picker (`<prefix> s`).
