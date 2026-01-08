return {
  {
    "zbirenbaum/copilot.lua",
    opts = {
      suggestion = {
        enabled = true,
        auto_trigger = true,
        keymap = {
          accept = "<Tab>",
          accept_word = "<M-w>",
          accept_line = "<M-l>",
          next = "<M-]>",
          prev = "<M-[>",
          dismiss = "<C-]>",
        },
      },
      panel = { enabled = false },
    },
  },
  -- Disable copilot in blink.cmp since we're using inline suggestions
  {
    "saghen/blink.cmp",
    optional = true,
    opts = function(_, opts)
      -- Remove copilot from blink sources if present
      if opts.sources and opts.sources.default then
        opts.sources.default = vim.tbl_filter(function(source)
          return source ~= "copilot"
        end, opts.sources.default)
      end
    end,
  },
}
