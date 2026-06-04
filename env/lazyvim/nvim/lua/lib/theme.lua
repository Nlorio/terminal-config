local M = {}

-- Melange ships both a dark and a light variant in a single colorscheme; it
-- picks the variant from `vim.o.background`, so both modes use the same name.
M.dark = { colorscheme = "melange", background = "dark" }
M.light = { colorscheme = "melange", background = "light" }

-- Previous themes, kept for easy switching in the future:
-- M.dark = { colorscheme = "everforest", background = "dark" }
-- M.light = { colorscheme = "gruvbox", background = "light" }

-- Neovim tracks its theme independently from the terminal so `light-term` can
-- flip just the editor while the terminal stays on its own (e.g. tiki) theme.
-- Prefer the nvim-specific file, fall back to the shared terminal file.
M.nvim_theme_file = vim.fn.expand("~/.config/theme-nvim")
M.shared_theme_file = vim.fn.expand("~/.config/theme")

-- Returns the current nvim mode ("dark"/"light") or nil if neither file has a
-- recognized value.
function M.current_mode()
  for _, file in ipairs({ M.nvim_theme_file, M.shared_theme_file }) do
    if vim.fn.filereadable(file) == 1 then
      local mode = vim.fn.readfile(file)[1]
      if M[mode] then
        return mode
      end
    end
  end
  return nil
end

-- Persist the nvim mode to its own state file (so new nvim windows match).
function M.persist(mode)
  if M[mode] then
    vim.fn.writefile({ mode }, M.nvim_theme_file)
  end
end

function M.apply(mode)
  local t = M[mode]
  if t then
    vim.o.background = t.background
    vim.cmd.colorscheme(t.colorscheme)
  end
end

return M
