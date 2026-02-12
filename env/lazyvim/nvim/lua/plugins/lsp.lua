return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        -- Enable tsgo (native TypeScript LSP)
        tsgo = {
          flags = {
            debounce_text_changes = 150,
            exit_timeout = 30000, -- 30 seconds
          },
        },
        -- Disable vtsls when using tsgo
        vtsls = { enabled = false },
        -- vtsls = {
        --   settings = {
        --     typescript = {
        --       tsserver = {
        --         maxTsServerMemory = 24276,
        --       },
        --       -- experimental = {
        --       --   useTsgo = true,
        --       -- },
        --       -- implementationsCodeLens = {
        --       --   enabled = true,
        --       -- },
        --       -- referencesCodeLens = {
        --       --   enabled = true,
        --       --   showOnAllFunctions = true,
        --       -- },
        --     },
        --     javascript = {
        --       tsserver = {
        --         maxTsServerMemory = 24276,
        --       },
        --     },
        --     vtsls = {
        --       autoUseWorkspaceTsdk = true,
        --     },
        --   },
        -- },
      },
    },
  },
}
