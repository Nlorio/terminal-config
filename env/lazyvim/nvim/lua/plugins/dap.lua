return {
  "mfussenegger/nvim-dap",
  keys = {
    { "<leader>dc", function() require("dap").continue() end, desc = "Continue" },
    { "<leader>db", function() require("dap").toggle_breakpoint() end, desc = "Toggle Breakpoint" },
    { "<leader>di", function() require("dap").step_into() end, desc = "Step Into" },
    { "<leader>do", function() require("dap").step_over() end, desc = "Step Over" },
    { "<leader>dO", function() require("dap").step_out() end, desc = "Step Out" },
    { "<leader>dr", function() require("dap").repl.open() end, desc = "Open REPL" },
  },
  config = function()
    local dap = require("dap")

    dap.adapters.node2 = {
      type = "executable",
      command = "node",
      args = { vim.fn.stdpath("data") .. "/mason/packages/node-debug2-adapter/out/src/nodeDebug.js" },
    }

    dap.configurations.javascript = {
      {
        type = "node2",
        request = "attach",
        name = "Attach to Notion Server",
        port = 9229,
        restart = true,
        protocol = "inspector",
        timeout = 10000,
        skipFiles = { "<node_internals>/**" },
      }
    }

    dap.configurations.typescript = dap.configurations.javascript
  end,
}
