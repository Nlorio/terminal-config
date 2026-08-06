#!/usr/bin/env bash
# Bootstrap bb (the agentic IDE) configuration from this repo onto a machine.
# Idempotent: safe to re-run. Requires a running bb server (`bb status`).
set -euo pipefail

BB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Theme (symlink + activate)"
mkdir -p ~/.bb/theme
if [ ! -e ~/.bb/theme/tiki-love-dark ]; then
  ln -s "$BB_DIR/theme/tiki-love-dark" ~/.bb/theme/tiki-love-dark
fi
bb theme set tiki-love-dark --favicon-color orange

echo "==> Keyboard overrides"
python3 - "$BB_DIR/keyboard-overrides.json" <<'EOF' | while read -r command shortcut; do
import json, sys
for o in json.load(open(sys.argv[1])):
    s = o["shortcut"]
    mods = [m for m in ("mod", "meta", "control", "alt", "shift") if s.get(m)]
    print(o["command"], "+".join(mods + [s["key"]]))
EOF
  bb settings keyboard set "$command" "$shortcut"
done

echo "==> Plugins (path installs)"
for plugin in "$BB_DIR"/plugins/bb-plugin-*/; do
  id="$(basename "$plugin" | sed 's/^bb-plugin-//')"
  if ! bb plugin list 2>/dev/null | grep -q "^$id@"; then
    (cd "$plugin" && npm install --no-audit --no-fund && bb plugin install . --yes)
  else
    echo "$id already installed"
  fi
done

echo "Done. Panels: Notion CI, Activity. File opener: Settings → File openers → nvim."
