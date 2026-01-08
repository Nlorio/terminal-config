return {
    "coder/claudecode.nvim",
    dependencies = { "folke/snacks.nvim" },
    config = true,
    keys = {
      { "<leader>ac", "<cmd>ClaudeCode<cr>", desc = "Toggle Claude" },
      { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus Claude" },
      { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume Claude" },
      { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue Claude" },
      { "<leader>am", "<cmd>ClaudeCodeSelectModel<cr>", desc = "Select model" },
      { "<leader>ab", "<cmd>ClaudeCodeAdd %<cr>", desc = "Add buffer" },
      { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to Claude" },
      { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
      { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Reject diff" },
    },
  }
-- return {
--     "olimorris/codecompanion.nvim",
--     dependencies = {
--         "nvim-lua/plenary.nvim"
--     },
--     keys = {
--         { "<leader>ap", "<cmd>CodeCompanion<cr>", desc = "Toggle CC Prompt" },
--         { "<leader>ac", "<cmd>CodeCompanionChat<cr>", desc = "Toggle CC Chat" },
--         { "<leader>ah", "<cmd>CodeCompanionActions<cr>", desc = "Open CC Home" },
--         -- { "<leader>af", "<cmd>ClaudeCodeFocus<cr>", desc = "Focus CC" },
--         -- { "<leader>ar", "<cmd>ClaudeCode --resume<cr>", desc = "Resume CC" },
--         -- { "<leader>aC", "<cmd>ClaudeCode --continue<cr>", desc = "Continue CC" },
--         -- { "<leader>as", "<cmd>ClaudeCodeSend<cr>", mode = "v", desc = "Send to CC" },
--         -- { "<leader>aa", "<cmd>ClaudeCodeDiffAccept<cr>", desc = "Accept diff" },
--         -- { "<leader>ad", "<cmd>ClaudeCodeDiffDeny<cr>", desc = "Reject diff" },
--     },
--     -- config = true,
--     opts = {
--         strategies = {
--             chat = {
--                 adapter = "anthropic",
--                 model = "claude-opus-4-5"
--             },
--             inline = {
--                 adapter = "anthropic",
--             }
--         },
--         -- NOTE: The log_level is in `opts.opts`
--         opts = {
--             log_level = "DEBUG",
--         },
--     },
-- }
