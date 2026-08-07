// bb-plugin-usage — provider usage limits (Claude Code, Codex, Cursor).
//
// Thin wrapper over bb.sdk.system.usageLimits() (the same data as
// `bb settings usage`), plus a small sample log in the plugin database so
// the panel can show how window usage moved over the last days.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

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

const customSourceResultSchema = z.object({
  name: z.string(),
  status: z.enum(["ok", "error"]),
  planLabel: z.string().nullable(),
  windows: z.array(windowSchema),
  error: z.string().nullable(),
});

export const rpcContract = defineRpcContract({
  getUsage: {
    input: z.null(),
    output: z.object({
      codex: providerSchema,
      claudeCode: providerSchema,
      cursor: providerSchema,
      custom: z.array(customSourceResultSchema),
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

interface CustomSourceResult {
  name: string;
  status: "ok" | "error";
  planLabel: string | null;
  windows: z.infer<typeof windowSchema>[];
  error: string | null;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    customSources: {
      type: "string",
      label:
        'Custom sources: `Name :: shell command` pairs separated by `;;`. Each command must print JSON {"planLabel"?, "windows": [{"label", "usedPercent", "resetsAt"?, "cost"?: {"usedUsdCents", "limitUsdCents"}}]}',
      default: "",
    },
  });

  async function runCustomSources(): Promise<CustomSourceResult[]> {
    const { customSources } = await settings.get();
    const entries = customSources
      .split(";;")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name, ...rest] = entry.split("::");
        return { name: (name ?? "").trim(), command: rest.join("::").trim() };
      })
      .filter((entry) => entry.name && entry.command);
    const results: CustomSourceResult[] = [];
    for (const entry of entries) {
      try {
        const { stdout } = await execFileAsync(
          "/bin/bash",
          ["-lc", entry.command],
          { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
        );
        const parsed = JSON.parse(stdout) as {
          planLabel?: string | null;
          windows?: unknown;
        };
        const windows = z.array(windowSchema).parse(parsed.windows ?? []);
        results.push({
          name: entry.name,
          status: "ok",
          planLabel: parsed.planLabel ?? null,
          windows,
          error: null,
        });
      } catch (error) {
        results.push({
          name: entry.name,
          status: "error",
          planLabel: null,
          windows: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return results;
  }

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

  function recordSamples(
    usage: { codex: unknown; claudeCode: unknown; cursor: unknown },
    custom: CustomSourceResult[],
  ): void {
    const at = Date.now();
    const insert = db.prepare(
      "INSERT INTO samples (at, provider, label, used_percent) VALUES (?, ?, ?, ?)",
    );
    const sources: [string, { status?: string; windows?: { label: string; usedPercent: number }[] }][] =
      [
        ...Object.entries(usage),
        ...custom.map(
          (c) => [`custom:${c.name}`, c] as [string, CustomSourceResult],
        ),
      ];
    for (const [provider, d] of sources) {
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
    const [usage, custom] = await Promise.all([
      bb.sdk.system.usageLimits(),
      runCustomSources(),
    ]);
    recordSamples(usage, custom);
    const history = db
      .prepare(
        "SELECT at, provider, label, used_percent AS usedPercent FROM samples ORDER BY at ASC",
      )
      .all() as { at: number; provider: string; label: string; usedPercent: number }[];
    return { ...usage, custom, sampledAt: Date.now(), history };
  }

  bb.rpc.register(rpcContract, {
    async getUsage() {
      return fetchUsage();
    },
  });

  // Sample every 30 minutes so history exists even when the panel is closed.
  bb.background.schedule("sample", "*/30 * * * *", async () => {
    const [usage, custom] = await Promise.all([
      bb.sdk.system.usageLimits(),
      runCustomSources(),
    ]);
    recordSamples(usage, custom);
  });

  bb.cli.register({
    name: "usage",
    summary: "Provider usage limits (Claude Code, Codex, Cursor)",
    commands: [
      { name: "show", summary: "Print current usage windows", usage: "bb usage show" },
    ],
    async run() {
      const [usage, custom] = await Promise.all([
        bb.sdk.system.usageLimits(),
        runCustomSources(),
      ]);
      const lines: string[] = [];
      for (const source of custom) {
        if (source.status !== "ok") {
          lines.push(`${source.name}: error — ${source.error}`);
          continue;
        }
        lines.push(`${source.name}${source.planLabel ? `: ${source.planLabel}` : ""}`);
        for (const window of source.windows) {
          lines.push(
            `  ${window.label}: ${window.usedPercent.toFixed(0)}%${window.resetsAt ? ` (resets ${window.resetsAt})` : ""}`,
          );
        }
      }
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
