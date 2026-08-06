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
  - `bb-plugin-nvim-opener` — fileOpener: code files open in a bb terminal
    running nvim in the file's worktree.
  - `bb-plugin-notion-ci` — PR + CI dashboard for notion-next/notion-data
    (gh-backed; search, Mine/author filters, status chips, deploy-console
    links, `bb notion-ci prs|sync` CLI, 5-min sync cron). Replaces the
    official github plugin, whose sync breaks on repos with issues disabled.
  - `bb-plugin-activity-monitor` — resource manager: process tree grouped by
    project/worktree with rollups + sparklines, flat view, kill actions.

## Not in this repo (bb server state, `~/.bb/bb.db`)

Theme *selection*, keyboard overrides (this repo holds the export), plugin
settings (`bb plugin config <id>`), projects/threads/terminals.
