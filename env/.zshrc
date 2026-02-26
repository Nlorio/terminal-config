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

# To customize prompt, run `p10k configure` or edit ~/.p10k.zsh.
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
eval "$(direnv hook zsh)"
export RIPGREP_CONFIG_PATH="/Users/nlorio/Documents/projects/notion-next/.ripgreprc"
eval "$('/usr/local/bin/node' -r '/Users/nlorio/Documents/projects/notion-next/esbuild-runner.js' '/Users/nlorio/Documents/projects/notion-next/src/cli/main/notion.ts' completion --install)"
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"

export PATH="$HOME/.local/bin:$PATH"

# fzf shell integration (key bindings + completion)
export FZF_DEFAULT_OPTS="--height=~5"
eval "$(fzf --zsh)"

. "$HOME/.cargo/env"
eval "$(${CARGO_HOME:-$HOME/.cargo}/bin/rv shell init zsh)"

### From notion android setup
export ANDROID_HOME=/Users/nlorio/Library/Android/sdk
export JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-17.jdk/Contents/Home
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin"
