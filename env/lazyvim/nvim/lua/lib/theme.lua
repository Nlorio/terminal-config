local M = {}

M.dark = { colorscheme = "everforest", background = "dark" }
M.light = { colorscheme = "dawnfox", background = "light" }

function M.apply(mode)
  local t = M[mode]
  if t then
    vim.o.background = t.background
    vim.cmd.colorscheme(t.colorscheme)
  end
end

return M
