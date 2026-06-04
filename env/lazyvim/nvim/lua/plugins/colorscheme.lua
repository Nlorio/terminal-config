local theme = require("lib.theme")
local mode = theme.current_mode() or "dark"

return {
	{ "savq/melange-nvim" },

	-- Previous colorschemes, kept for easy switching in the future:
	-- { "sainnhe/everforest" },
	-- { "ellisonleao/gruvbox.nvim" },

	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = theme[mode].colorscheme,
		},
	},
}
