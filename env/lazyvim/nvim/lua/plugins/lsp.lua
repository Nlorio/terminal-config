-- Where tsgo GC traces land (GODEBUG=gctrace=1 writes one line per GC to
-- stderr; we redirect it here so it doesn't drown nvim's lsp.log). Created up
-- front so the redirect target's dir always exists.
local tsgo_trace_dir = vim.fn.expand("~/tsgo-traces")
vim.fn.mkdir(tsgo_trace_dir, "p")

return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        tsgo = {
          enabled = true,
          -- tsgo (the Go TS server) builds one full type-checker PER THREAD and
          -- duplicates type/symbol state across them, and never frees allocated
          -- types -- so memory and CPU scale with thread count, NOT with GC
          -- tuning. The real lever is capping threads: GOMAXPROCS limits the Go
          -- scheduler to N cores (and, since tsgo sizes its checker pool by it,
          -- ~N checkers instead of all 16 -> far less duplication). GOMEMLIMIT is
          -- only a soft backstop here (you can't GC what's never freed; too low
          -- just causes GC thrash), so it's set high. Units are binary only
          -- (GiB), so 24GB ~= 24GiB. See:
          -- https://zackoverflow.dev/writing/why-does-tsgo-use-so-much-memory
          -- To go further if 4 cores still isn't enough, append "--singleThreaded"
          -- to the cmd below (1 checker, ~half the memory, slower on big files).
          --
          -- GODEBUG=gctrace=1 logs every GC (heap before/after, goal, pause) so
          -- we can see the memory-growth curve and confirm GC reclaims nothing.
          -- Wrapped in `sh -c ... exec` so its stderr can be redirected to a
          -- dedicated trace file; `exec` keeps the process tree as plain tsgo.
          cmd = {
            "sh",
            "-c",
            "exec env GOMAXPROCS=4 GOMEMLIMIT=24GiB GODEBUG=gctrace=1 "
              .. "tsgo --lsp --stdio 2>>"
              .. tsgo_trace_dir
              .. "/tsgo-nvim-gctrace.log",
          },
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
