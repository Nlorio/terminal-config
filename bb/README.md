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

## Connecting a Boxy as a bb execution machine

bb's built-in Boxy "up / Reconnect" reaches the box over `notion boxy ssh`,
which routes through **SSM**. When a pod runs but never registers in SSM
(`pingStatus: unknown`), every Reconnect fails and the card shows
`bb: offline` / `up failed`. The fix is to stop depending on SSH entirely:
pair bb connect and have the box's daemon dial the public URL.

One-time, on this Mac:

```sh
# claim a handle at https://getbb.app, then run the dashboard's command
bb connect --code <code> --server https://<handle>.getbb.app
```

Per box (all of this works over `sshv2`, i.e. kubectl exec — no SSM):

```sh
BOX=<box-name>
# 1. bb-app needs Node >= 22.19; boxes pin 22.13 for notion-next. Add a newer
#    Node WITHOUT touching the repo pin:
notion boxy sshv2 $BOX --command 'mise install node@24'

# 2. The server's /install/bb-app.tgz 500s on a packaged bb, and the installer
#    treats that as fatal instead of falling back to npm. Pre-install the
#    MATCHING version (see `bb settings version`) so the installer reuses it.
#    Run from $HOME: /work/notion-next pins packageManager=pnpm and breaks npm.
notion boxy sshv2 $BOX --command 'cd $HOME && export PATH="$(mise where node@24)/bin:$PATH" && npm install -g --allow-scripts=@parcel/watcher,better-sqlite3,node-pty,@google/genai,protobufjs bb-app@<server-version>'

# 3. Enroll. joinCode/hostId come from `bb machine join-code --json`;
#    machineCode from the connect plugin (no CLI for it):
#    curl -s -X POST -H 'content-type: application/json' -d 'null' \
#      http://127.0.0.1:38886/api/v1/plugins/connect/rpc/createMachineCode
notion boxy sshv2 $BOX --command "cd \$HOME && export PATH=\"\$(mise where node@24)/bin:\$(npm config get prefix)/bin:\$PATH\"; curl -fsSL https://<handle>.getbb.app/install.sh | sh -s -- --join-code '<join>' --host-id '<host>' --server https://<handle>.getbb.app --machine-code '<machine>'"
```

The installer's last step (systemd `--user`) fails in a pod: no D-Bus session.
Start the daemon with a keepalive wrapper instead — see
`~/bb-daemon-keepalive.sh` on an already-configured box; it re-execs
`bb-app host-daemon --host-daemon-port 38888 --server-url https://<handle>.getbb.app`
with `BB_DATA_DIR=~/.bb-machines/<handle>.getbb.app`, launched via
`setsid nohup`.

Caveats:

- The keepalive survives daemon crashes, **not pod restarts**. After a pod
  recycle, re-run the script over `sshv2`.
- Threads bound to a machine record that gets removed show
  `Host not found` and cannot be revived; their workspace files still exist
  on the box under the old daemon's data dir
  (`~/.bb/personal-workspaces/<env-id>/`) and can be recovered with `git diff`
  over `sshv2`.
- This does not fix `notion boxy ssh` itself. SSM stays broken until the pod
  re-registers; destroy/recreate is the fix if other tooling needs it.

## Not in this repo (bb server state, `~/.bb/bb.db`)

Theme *selection*, keyboard overrides (this repo holds the export), plugin
settings (`bb plugin config <id>`), projects/threads/terminals.
