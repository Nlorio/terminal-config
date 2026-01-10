return {
  "mfussenegger/nvim-dap",
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
