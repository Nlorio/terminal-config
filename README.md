# terminal-config

Personal terminal configuration for macOS. All dotfiles are symlinked to this repo - changes here update your system immediately.

## What's Included

- **neofetch** - System info display with custom duck ASCII art
- **zsh** - Shell with Powerlevel10k theme and custom functions
- **ghostty** - GPU-accelerated terminal emulator (light/dark theme switching)
- **lazyvim** - Neovim distribution with LSP, debugging, and plugins
- **tmux** - Terminal multiplexer with 256-color support
- **vim** - Classic vim with pathogen plugins

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

> `make link` creates every symlink below automatically (and is idempotent —
> safe to re-run after pulling new dotfiles). The manual commands are listed for
> reference / partial setups.

```bash
# Zsh
ln -sfn ~/Documents/config/terminal-config/env/.zshrc ~/.zshrc
ln -sfn ~/Documents/config/terminal-config/env/.zsh_profile ~/.zsh_profile
ln -sfn ~/Documents/config/terminal-config/env/.zsh_functions ~/.zsh_functions
ln -sfn ~/Documents/config/terminal-config/env/p10k-dark.zsh ~/.p10k-dark.zsh
ln -sfn ~/Documents/config/terminal-config/env/p10k-light.zsh ~/.p10k-light.zsh

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
│   ├── .zsh_profile          # Worktree functions (gwa, gwr, gwrecover)
│   ├── .zsh_functions        # Theme-switch functions (dark/light-ui, dark/light-term)
│   ├── .zshrc                # Zsh configuration
│   ├── p10k-dark.zsh         # Powerlevel10k config (dark)
│   ├── p10k-light.zsh        # Powerlevel10k config (light)
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
└── neofetch/
    ├── config.conf           # Neofetch display config
    ├── duck-half.ansii       # Custom ASCII art
    └── neofetch              # Custom neofetch binary
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
- Light/dark theme that follows macOS system appearance: `tiki-love-dark` (dark) and `Gruvbox Light` (light)
- A local override file (`~/.config/ghostty/theme-override`) written by the `dark-term`/`light-term` shell commands
- Block cursor, copy-on-select

### LazyVim

Full Neovim distribution with:
- **Colorscheme**: Everforest (dark) / Gruvbox (light), driven by `~/.config/theme`
- **Picker**: fzf (with `bat` preview)
- **Extras**: TypeScript, Docker, Markdown, JSON support
- **Plugins**: Claude Code integration, Neogit + Diffview, oxlint, PlantUML preview, git-blame, DAP debugging
- **Keymaps**: `<leader>ac` to toggle Claude Code, `<leader>ut` to toggle light/dark

### Vim

Classic vim setup with:
- **Plugin manager**: Pathogen
- **Colorscheme**: Gruvbox
- **Plugins**: Lightline status bar
- **Settings**: 4-space tabs, syntax highlighting

### Tmux

Minimal config with 256-color terminal support. The session picker (`<prefix> s`)
is sorted by name rather than by activity time, so numeric-prefixed sessions
stay in a stable, predictable order.

## Theme Switching

The terminal and Neovim track their themes separately so the editor can be flipped
without disturbing the terminal:

- `~/.config/theme` (`dark` / `light`) drives the **terminal** — Ghostty + Powerlevel10k.
- `~/.config/theme-nvim` (`dark` / `light`) drives **Neovim**; it falls back to
  `~/.config/theme` when absent.

Commands:

- **`dark-ui` / `light-ui`** — flip the macOS system appearance (Ghostty follows it
  automatically) and sync the prompt and Neovim. Whole-UI switch.
- **`dark-term`** — reset everything to dark: Ghostty (tiki), the running p10k
  prompt, and Neovim.
- **`light-term`** — switch **only Neovim** to light; the terminal (Ghostty + prompt)
  stays on tiki. Useful for a light editor over a dark terminal.
- **Neovim `<leader>ut`** — toggle light/dark, persist to `~/.config/theme-nvim`,
  and re-apply on focus so external changes sync in.
- **Prompt** — `.zshrc` sources `~/.p10k-dark.zsh` or `~/.p10k-light.zsh` based on
  `~/.config/theme` at startup.

## Custom Functions

### `gwa` - Git Worktree Automation

Creates a new git worktree with a dedicated tmux session:

```bash
gwa feature-branch
```

This will:
1. Create a new tmux session named `feature-branch`
2. Create a git worktree at `~/worktrees/<repo>/feature-branch`
3. Open 3 windows: main shell, secondary shell, and Claude Code

### `gwr` - Git Worktree Remove

Counterpart to `gwa`. Kills the tmux session, removes the worktree, and deletes
the branch:

```bash
gwr feature-branch
```

### `gwrecover` - Interactive Worktree Recovery

Walks every existing worktree and offers to either recreate its tmux session
(mirroring the `gwa` layout) or delete the worktree and branch. Useful after a
reboot or `tmux kill-server` that wiped tmux state while the worktrees on disk
survived.

```bash
gwrecover
```

## Notes

- All dotfiles are symlinks - edit them here or in their target location
- Run `make unlink` to remove all symlinks
- LazyVim plugins are locked via `lazy-lock.json` for reproducibility
- First launch of neovim will install plugins automatically
