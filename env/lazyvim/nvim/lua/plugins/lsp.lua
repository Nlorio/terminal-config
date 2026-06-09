return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        tsgo = {
          enabled = true,
          -- GOMEMLIMIT is a soft cap for the Go GC; it accepts binary units only
          -- (B/KiB/MiB/GiB/TiB), so 50GB is expressed as 50GiB (~53.7 GB).
          cmd = { "env", "GOMEMLIMIT=50GiB", "tsgo", "--lsp", "--stdio" },
          filetypes = {
            "javascript",
            "javascriptreact",
            "javascript.jsx",
            "typescript",
            "typescriptreact",
            "typescript.tsx",
          },
          root_markers = {
            "tsconfig.json",
            "jsconfig.json",
            "package.json",
            ".git",
            "tsconfig.base.json",
          },
          flags = {
            debounce_text_changes = 250,
            exit_timeout = 30000,
          },
        },
        tsserver = { enabled = false },
        vtsls = { enabled = false },
      },
    },
  },
  {
    "soulsam480/nvim-oxlint",
    opts = {},
  },
  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        typescript = { "prettier", "eslint_d" },
        typescriptreact = { "prettier", "eslint_d" },
        javascript = { "prettier", "eslint_d" },
        javascriptreact = { "prettier", "eslint_d" },
      },
    },
  },
}
