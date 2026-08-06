// bb-plugin-notion-ci — surface notion-next/notion-data PR + CI state in bb.
//
// Syncs your authored and review-requested PRs via the gh CLI (including the
// Buildkite-backed check rollup GitHub sees), caches them in the plugin
// database, and serves them to a navPanel dashboard, a `bb notion-ci` CLI
// command, and deep links into the deploy console.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const prSchema = z.object({
  repo: z.string(),
  number: z.number(),
  role: z.enum(["author", "review-requested"]),
  author: z.string(),
  title: z.string(),
  url: z.string(),
  branch: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  group: z.enum(["draft", "ready", "approved", "merged"]),
  changesRequested: z.boolean(),
  ciState: z.enum(["success", "failure", "pending", "none"]),
  failingChecks: z.array(z.string()),
  pendingChecks: z.number(),
  totalChecks: z.number(),
  consoleUrl: z.string().nullable(),
  syncedAt: z.number(),
});
export type PrRow = z.infer<typeof prSchema>;

export const rpcContract = defineRpcContract({
  listPrs: {
    input: z.null(),
    output: z.object({
      prs: z.array(prSchema),
      lastSyncAt: z.number().nullable(),
      lastError: z.string().nullable(),
      viewerLogin: z.string().nullable(),
    }),
  },
  sync: {
    input: z.null(),
    output: z.object({ synced: z.number(), errors: z.array(z.string()) }),
  },
});

interface RawCheck {
  // CheckRun shape
  name?: string;
  status?: string;
  conclusion?: string;
  // StatusContext shape
  context?: string;
  state?: string;
}

interface RawPr {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  isDraft: boolean;
  updatedAt: string;
  statusCheckRollup: RawCheck[] | null;
  author: { login?: string } | null;
  state: string;
  reviewDecision: string | null;
}

function groupFor(pr: RawPr): { group: PrRow["group"]; changesRequested: boolean } {
  const changesRequested = pr.reviewDecision === "CHANGES_REQUESTED";
  if (pr.state === "MERGED") return { group: "merged", changesRequested };
  if (pr.isDraft) return { group: "draft", changesRequested };
  if (pr.reviewDecision === "APPROVED") return { group: "approved", changesRequested };
  return { group: "ready", changesRequested };
}

function summarizeChecks(checks: RawCheck[] | null): {
  ciState: PrRow["ciState"];
  failingChecks: string[];
  pendingChecks: number;
  totalChecks: number;
} {
  if (!checks || checks.length === 0) {
    return { ciState: "none", failingChecks: [], pendingChecks: 0, totalChecks: 0 };
  }
  const failing: string[] = [];
  let pending = 0;
  for (const check of checks) {
    const name = check.name ?? check.context ?? "unknown";
    const verdict = (check.conclusion ?? check.state ?? "").toUpperCase();
    const running = (check.status ?? "").toUpperCase();
    if (verdict === "FAILURE" || verdict === "ERROR" || verdict === "TIMED_OUT") {
      failing.push(name);
    } else if (
      running === "IN_PROGRESS" ||
      running === "QUEUED" ||
      verdict === "PENDING" ||
      (verdict === "" && running !== "COMPLETED")
    ) {
      pending += 1;
    }
  }
  const ciState: PrRow["ciState"] =
    failing.length > 0 ? "failure" : pending > 0 ? "pending" : "success";
  return {
    ciState,
    failingChecks: [...new Set(failing)],
    pendingChecks: pending,
    totalChecks: checks.length,
  };
}

const GH_FIELDS =
  "number,title,url,headRefName,isDraft,updatedAt,statusCheckRollup,author,state,reviewDecision";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    repos: {
      type: "string",
      label: "Repositories (comma-separated owner/repo)",
      default: "makenotion/notion-next,makenotion/notion-data",
    },
    includeReviewRequested: {
      type: "boolean",
      label: "Include PRs where your review is requested",
      default: true,
    },
  });

  async function runGh(args: string[]): Promise<string> {
    const env = {
      ...process.env,
      PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`,
    };
    const { stdout } = await execFileAsync("gh", args, {
      env,
      timeout: 60_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }

  async function fetchPrs(
    repo: string,
    role: PrRow["role"],
    state: "open" | "merged" = "open",
  ): Promise<PrRow[]> {
    const roleArgs =
      role === "author"
        ? ["--author", "@me"]
        : ["--search", "review-requested:@me"];
    const stdout = await runGh([
      "pr",
      "list",
      "-R",
      repo,
      ...roleArgs,
      "--state",
      state,
      "--json",
      GH_FIELDS,
      "--limit",
      state === "merged" ? "15" : "50",
    ]);
    const raw = JSON.parse(stdout) as RawPr[];
    const now = Date.now();
    return raw.map((pr) => ({
      repo,
      number: pr.number,
      role,
      author: pr.author?.login ?? "unknown",
      title: pr.title,
      url: pr.url,
      branch: pr.headRefName,
      isDraft: pr.isDraft,
      updatedAt: pr.updatedAt,
      ...groupFor(pr),
      ...summarizeChecks(pr.statusCheckRollup),
      consoleUrl:
        repo === "makenotion/notion-next"
          ? `https://console.makenotion.com/deploy?tab=pullRequests&pr=${pr.number}`
          : null,
      syncedAt: now,
    }));
  }

  async function sync(): Promise<{ synced: number; errors: string[] }> {
    const { repos, includeReviewRequested } = await settings.get();
    const repoList = repos
      .split(",")
      .map((r) => r.trim())
      .filter(Boolean);
    const errors: string[] = [];
    const byKey = new Map<string, PrRow>();
    for (const repo of repoList) {
      const roles: PrRow["role"][] = includeReviewRequested
        ? ["author", "review-requested"]
        : ["author"];
      for (const role of roles) {
        try {
          for (const pr of await fetchPrs(repo, role)) {
            const key = `${pr.repo}#${pr.number}`;
            // Author role wins when a PR appears in both queries.
            if (!byKey.has(key) || role === "author") byKey.set(key, pr);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${repo} (${role}): ${message}`);
          bb.log.warn(`sync failed for ${repo} (${role}): ${message}`);
        }
      }
      // Recently merged authored PRs, so shipped work stays visible.
      try {
        for (const pr of await fetchPrs(repo, "author", "merged")) {
          byKey.set(`${pr.repo}#${pr.number}`, pr);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${repo} (merged): ${message}`);
        bb.log.warn(`sync failed for ${repo} (merged): ${message}`);
      }
    }
    try {
      const login = (await runGh(["api", "user", "--jq", ".login"])).trim();
      if (login) await bb.storage.kv.set("viewerLogin", login);
    } catch {
      // Keep any previously stored login.
    }
    const prs = [...byKey.values()];
    await bb.storage.kv.set("prs", prs);
    await bb.storage.kv.set("lastSyncAt", Date.now());
    await bb.storage.kv.set("lastError", errors.length ? errors.join("; ") : null);
    bb.realtime.publish("prs-updated", { count: prs.length });
    bb.log.info(`synced ${prs.length} PR(s), ${errors.length} error(s)`);
    return { synced: prs.length, errors };
  }

  bb.rpc.register(rpcContract, {
    async listPrs() {
      const stored = (await bb.storage.kv.get<PrRow[]>("prs")) ?? [];
      // Backfill rows cached before the author/group fields existed.
      const prs = stored.map((pr) => ({
        ...pr,
        author: pr.author ?? "unknown",
        group: pr.group ?? (pr.isDraft ? ("draft" as const) : ("ready" as const)),
        changesRequested: pr.changesRequested ?? false,
      }));
      const lastSyncAt = (await bb.storage.kv.get<number>("lastSyncAt")) ?? null;
      const lastError = (await bb.storage.kv.get<string | null>("lastError")) ?? null;
      const viewerLogin =
        (await bb.storage.kv.get<string>("viewerLogin")) ?? null;
      return { prs, lastSyncAt, lastError, viewerLogin };
    },
    async sync() {
      return sync();
    },
  });

  bb.background.schedule("sync", "*/5 * * * *", async () => {
    await sync();
  });

  bb.cli.register({
    name: "notion-ci",
    summary: "Notion PR + CI status (gh-backed cache)",
    commands: [
      { name: "prs", summary: "List cached PRs with CI state", usage: "bb notion-ci prs" },
      { name: "sync", summary: "Refresh the PR cache from GitHub now", usage: "bb notion-ci sync" },
    ],
    async run(argv) {
      const [command] = argv;
      if (command === "sync") {
        const result = await sync();
        return {
          exitCode: result.errors.length ? 1 : 0,
          stdout: `Synced ${result.synced} PR(s).`,
          stderr: result.errors.join("\n"),
        };
      }
      if (command === "prs" || command === undefined) {
        const prs = (await bb.storage.kv.get<PrRow[]>("prs")) ?? [];
        if (!prs.length) {
          return { exitCode: 0, stdout: "No cached PRs. Run `bb notion-ci sync`." };
        }
        const lines = prs.map((pr) => {
          const ci =
            pr.ciState === "failure"
              ? `FAIL(${pr.failingChecks.slice(0, 3).join(", ")})`
              : pr.ciState === "pending"
                ? `PENDING(${pr.pendingChecks})`
                : pr.ciState.toUpperCase();
          const draft = pr.isDraft ? " [draft]" : "";
          return `${pr.repo}#${pr.number}${draft} ${ci} ${pr.role} — ${pr.title}\n  ${pr.url}${pr.consoleUrl ? `\n  ${pr.consoleUrl}` : ""}`;
        });
        return { exitCode: 0, stdout: lines.join("\n") };
      }
      return {
        exitCode: 2,
        stdout: "",
        stderr: `Unknown command "${command}". Usage: bb notion-ci [prs|sync]`,
      };
    },
  });
}
