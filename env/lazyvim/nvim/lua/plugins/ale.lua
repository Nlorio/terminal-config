return {
  "dense-analysis/ale",
  config = function()
     -- Fixers for TypeScript
    vim.g.ale_fixers = {
      ['*'] = { 'remove_trailing_lines', 'trim_whitespace' },
      typescript = { 'prettier', 'eslint' },
      typescriptreact = { 'prettier', 'eslint' },
    }

    vim.g.ale_linters = {
      typescript = { 'eslint', 'tsserver' },
      typescriptreact = { 'eslint', 'tsserver' },
      lua = {'lua_language_server'}
    }
    
    -- Enable fixing on save
    vim.g.ale_fix_on_save = 1

    -- Use local config files for prettier/eslint
    vim.g.ale_javascript_prettier_use_local_config = 1
    vim.g.ale_typescript_prettier_use_local_config = 1

    -- Optional: Enable completion with tsserver
    vim.g.ale_completion_enabled = 1  -- Set to 1 if you want ALE completion

  end
}
