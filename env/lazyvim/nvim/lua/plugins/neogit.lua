return {
  -- Disable lazygit plugin to prevent conflicts with Neogit
  {
    "kdheepak/lazygit.nvim",
    enabled = false,
  },
  -- Configure Neogit
  {
    "NeogitOrg/neogit",
    dependencies = {
      "nvim-lua/plenary.nvim",
      "sindrets/diffview.nvim",
      "nvim-telescope/telescope.nvim",
    },
    cmd = "Neogit",
    opts = {
      integrations = {
        diffview = true,
        telescope = true,
      },
    },
    keys = {
      { "<leader>gg", "<cmd>Neogit<cr>", desc = "Neogit" },
    },
  },
}
