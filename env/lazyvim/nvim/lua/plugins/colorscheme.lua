local theme = require("lib.theme")
local theme_file = vim.fn.expand("~/.config/theme")
local mode = "dark"
if vim.fn.filereadable(theme_file) == 1 then
	local content = vim.fn.readfile(theme_file)[1]
	if theme[content] then
		mode = content
	end
end

return {
	{ "sainnhe/everforest" },
	{ "EdenEast/nightfox.nvim" },

	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = theme[mode].colorscheme,
		},
	},
}
