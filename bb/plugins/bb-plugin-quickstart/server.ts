// bb-plugin-quickstart — one-click presets in the thread panel Actions list.
//
// Terminal presets create a thread-scoped terminal running the command
// (tmux, dev server, nvim); the browser preset renders an iframe panel.
// Extra presets come from the `presets` setting: `Title :: command` pairs
// separated by `;;`.
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

export const rpcContract = defineRpcContract({
  runCommand: {
    input: z
      .object({
        threadId: z.string().min(1),
        title: z.string().min(1),
        command: z.string().min(1),
      })
      .strict(),
    output: z.object({
      ok: z.boolean(),
      terminalId: z.string().nullable(),
      message: z.string(),
    }),
  },
  listPresets: {
    input: z.null(),
    output: z.object({
      presets: z.array(z.object({ title: z.string(), command: z.string() })),
    }),
  },
});

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    presets: {
      type: "string",
      label: "Extra presets (`Title :: command`, separated by `;;`)",
      default: "",
    },
  });

  bb.rpc.register(rpcContract, {
    async runCommand({ threadId, title, command }) {
      try {
        const terminal = await bb.sdk.terminals.create({
          scope: { kind: "thread", threadId },
          cols: 120,
          rows: 36,
          title,
          start: { mode: "command", command },
        });
        bb.log.info(`quickstart "${title}" → terminal ${terminal.id}`);
        return { ok: true, terminalId: terminal.id, message: `Started "${title}".` };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        bb.log.error(`quickstart "${title}" failed: ${message}`);
        return { ok: false, terminalId: null, message };
      }
    },
    async listPresets() {
      const { presets } = await settings.get();
      const parsed = presets
        .split(";;")
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [title, ...rest] = entry.split("::");
          return { title: (title ?? "").trim(), command: rest.join("::").trim() };
        })
        .filter((preset) => preset.title && preset.command);
      return { presets: parsed };
    },
  });
}
