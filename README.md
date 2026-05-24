# terminal-config

Personal terminal configuration for macOS. All dotfiles are symlinked to this repo - changes here update your system immediately.

## What's Included

- **neofetch** - System info display with custom duck ASCII art
- **zsh** - Shell with Powerlevel10k theme and custom functions
- **ghostty** - GPU-accelerated terminal emulator (Everforest theme)
- **lazyvim** - Neovim distribution with LSP, debugging, and plugins
- **tmux** - Terminal multiplexer with 256-color support
- **vim** - Classic vim with pathogen plugins
- **skills** - Shared Claude Code / Codex skills, symlinked into both tool dirs

## Prerequisites

- macOS
- [Homebrew](https://brew.sh)
- Git
- A [Nerd Font](https://www.nerdfonts.com/) (JetBrainsMono recommended)

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/terminal-config.git ~/Documents/config/terminal-config
cd ~/Documents/config/terminal-config
make install
make link
```

## Manual Setup

### 1. Install Dependencies

```bash
brew install neovim neofetch tmux lazygit fzf ripgrep fd pyenv rbenv direnv
brew install --cask ghostty
```

### 2. Install Powerlevel10k

```bash
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/powerlevel10k
```

### 3. Create Symlinks

```bash
# Zsh
ln -sfn ~/Documents/config/terminal-config/env/.zshrc ~/.zshrc
ln -sfn ~/Documents/config/terminal-config/env/.zsh_profile ~/.zsh_profile

# Tmux
ln -sfn ~/Documents/config/terminal-config/env/.tmux.conf ~/.tmux.conf

# Vim
ln -sfn ~/Documents/config/terminal-config/.vimrc ~/.vimrc
ln -sfn ~/Documents/config/terminal-config/env/vim ~/.vim

# Neovim (LazyVim)
mkdir -p ~/.config/nvim
ln -sfn ~/Documents/config/terminal-config/env/lazyvim/nvim ~/.config/nvim

# Ghostty
mkdir -p ~/.config/ghostty
ln -sfn ~/Documents/config/terminal-config/env/ghostty/config ~/.config/ghostty/config

# Neofetch
mkdir -p ~/.config/neofetch
ln -sfn ~/Documents/config/terminal-config/neofetch/config.conf ~/.config/neofetch/config.conf

# Neofetch custom ASCII (requires sudo)
sudo mkdir -p /etc/neofetch
sudo ln -sfn ~/Documents/config/terminal-config/neofetch/duck-half.ansii /etc/neofetch/duck-half.ansii

# Shared skills (Claude Code + Codex)
mkdir -p ~/.claude/skills ~/.codex/skills
for skill in ~/Documents/config/terminal-config/skills/*/; do
  name=$(basename "$skill")
  ln -sfn "$skill" ~/.claude/skills/"$name"
  ln -sfn "$skill" ~/.codex/skills/"$name"
done
# Or equivalently: `make link-skills`
```

### 4. Configure Powerlevel10k

Run `p10k configure` to set up your prompt, or copy an existing `.p10k.zsh` to your home directory.

## Directory Structure

```
terminal-config/
├── .vimrc                    # Vim configuration (pathogen, gruvbox)
├── Makefile                  # Automated setup commands
├── README.md
├── env/
│   ├── .tmux.conf            # Tmux configuration
│   ├── .zsh_profile          # Zsh functions (gwa, gwb, gwrecover, gwbrecover)
│   ├── .zshrc                # Zsh configuration
│   ├── ghostty/
│   │   └── config            # Ghostty terminal config
│   ├── lazyvim/
│   │   └── nvim/             # Full LazyVim configuration
│   │       ├── init.lua
│   │       ├── lazy-lock.json
│   │       └── lua/
│   │           ├── config/   # LazyVim options, keymaps
│   │           └── plugins/  # Custom plugins
│   └── vim/
│       ├── autoload/         # Pathogen
│       └── bundle/           # Vim plugins (lightline)
├── neofetch/
│   ├── config.conf           # Neofetch display config
│   ├── duck-half.ansii       # Custom ASCII art
│   └── neofetch              # Custom neofetch binary
└── skills/                   # Shared Claude Code / Codex skills
    └── <skill-name>/
        └── SKILL.md          # Frontmatter: name, description; body is the prompt
```

## Configuration Details

### Neofetch

Custom configuration displaying system info with duck ASCII art. The custom ASCII file goes in `/etc/neofetch/`.

### Zsh

- **Theme**: Powerlevel10k for fast, customizable prompts
- **Tools**: pyenv, rbenv, direnv integrations
- **Aliases**: `tmux="tmux -2"` for 256-color support

### Ghostty

Configured with:
- JetBrainsMono Nerd Font
- Everforest Dark color scheme (matches LazyVim)
- Block cursor, copy-on-select

### LazyVim

Full Neovim distribution with:
- **Colorscheme**: Everforest
- **Picker**: fzf
- **Extras**: TypeScript, Docker, Markdown, JSON support
- **Plugins**: Claude Code integration, git-blame, DAP debugging
- **Keymaps**: `<leader>ac` to toggle Claude Code

### Vim

Classic vim setup with:
- **Plugin manager**: Pathogen
- **Colorscheme**: Gruvbox
- **Plugins**: Lightline status bar
- **Settings**: 4-space tabs, syntax highlighting

### Tmux

Minimal config with 256-color terminal support.

## Custom Functions

### `gwa` - Git Worktree Automation

Creates a new git worktree with a dedicated tmux session:

```bash
gwa feature-branch
```

This will:
1. Create a new tmux session named `feature-branch`
2. Create a git worktree at `~/worktrees/feature-branch`
3. Run `notion install` in window 0
4. Prompt for a **layout** (default or long-running) and an **AI assistant** (claude or codex)

**Default layout** (3 windows):
- Window 0: shell with `notion install`
- Window 1: empty shell
- Window 2: single AI assistant

**Long-running layout** (4 windows, role-specialized agents):
- Window 0: shell with `notion install`
- Window 1: empty shell
- Window 2 (`agents`): vertical split — `implementor` pane on the left, `researcher` pane on the right, both running the chosen AI assistant. Pane titles render via `pane-border-status top` on that window.
- Window 3 (`review`): `adversarial` reviewer pane running the chosen AI assistant.
- A persistent TODO file is created at `~/Documents/plans/worktree-todos/<branch>/TODO.md` and symlinked into the worktree as `WORKTREE-TODO.md` (git-ignored per-worktree). Created once per branch name; survives `gwr` so notes outlive the worktree.
- Each agent is seeded with role context from `env/worktree-roles/{implementor,researcher,adversarial}.md`. The implementor runs as a long-running loop pulling items from the TODO list (read-only); the researcher never implements; the adversarial reviewer waits to be prompted, then appends gap items to the TODO list. Edit those files to tune behavior — changes take effect on the next `gwa` / `gwrecover`. Override the directory via `_GW_ROLES_DIR` if you keep your roles elsewhere.

### `gwr` - Git Worktree Remove

Counterpart to `gwa`. Kills the tmux session, removes the worktree, and deletes the branch:

```bash
gwr feature-branch
```

### `gwrecover` - Interactive Worktree Recovery

Walks every existing worktree and offers to either recreate its tmux session (mirroring the `gwa` layout — prompts for layout and AI assistant per worktree) or delete the worktree and branch. Useful after a reboot that wiped tmux state. Deletions run asynchronously so the prompt loop stays snappy.

### `gwb` - Boxy Workstream Automation

Parallel to `gwa` but for **Notion Boxy** (cloud dev environment). The local tmux session has a single window that SSHes into the boxy and attaches to a *nested remote tmux session* on the boxy itself — so the agent panes survive local tmux death, SSH drops, and laptop sleep:

```bash
gwb my-boxy
```

This will:
1. Detect whether boxy `my-boxy` exists already. If not, prompt for **image flavor** ([n]otion-next / [m]ail / [d]ata) and run `notion boxy create my-boxy --branch my-boxy [--withMail|--withData] --detached`.
2. Prompt for layout (`[d]efault` / `[l]ong-running`) and AI assistant (`[c]laude` / `code[x]`).
3. Stage role files, an AI launcher script, and a tmux setup script on the boxy at `~/worktree-roles/`. For long-running layout, also create `~/worktree-todos/<name>/TODO.md` on the boxy, symlinked from `~/notion-next/WORKTREE-TODO.md` (added to `.git/info/exclude`).
4. Create a single-window local tmux session named `boxy-<name>` (prefix `boxy-` so it sorts separately in `C-b s`). That window SSHes into the boxy, then runs `~/worktree-roles/_setup_tmux.sh` which idempotently builds a *remote* tmux session — also named `boxy-<name>` — on the boxy with the real layout:
   - Window 0 `main`: shell in `~/notion-next`
   - Window 1 `shell`: extra remote shell
   - **Default**: Window 2 `ai` runs the chosen AI with no role priming
   - **Long-running**: Window 2 `agents` (implementor + researcher split, role-labeled pane borders) and Window 3 `review` (adversarial), each launched via `~/worktree-roles/_launch.sh <role> <ai> <todo>`

**Nested tmux ergonomics**: the inner (remote) tmux uses prefix `C-a` so it doesn't fight the outer's `C-b`. Type `C-a C-a` to send a literal `C-a` (e.g. shell start-of-line). The inner session also has an orange status bar so the nesting level is obvious at a glance.

**Persistence**: closing your laptop drops the SSH but the remote tmux + agents keep running. Re-running `gwb <name>` rebuilds the local SSH wrapper and re-attaches to the same remote tmux. You can also reconnect from any machine via `notion boxy ssh <name>` then `tmux attach -t boxy-<name>`.

Role files are shipped to the boxy by `scp` at session creation, so local edits in `env/worktree-roles/` propagate on the next `gwb`. The TODO file lives on the boxy filesystem (not locally), so notes are tied to the lifetime of the boxy itself.

### `gwbr` - Boxy Workstream Remove

Counterpart to `gwb`. Kills the local tmux session, then prompts before running `notion boxy destroy <name>` (irreversible):

```bash
gwbr my-boxy
```

### `gwbrecover` - Interactive Boxy Recovery

Walks `notion boxy ls` and, for each remote boxy without a corresponding local `boxy-<name>` tmux session, offers to recreate the session (re-staging role files and TODO) or destroy the boxy. Destroys run asynchronously to keep the prompt loop snappy.

## Shared Skills

`skills/` holds Claude Code / Codex skills in the portable `<name>/SKILL.md` format. `make link-skills` symlinks each skill into both `~/.claude/skills/<name>` and `~/.codex/skills/<name>`, so editing the file in this repo immediately affects both tools.

To add a new skill:

1. `mkdir skills/<name>`
2. Create `skills/<name>/SKILL.md` with frontmatter:
   ```
   ---
   name: <name>
   description: <one-line description>
   ---
   ```
3. Run `make link-skills` to publish it to both tools (idempotent; picks up new dirs automatically).

`make unlink-skills` removes only the symlinks this repo creates — `~/.codex/skills/.system/` and any externally-sourced skill directories (e.g. `~/.claude/skills/perf-review/`) are left alone.

## Notes

- All dotfiles are symlinks - edit them here or in their target location
- Run `make unlink` to remove all symlinks
- LazyVim plugins are locked via `lazy-lock.json` for reproducibility
- First launch of neovim will install plugins automatically
