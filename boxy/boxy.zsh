# boxy.zsh — self-contained Notion Boxy workstream helpers.
#
# A "boxy workstream" is a local tmux session wrapping a remote Notion Boxy
# (cloud dev environment). `gwb <name>` creates the session and runs
# `notion boxy create <name>` inside it; the create command provisions the
# remote env and attaches to its tmux (nested inside the local session), so
# from there you orchestrate on the boxy directly. Closing the laptop drops
# the SSH but the remote side keeps running — re-run `gwb <name>` to get back.
#
# Install: source this file from your shell rc (no other files needed):
#   source /path/to/boxy.zsh
# Requirements: tmux, the `notion` CLI (authenticated).

# Create (or reattach to) a boxy workstream session.
gwb() {
  if [ -z "$1" ]; then
    echo "Usage: gwb <name>"
    return 1
  fi
  local name="$1"

  if tmux has-session -t "=$name" 2>/dev/null; then
    echo "Session '$name' exists — attaching."
  else
    echo "Creating boxy session '$name'..."
    tmux new-session -d -s "$name" -n "main"
    tmux send-keys -t "$name:0" "notion boxy create $name" C-m
  fi

  if [ -n "$TMUX" ]; then
    tmux switch-client -t "=$name"
  else
    tmux attach-session -t "=$name"
  fi
}

# Tear down a boxy workstream: kill the local session, then offer to destroy
# the remote boxy (irreversible, so it always confirms).
gwbr() {
  if [ -z "$1" ]; then
    echo "Usage: gwbr <name>"
    return 1
  fi
  local name="$1"

  if tmux kill-session -t "=$name" 2>/dev/null; then
    echo "Killed tmux session '$name'."
  fi

  printf "Destroy remote boxy '%s'? This is irreversible. [y/N] " "$name"
  local confirm
  read -r confirm </dev/tty
  if [[ "$confirm" =~ ^[Yy]$ ]]; then
    notion boxy destroy "$name"
  else
    echo "Remote boxy '$name' left running."
  fi
}
