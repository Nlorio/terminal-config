# Only draw neofetch on a real TTY. Tools that capture the shell environment
# (bb's host daemon, Claude Code snapshots) source this file with stdout piped;
# neofetch's ANSI art then gets concatenated into captured vars like $PATH,
# and 12KB PATH "entries" stack-smash zsh's findcmd (SIGABRT on any lookup of
# a nonexistent command).
[[ -t 1 ]] && neofetch

# Suppress instant prompt warning for console output during init
typeset -g POWERLEVEL9K_INSTANT_PROMPT=quiet

# Enable Powerlevel10k instant prompt. Should stay close to the top of ~/.zshrc.
# Initialization code that may require console input (password prompts, [y/n]
# confirmations, etc.) must go above this block; everything else may go below.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

# profile
source ~/.zsh_profile

# functions
source ~/.zsh_functions

# alias
alias tmux="tmux -2"

# misc
# export TERM=xterm-256color  # Let ghostty set its own TERM

# Powerlevel10k
source ~/powerlevel10k/powerlevel10k.zsh-theme

# Editor
export EDITOR="nvim"
export VISUAL="nvim"

# Cap tsgo (Go TS server) resource use. It builds one type-checker PER THREAD
# with duplicated, never-freed state, so memory + CPU scale with thread count.
# GOMAXPROCS limits the Go scheduler to N cores AND shrinks tsgo's checker pool
# (~N checkers instead of all 16) -> far less CPU and memory. GOMEMLIMIT is a
# soft backstop only (can't GC what's never freed), so kept high. This is
# inherited by anything launched from the shell -- notably Claude Code's lspMcp,
# which otherwise passes no limits. Applies to NEW shells/sessions; restart
# claude (or the session) to pick it up. Affects all Go tools (gh, docker, etc.)
# -- harmless given they don't need >4 cores. See:
# https://zackoverflow.dev/writing/why-does-tsgo-use-so-much-memory
export GOMAXPROCS=4
export GOMEMLIMIT=24GiB

# Load p10k config matching current theme
if [[ -f ~/.config/theme ]] && [[ "$(cat ~/.config/theme)" == "light" ]]; then
  [[ ! -f ~/.p10k-light.zsh ]] || source ~/.p10k-light.zsh
else
  [[ ! -f ~/.p10k-dark.zsh ]] || source ~/.p10k-dark.zsh
fi
eval "$(direnv hook zsh)"
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

export PATH="$HOME/.local/bin:$PATH"

# fzf shell integration (key bindings + completion)
export FZF_DEFAULT_OPTS="--height=~5"
eval "$(fzf --zsh)"

. "$HOME/.cargo/env"

### From notion android setup
export ANDROID_HOME=/Users/nlorio/Library/Android/sdk
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"

alias t3="n exec 25.8.2 npx t3"
export PATH="$HOME/.local/share/mise/shims:$PATH"
export PATH="${CARGO_HOME:-$HOME/.cargo}/bin:$PATH"
if command -v rv >/dev/null 2>&1; then eval "$(rv shell init zsh)"; fi
export RIPGREP_CONFIG_PATH="/Users/nlorio/worktrees/nlorio--OBSERVABILITY-alert-hygiene-sync/.ripgreprc"
# Install notion CLI completions. The notion wrapper prints "Using local notion
# checkout ..." to stderr when the shell starts inside a *different* notion repo;
# that stderr write lands after the p10k instant-prompt preamble and makes the
# prompt jump. Drop stderr -- only stdout (the completion script) is needed here.
eval "$('/Users/nlorio/.local/share/mise/installs/node/22.13.1/bin/node' -r '/Users/nlorio/worktrees/nlorio--OBSERVABILITY-alert-hygiene-sync/esbuild-runner.js' '/Users/nlorio/worktrees/nlorio--OBSERVABILITY-alert-hygiene-sync/src/cli/main/notion.ts' completion --install 2>/dev/null)"
export PNPM_HOME=/Users/nlorio/Library/pnpm/
export PATH="/Users/nlorio/Library/pnpm//bin:/Users/nlorio/Library/pnpm/:$PATH"
