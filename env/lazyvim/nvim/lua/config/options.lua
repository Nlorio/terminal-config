-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here
--
-- Set to false to disable auto format
-- vim.g.lazyvim_eslint_auto_format = true
vim.g.lazyvim_picker = "fzf"

local theme = require("lib.theme")
local theme_file = vim.fn.expand("~/.config/theme")
if vim.fn.filereadable(theme_file) == 1 then
  local mode = vim.fn.readfile(theme_file)[1]
  if theme[mode] then
    vim.o.background = theme[mode].background
  end
end
