return {
    "folke/snacks.nvim",
    priority = 1000,
    lazy = false,
    opts = {
      -- Enable the terminal feature (required for claudecode.nvim)
      terminal = { enabled = true },
      -- Disable lazygit to avoid conflicts with Neogit
      lazygit = { enabled = false },
    },
    keys = {
      -- Remove the default lazygit keymaps so Neogit can claim them
      { "<leader>gg", false },
      { "<leader>gG", false },
      { "<leader>gf", false },
      { "<leader>gl", false },
    },
  }
