// bb-plugin-nvim-opener — open files in a bb terminal running nvim.
//
// The frontend registers a fileOpener for code extensions; its component
// calls `openInNvim`, which creates (or reuses) a terminal scoped to the
// file's environment and launches nvim at the workspace-relative path.
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

export const rpcContract = defineRpcContract({
  openInNvim: {
    input: z
      .object({
        path: z.string().min(1),
        environmentId: z.string().nullable(),
        threadId: z.string().nullable(),
        sourceKind: z.enum(["workspace", "host", "thread-storage"]),
      })
      .strict(),
    output: z.object({
      ok: z.boolean(),
      terminalId: z.string().nullable(),
      message: z.string(),
    }),
  },
});

// Shell-quote a path for the nvim launch command.
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export default async function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, {
    async openInNvim({ path, environmentId, threadId, sourceKind }) {
      if (sourceKind === "thread-storage") {
        return {
          ok: false,
          terminalId: null,
          message:
            "Thread-storage files have no worktree; use the built-in preview.",
        };
      }

      const scope = environmentId
        ? ({ kind: "environment", environmentId } as const)
        : threadId
          ? ({ kind: "thread", threadId } as const)
          : null;
      if (!scope) {
        return {
          ok: false,
          terminalId: null,
          message: "No environment or thread to open a terminal in.",
        };
      }

      // Environment-scoped terminals start in the worktree root, so
      // workspace-relative paths resolve as-is; host paths are absolute.
      const command = `nvim ${shellQuote(path)}`;
      const title = `nvim: ${path.split("/").pop() ?? path}`;
      try {
        const terminal = await bb.sdk.terminals.create({
          scope,
          cols: 120,
          rows: 36,
          title,
          start: { mode: "command", command },
        });
        bb.log.info(`opened ${path} in terminal ${terminal.id}`);
        return {
          ok: true,
          terminalId: terminal.id,
          message: `Opened in terminal "${title}".`,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        bb.log.error(`failed to open ${path}: ${message}`);
        return { ok: false, terminalId: null, message };
      }
    },
  });
}
