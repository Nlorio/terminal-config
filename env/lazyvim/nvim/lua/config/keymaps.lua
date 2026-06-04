-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("n", "<leader>uh", function()
  vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
end, { desc = "Toggle Inlay Hints" })

vim.keymap.set("n", "<leader>ut", function()
  local theme = require("lib.theme")
  local mode = vim.o.background == "dark" and "light" or "dark"
  theme.apply(mode)
  theme.persist(mode)
end, { desc = "Toggle Light/Dark" })
