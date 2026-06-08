neofetch

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
