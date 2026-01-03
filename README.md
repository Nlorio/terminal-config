# terminal-config

Personal terminal configuration for macOS. All dotfiles are symlinked to this repo - changes here update your system immediately.

## What's Included

- **neofetch** - System info display with custom duck ASCII art
- **zsh** - Shell with Powerlevel10k theme and custom functions
- **ghostty** - GPU-accelerated terminal emulator (Everforest theme)
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
│   ├── .zsh_profile          # Zsh functions (gwa)
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
3. Open 3 windows: main, secondary, and Claude Code
4. Run `notion install` in the first window

## Notes

- All dotfiles are symlinks - edit them here or in their target location
- Run `make unlink` to remove all symlinks
- LazyVim plugins are locked via `lazy-lock.json` for reproducibility
- First launch of neovim will install plugins automatically
