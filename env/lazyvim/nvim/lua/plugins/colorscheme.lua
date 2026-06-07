local theme = require("lib.theme")
local mode = theme.current_mode() or "dark"

-- Register highlight-override autocmd now, before LazyVim applies the
-- colorscheme, so it catches the initial startup ColorScheme event (and every
-- later one). This file is evaluated during plugin-spec loading, which is early
-- enough; config/autocmds.lua (VeryLazy) would be too late.
theme.setup_overrides()

return {
	{ "savq/melange-nvim" }, -- dark + light mode

	-- Previous colorschemes, kept for easy switching in the future:
	-- { "jaljoue/dracula-alucard.nvim" }, -- Dracula's Alucard light variant
	-- { "sainnhe/everforest" },
	-- { "ellisonleao/gruvbox.nvim" },

	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = theme[mode].colorscheme,
		},
	},
}
