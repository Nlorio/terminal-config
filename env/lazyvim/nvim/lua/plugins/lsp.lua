return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      servers = {
        vtsls = {
          settings = {
            typescript = {
              tsserver = {
                maxTsServerMemory = 24276,
              },
              -- experimental = {
              --     useTsgo = true
              -- }
              -- implementationsCodeLens = {
              --   enabled = true,
              -- },
              -- referencesCodeLens = {
              --   enabled = true,
              --   showOnAllFunctions = true,
              -- },
            },
            javascript = {
              tsserver = {
                maxTsServerMemory = 24276,
              },
            },
            vtsls = {
              autoUseWorkspaceTsdk = true,
            },
          },
        },
      },
    },
  },
}
