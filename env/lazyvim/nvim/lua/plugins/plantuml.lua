return {
  { "tyru/open-browser.vim", lazy = true },
  { "aklt/plantuml-syntax", ft = "plantuml" },
  {
    "weirongxu/plantuml-previewer.vim",
    ft = "plantuml",
    dependencies = {
      "tyru/open-browser.vim",
      "aklt/plantuml-syntax",
    },
    init = function()
      vim.g["plantuml_previewer#plantuml_jar_path"] =
        vim.fn.trim(vim.fn.system("brew --prefix plantuml")) .. "/libexec/plantuml.jar"
    end,
  },
}
