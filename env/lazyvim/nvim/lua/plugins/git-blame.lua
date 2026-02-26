return {
  "f-person/git-blame.nvim",
  cmd = { "GitBlameToggle", "GitBlameOpenCommitURL" },
  keys = {
    { "<leader>gb", "<cmd>GitBlameToggle<cr>", desc = "Toggle Git Blame" },
  },
  opts = {
    enabled = false, -- start disabled, toggle with <leader>gb
    message_template = " <summary> • <date> • <author> • <<sha>>",
    date_format = "%m-%d-%Y %H:%M:%S",
    virtual_text_column = 1,
  },
}
