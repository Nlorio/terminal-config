# bb (agentic IDE) configuration

Everything customizing bb lives here. `./setup.sh` bootstraps a new machine
(theme symlink + activation, keyboard overrides, plugin installs).

## Layout

- `theme/tiki-love-dark/` — custom app palette (Ghostty Tiki Love Dark port;
  dark faithful, light derived cream, full ANSI terminal palette).
  Symlinked into `~/.bb/theme/`; edit and re-run `bb theme set tiki-love-dark`.
- `keyboard-overrides.json` — tmux-flavored pane chords
  (ctrl+alt+z zoom, ctrl+alt+x kill, ctrl+alt+o cycle, ctrl+alt+1-8 select).
  Export of `bb settings keyboard list --json | .overrides`.
- `plugins/` — custom plugins, **path-installed** (bb loads them live from
  here; edit + `bb plugin reload <id>`):
  - `bb-plugin-worktrees` — worktree ↔ thread dashboard: every git worktree
    (bb-managed and external, e.g. orca) with project, last-touched staleness,
    and adopt/cleanup actions; stale-while-revalidate scanning.
  - `bb-plugin-pr-inbox` — Graphite-style PR inbox for notion-next/notion-data
    (gh-backed; sectioned review queue split by direct vs team request,
    reviewer avatars, stack position from base-branch chains, CI + diff size,
    deploy-console links, `bb pr-inbox list|sync` CLI, 5-min sync cron).
    Replaces both the official github plugin (its sync breaks on repos with
    issues disabled) and the earlier `notion-ci` plugin, removed 2026-08-10.
  - `bb-plugin-activity-monitor` — resource manager: process tree grouped by
    project/worktree with rollups + sparklines, flat view, kill actions.
  - `bb-plugin-quickstart` — one-click thread presets: tmux, dev server, and
    nvim terminals plus a localhost browser tab.
  - `bb-plugin-nvim-opener` — fileOpener: code files open in a bb terminal
    running nvim in the file's worktree.
  - `bb-plugin-boxy-prefix` — prefixes thread titles with "boxy - " when the
    thread runs on a boxy host.

## Not in this repo (bb server state, `~/.bb/bb.db`)

Theme *selection*, keyboard overrides (this repo holds the export), plugin
settings (`bb plugin config <id>`), projects/threads/terminals.
