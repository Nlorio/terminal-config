-- Associate .str files with javascript for LSP support
vim.filetype.add({
  extension = {
    str = "javascript",
  },
})

return {
  "gruvw/strudel.nvim",
  build = "npm ci",
  keys = {
    { "<leader>Ml", "<cmd>StrudelLaunch<cr>", desc = "Launch Strudel" },
    { "<leader>Mt", "<cmd>StrudelToggle<cr>", desc = "Toggle Playback" },
    { "<leader>Mu", "<cmd>StrudelUpdate<cr>", desc = "Update Code" },
    { "<leader>Mq", "<cmd>StrudelQuit<cr>", desc = "Quit Strudel" },
  },
  config = function()
    require("strudel").setup({
        update_on_save = true
    })
  end,
}
