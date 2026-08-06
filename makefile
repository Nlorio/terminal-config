.PHONY: all install link unlink backup help

REPO_DIR := $(shell pwd)
BACKUP_DIR := $(REPO_DIR)/backup

all: install link

help:
	@echo "Usage:"
	@echo "  make backup   - Backup existing config files"
	@echo "  make install  - Install dependencies via Homebrew"
	@echo "  make link     - Create symlinks for all config files"
	@echo "  make unlink   - Remove all symlinks"
	@echo "  make all      - Run install + link"

backup:
	@echo "Backing up existing configs to $(BACKUP_DIR)..."
	@mkdir -p $(BACKUP_DIR)
	@cp $(HOME)/.zshrc $(BACKUP_DIR)/.zshrc 2>/dev/null || true
	@cp $(HOME)/.zsh_profile $(BACKUP_DIR)/.zsh_profile 2>/dev/null || true
	@cp $(HOME)/.zsh_functions $(BACKUP_DIR)/.zsh_functions 2>/dev/null || true
	@cp $(HOME)/.tmux.conf $(BACKUP_DIR)/.tmux.conf 2>/dev/null || true
	@cp $(HOME)/.vimrc $(BACKUP_DIR)/.vimrc 2>/dev/null || true
	@cp -r $(HOME)/.vim $(BACKUP_DIR)/.vim 2>/dev/null || true
	@cp -r $(HOME)/.config/nvim $(BACKUP_DIR)/nvim 2>/dev/null || true
	@cp -r $(HOME)/.config/ghostty $(BACKUP_DIR)/ghostty 2>/dev/null || true
	@cp -r $(HOME)/.config/neofetch $(BACKUP_DIR)/neofetch 2>/dev/null || true
	@echo "Backup complete. Files saved to $(BACKUP_DIR)/"

install:
	@echo "Installing dependencies..."
	brew install neovim
	brew install neofetch
	brew install tmux
	brew install lazygit
	brew install fzf
	brew install ripgrep
	brew install fd
	brew install pyenv
	brew install rbenv
	brew install direnv
	brew install --cask ghostty
	@echo "Installing Powerlevel10k..."
	@if [ ! -d "$(HOME)/powerlevel10k" ]; then \
		git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ~/powerlevel10k; \
	else \
		echo "Powerlevel10k already installed"; \
	fi
	@echo "Done! Run 'make link' to create symlinks."

link:
	@echo "Creating symlinks..."
	@mkdir -p $(HOME)/.config
	@mkdir -p $(HOME)/.config/neofetch
	@mkdir -p $(HOME)/.config/ghostty
	@# Remove nvim dir/symlink if exists, so we can replace it
	@rm -rf $(HOME)/.config/nvim

	@# Zsh
	@ln -sfn $(REPO_DIR)/env/.zshrc $(HOME)/.zshrc
	@ln -sfn $(REPO_DIR)/env/.zsh_profile $(HOME)/.zsh_profile
	@ln -sfn $(REPO_DIR)/env/.zsh_functions $(HOME)/.zsh_functions
	@ln -sfn $(REPO_DIR)/env/p10k-dark.zsh $(HOME)/.p10k-dark.zsh
	@ln -sfn $(REPO_DIR)/env/p10k-light.zsh $(HOME)/.p10k-light.zsh
	@echo "  ~/.zshrc -> env/.zshrc"
	@echo "  ~/.zsh_profile -> env/.zsh_profile"
	@echo "  ~/.zsh_functions -> env/.zsh_functions"
	@echo "  ~/.p10k-dark.zsh -> env/p10k-dark.zsh"
	@echo "  ~/.p10k-light.zsh -> env/p10k-light.zsh"

	@# Tmux
	@ln -sfn $(REPO_DIR)/env/.tmux.conf $(HOME)/.tmux.conf
	@echo "  ~/.tmux.conf -> env/.tmux.conf"

	@# Vim
	@ln -sfn $(REPO_DIR)/.vimrc $(HOME)/.vimrc
	@ln -sfn $(REPO_DIR)/env/vim $(HOME)/.vim
	@echo "  ~/.vimrc -> .vimrc"
	@echo "  ~/.vim -> env/vim"

	@# Neovim (LazyVim)
	@ln -sfn $(REPO_DIR)/env/lazyvim/nvim $(HOME)/.config/nvim
	@echo "  ~/.config/nvim -> env/lazyvim/nvim"

	@# Ghostty
	@ln -sfn $(REPO_DIR)/env/ghostty/config $(HOME)/.config/ghostty/config
	@cp -r $(REPO_DIR)/env/ghostty/themes/ $(HOME)/.config/ghostty/themes/
	@cp -r $(REPO_DIR)/env/ghostty/shaders/ $(HOME)/.config/ghostty/shaders/
	@echo "  ~/.config/ghostty/config -> env/ghostty/config"
	@echo "  ~/.config/ghostty/themes/ <- env/ghostty/themes/ (copied)"
	@echo "  ~/.config/ghostty/shaders/ <- env/ghostty/shaders/ (copied)"

	@# Orca (keybindings; theme yaml is imported via Orca settings, not symlinked)
	@mkdir -p $(HOME)/.orca
	@ln -sfn $(REPO_DIR)/env/orca/keybindings.json $(HOME)/.orca/keybindings.json
	@echo "  ~/.orca/keybindings.json -> env/orca/keybindings.json"

	@# Neofetch
	@ln -sfn $(REPO_DIR)/neofetch/config.conf $(HOME)/.config/neofetch/config.conf
	@echo "  ~/.config/neofetch/config.conf -> neofetch/config.conf"

	@echo ""
	@echo "Symlinks created! Note: neofetch custom ASCII requires sudo:"
	@echo "  sudo mkdir -p /etc/neofetch"
	@echo "  sudo ln -sfn $(REPO_DIR)/neofetch/duck-half.ansii /etc/neofetch/duck-half.ansii"

unlink:
	@echo "Removing symlinks..."
	@rm -f $(HOME)/.zshrc
	@rm -f $(HOME)/.zsh_profile
	@rm -f $(HOME)/.zsh_functions
	@rm -f $(HOME)/.p10k-dark.zsh
	@rm -f $(HOME)/.p10k-light.zsh
	@rm -f $(HOME)/.tmux.conf
	@rm -f $(HOME)/.vimrc
	@rm -f $(HOME)/.vim
	@rm -f $(HOME)/.config/nvim
	@rm -f $(HOME)/.config/ghostty/config
	@rm -rf $(HOME)/.config/ghostty/themes
	@rm -rf $(HOME)/.config/ghostty/shaders
	@rm -f $(HOME)/.config/neofetch/config.conf
	@rm -f $(HOME)/.orca/keybindings.json
	@echo "Symlinks removed."
