local M = {}

-- Melange ships both a dark and a light variant in a single colorscheme; it
-- picks the variant from `vim.o.background`, so both modes use the same name.
M.dark = { colorscheme = "melange", background = "dark" }
M.light = { colorscheme = "melange", background = "light" }

-- Previous themes, kept for easy switching in the future:
-- M.dark = { colorscheme = "everforest", background = "dark" }
-- M.light = { colorscheme = "gruvbox", background = "light" }

function M.apply(mode)
  local t = M[mode]
  if t then
    vim.o.background = t.background
    vim.cmd.colorscheme(t.colorscheme)
  end
end

return M
