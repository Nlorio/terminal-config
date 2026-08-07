// bb-plugin-usage — provider usage limits (Claude Code, Codex, Cursor).
//
// Thin wrapper over bb.sdk.system.usageLimits() (the same data as
// `bb settings usage`), plus a small sample log in the plugin database so
// the panel can show how window usage moved over the last days.
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const windowSchema = z.object({
  label: z.string(),
  usedPercent: z.number(),
  resetsAt: z.string().nullable(),
  cost: z
    .object({ usedUsdCents: z.number(), limitUsdCents: z.number() })
    .optional(),
});

const providerSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    accountEmail: z.string().nullable(),
    planLabel: z.string().nullable(),
    windows: z.array(windowSchema),
  }),
  z.object({ status: z.literal("not_installed") }),
  z.object({ status: z.literal("unauthenticated") }),
  z.object({ status: z.literal("expired") }),
  z.object({ status: z.literal("error"), message: z.string() }),
]);

export const rpcContract = defineRpcContract({
  getUsage: {
    input: z.null(),
    output: z.object({
      codex: providerSchema,
      claudeCode: providerSchema,
      cursor: providerSchema,
      sampledAt: z.number(),
      history: z.array(
        z.object({
          at: z.number(),
          provider: z.string(),
          label: z.string(),
          usedPercent: z.number(),
        }),
      ),
    }),
  },
});

export default async function plugin(bb: BbPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS samples (
       at INTEGER NOT NULL,
       provider TEXT NOT NULL,
       label TEXT NOT NULL,
       used_percent REAL NOT NULL
     )`,
    `CREATE INDEX IF NOT EXISTS samples_at ON samples(at)`,
  ]);

  function recordSamples(usage: {
    codex: unknown;
    claudeCode: unknown;
    cursor: unknown;
  }): void {
    const at = Date.now();
    const insert = db.prepare(
      "INSERT INTO samples (at, provider, label, used_percent) VALUES (?, ?, ?, ?)",
    );
    for (const [provider, data] of Object.entries(usage)) {
      const d = data as {
        status?: string;
        windows?: { label: string; usedPercent: number }[];
      };
      if (d?.status !== "ok") continue;
      for (const window of d.windows ?? []) {
        insert.run(at, provider, window.label, window.usedPercent);
      }
    }
    db.prepare("DELETE FROM samples WHERE at < ?").run(
      at - 14 * 24 * 3600 * 1000,
    );
  }

  async function fetchUsage() {
    const usage = await bb.sdk.system.usageLimits();
    recordSamples(usage);
    const history = db
      .prepare(
        "SELECT at, provider, label, used_percent AS usedPercent FROM samples ORDER BY at ASC",
      )
      .all() as { at: number; provider: string; label: string; usedPercent: number }[];
    return { ...usage, sampledAt: Date.now(), history };
  }

  bb.rpc.register(rpcContract, {
    async getUsage() {
      return fetchUsage();
    },
  });

  // Sample every 30 minutes so history exists even when the panel is closed.
  bb.background.schedule("sample", "*/30 * * * *", async () => {
    recordSamples(await bb.sdk.system.usageLimits());
  });

  bb.cli.register({
    name: "usage",
    summary: "Provider usage limits (Claude Code, Codex, Cursor)",
    commands: [
      { name: "show", summary: "Print current usage windows", usage: "bb usage show" },
    ],
    async run() {
      const usage = await bb.sdk.system.usageLimits();
      const lines: string[] = [];
      for (const [provider, data] of Object.entries(usage)) {
        const d = data as {
          status: string;
          message?: string;
          planLabel?: string | null;
          accountEmail?: string | null;
          windows?: {
            label: string;
            usedPercent: number;
            resetsAt: string | null;
          }[];
        };
        if (d.status !== "ok") {
          lines.push(`${provider}: ${d.status}${d.message ? ` — ${d.message}` : ""}`);
          continue;
        }
        lines.push(
          `${provider}: ${d.planLabel ?? "unknown plan"} (${d.accountEmail ?? "?"})`,
        );
        if (!d.windows?.length) lines.push("  no usage windows reported");
        for (const window of d.windows ?? []) {
          lines.push(
            `  ${window.label}: ${window.usedPercent.toFixed(0)}%${window.resetsAt ? ` (resets ${window.resetsAt})` : ""}`,
          );
        }
      }
      return { exitCode: 0, stdout: lines.join("\n") };
    },
  });
}
