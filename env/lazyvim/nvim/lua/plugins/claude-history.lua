return {
    'pittcat/claude-fzf-history.nvim',
    dependencies = { 'ibhagwan/fzf-lua' },
    config = function()
        require('claude-fzf-history').setup()
    end,
    cmd = { 'ClaudeHistory', 'ClaudeHistoryDebug' },
    keys = {
        { "<leader>ah", "<cmd>ClaudeHistory<cr>", desc = "Toggle Claude History" },
        { "<leader>ae", "<cmd>ClaudeHistoryDebug export<cr>", desc = "Export Claude History" },
    }
}
