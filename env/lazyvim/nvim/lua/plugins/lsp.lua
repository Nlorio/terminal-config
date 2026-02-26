return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        tsgo = {
          enabled = true,
          cmd = { "tsgo", "--lsp", "--stdio" },
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
