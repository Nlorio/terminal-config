-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("n", "<leader>uh", function()
  vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled())
end, { desc = "Toggle Inlay Hints" })

vim.keymap.set("n", "<leader>ut", function()
  if vim.o.background == "dark" then
    vim.cmd.colorscheme("dawnfox")
  else
    vim.o.background = "dark"
    vim.cmd.colorscheme("everforest")
  end
end, { desc = "Toggle Light/Dark" })
