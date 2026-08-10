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
  role: z.enum(["author", "review-requested", "reviewed"]),
  author: z.string(),
  // This viewer's latest review on the PR, when they have reviewed it.
  myReview: z
    .enum(["approved", "changes_requested", "commented", "dismissed"])
    .nullable(),
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

function myReviewState(
  pr: RawPr,
  viewerLogin: string | null,
): PrRow["myReview"] {
  if (!viewerLogin) return null;
  const mine = (pr.latestReviews ?? []).find(
    (review) => review.author?.login === viewerLogin,
  );
  switch (mine?.state?.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "COMMENTED":
      return "commented";
    case "DISMISSED":
      return "dismissed";
    default:
      return null;
  }
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
  latestReviews?: { author?: { login?: string }; state?: string }[] | null;
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

const GH_BASE_FIELDS =
  "number,title,url,headRefName,isDraft,updatedAt,author,state,reviewDecision,latestReviews";
// Check rollups are the expensive part of the GraphQL query (GitHub 504s on
// large merged sets) and CI state on a merged PR is meaningless, so ask for
// them only on open PRs.
const GH_FIELDS = `${GH_BASE_FIELDS},statusCheckRollup`;

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
      // Bounded so one hung query cannot stall the whole (parallel) sync;
      // healthy calls finish in 1-7s.
      timeout: 45_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    return stdout;
  }

  async function fetchPrs(
    repo: string,
    role: PrRow["role"],
    state: "open" | "merged" = "open",
    viewerLogin: string | null = null,
  ): Promise<PrRow[]> {
    const roleArgs =
      role === "author"
        ? ["--author", "@me"]
        : role === "reviewed"
          ? ["--search", "reviewed-by:@me"]
          : ["--search", "review-requested:@me"];
    const limit =
      state === "merged" ? (role === "reviewed" ? "30" : "15") : "50";
    const args = (fields: string) => [
      "pr",
      "list",
      "-R",
      repo,
      ...roleArgs,
      "--state",
      state,
      "--json",
      fields,
      "--limit",
      limit,
    ];
    // statusCheckRollup is the expensive half of the GraphQL request: GitHub
    // 504s once a page with it grows past ~50 PRs. Rather than shrink the page
    // (which would silently hide PRs), degrade gracefully — retry without the
    // rollup so rows still appear, just without CI state.
    let stdout: string;
    if (state === "merged") {
      stdout = await runGh(args(GH_BASE_FIELDS));
    } else {
      try {
        stdout = await runGh(args(GH_FIELDS));
      } catch (error) {
        bb.log.warn(
          `rollup query failed for ${repo} (${role}); retrying without check state: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        stdout = await runGh(args(GH_BASE_FIELDS));
      }
    }
    const raw = JSON.parse(stdout) as RawPr[];
    const now = Date.now();
    return raw.map((pr) => ({
      repo,
      number: pr.number,
      role,
      myReview: myReviewState(pr, viewerLogin),
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

    // Every query is independent, so run them concurrently: wall clock is the
    // slowest single gh call instead of the sum of all of them.
    interface Query {
      repo: string;
      role: PrRow["role"];
      state: "open" | "merged";
    }
    const queries: Query[] = [];
    for (const repo of repoList) {
      queries.push({ repo, role: "author", state: "open" });
      if (includeReviewRequested) {
        queries.push({ repo, role: "review-requested", state: "open" });
      }
      // PRs this viewer has already reviewed (GitHub drops them from the
      // review-requested queue once a review is submitted).
      queries.push({ repo, role: "reviewed", state: "open" });
      // Recently merged authored PRs, so shipped work stays visible.
      queries.push({ repo, role: "author", state: "merged" });
      // …and merged PRs this viewer reviewed: once merged they are neither
      // authored by them nor still in any review queue, so without this they
      // vanish from every other query.
      queries.push({ repo, role: "reviewed", state: "merged" });
    }

    // Needed before mapping rows (to spot this viewer's own review), but the
    // login never changes, so it is a cache hit after the first sync.
    let viewerLogin = (await bb.storage.kv.get<string>("viewerLogin")) ?? null;
    if (!viewerLogin) {
      try {
        viewerLogin =
          (await runGh(["api", "user", "--jq", ".login"])).trim() || null;
        if (viewerLogin) await bb.storage.kv.set("viewerLogin", viewerLogin);
      } catch {
        viewerLogin = null;
      }
    }

    const settled = await Promise.all(
      queries.map(async (query) => {
        try {
          return {
            query,
            prs: await fetchPrs(
              query.repo,
              query.role,
              query.state,
              viewerLogin,
            ),
            error: null as string | null,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          bb.log.warn(
            `sync failed for ${query.repo} (${query.role}/${query.state}): ${message}`,
          );
          return { query, prs: [] as PrRow[], error: message };
        }
      }),
    );

    // Merge with the same precedence the sequential version had: merged rows
    // win, then author, then review-requested.
    const byKey = new Map<string, PrRow>();
    const precedence = (q: Query) =>
      q.state === "merged"
        ? 3
        : q.role === "author"
          ? 2
          : q.role === "reviewed"
            ? 1
            : 0;
    const rank = new Map<string, number>();
    for (const { query, prs, error } of settled) {
      if (error) {
        errors.push(`${query.repo} (${query.role}/${query.state}): ${error}`);
      }
      for (const pr of prs) {
        const key = `${pr.repo}#${pr.number}`;
        const score = precedence(query);
        if (!byKey.has(key) || score >= (rank.get(key) ?? -1)) {
          byKey.set(key, pr);
          rank.set(key, score);
        }
      }
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
        myReview: pr.myReview ?? null,
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
