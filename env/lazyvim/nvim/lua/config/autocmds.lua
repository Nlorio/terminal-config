-- Autocmds are automatically loaded on the VeryLazy event
-- Default autocmds that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/autocmds.lua
--
-- Add any additional autocmds here
-- with `vim.api.nvim_create_autocmd`
--
-- Or remove existing autocmds by their group name (which is prefixed with `lazyvim_` for the defaults)
-- e.g. vim.api.nvim_del_augroup_by_name("lazyvim_wrap_spell")

vim.api.nvim_create_autocmd("FocusGained", {
  group = vim.api.nvim_create_augroup("theme_sync", { clear = true }),
  callback = function()
    local theme_file = vim.fn.expand("~/.config/theme")
    if vim.fn.filereadable(theme_file) == 1 then
      local mode = vim.fn.readfile(theme_file)[1]
      local theme = require("lib.theme")
      local t = theme[mode]
      if t and vim.g.colors_name ~= t.colorscheme then
        theme.apply(mode)
      end
    end
  end,
})
