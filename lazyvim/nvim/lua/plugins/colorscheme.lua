return {
	-- add everforest
	{ "sainnhe/everforest" },

	-- add gruvbox
	{ "ellisonleao/gruvbox.nvim" },

	-- Configure LazyVim to load colorscheme
	{
		"LazyVim/LazyVim",
		opts = {
			colorscheme = "everforest",
			-- colorscheme = "gruvbox",
		},
	},
}
