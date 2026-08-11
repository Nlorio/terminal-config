// bb-plugin-pr-inbox — a Graphite-style PR inbox for Notion repos.
//
// Experimental sibling of the notion-ci plugin: same gh-backed sync, but
// richer per-PR data (diff size, comment count, reviewers, stack position)
// bucketed into Graphite's inbox sections. Keeps GitHub + deploy-console
// links.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

export const BUCKETS = [
  "needs-your-review",
  "returned-to-you",
  "approved-or-merging",
  "waiting-for-reviewers",
  "reviewed-by-you",
  "drafts",
  "recently-merged",
] as const;

const reviewerSchema = z.object({
  login: z.string(),
  state: z.enum(["approved", "changes_requested", "commented", "pending"]),
});

const prSchema = z.object({
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  url: z.string(),
  consoleUrl: z.string().nullable(),
  author: z.string(),
  branch: z.string(),
  baseBranch: z.string(),
  isDraft: z.boolean(),
  updatedAt: z.string(),
  bucket: z.enum(BUCKETS),
  additions: z.number(),
  deletions: z.number(),
  commentCount: z.number(),
  labels: z.array(z.string()),
  reviewers: z.array(reviewerSchema),
  myReview: z
    .enum(["approved", "changes_requested", "commented", "dismissed"])
    .nullable(),
  reviewDecision: z.enum(["approved", "changes_requested", "review_required"]).nullable(),
  ciState: z.enum(["success", "failure", "pending", "none"]),
  failingChecks: z.array(z.string()),
  // Review was requested from this viewer personally, not just via a team.
  directReviewRequest: z.boolean(),
  // Team slugs a review is requested from (e.g. "makenotion/monetization").
  reviewTeams: z.array(z.string()),
  // Position within a stack of PRs chained by base branch (1-based).
  stackPosition: z.number().nullable(),
  stackTotal: z.number().nullable(),
});
export type InboxPr = z.infer<typeof prSchema>;

export const rpcContract = defineRpcContract({
  list: {
    input: z.null(),
    output: z.object({
      prs: z.array(prSchema),
      viewerLogin: z.string().nullable(),
      lastSyncAt: z.number().nullable(),
      lastError: z.string().nullable(),
    }),
  },
  sync: {
    input: z.null(),
    output: z.object({ synced: z.number(), errors: z.array(z.string()) }),
  },
});

interface RawReview {
  author?: { login?: string } | null;
  state?: string;
}

interface RawPr {
  number: number;
  title: string;
  url: string;
  headRefName: string;
  baseRefName: string;
  isDraft: boolean;
  updatedAt: string;
  author: { login?: string } | null;
  state: string;
  reviewDecision: string | null;
  latestReviews?: RawReview[] | null;
  // Mixed list: {__typename:"User", login} and {__typename:"Team", name, slug}.
  reviewRequests?:
    | { __typename?: string; login?: string; name?: string; slug?: string }[]
    | null;
  additions?: number;
  deletions?: number;
  comments?: unknown[] | null;
  labels?: { name?: string }[] | null;
  statusCheckRollup?:
    | { name?: string; context?: string; status?: string; conclusion?: string; state?: string }[]
    | null;
}

const BASE_FIELDS =
  "number,title,url,headRefName,baseRefName,isDraft,updatedAt,author,state,reviewDecision,latestReviews,reviewRequests,additions,deletions,labels";
// statusCheckRollup is by far the most expensive field: GitHub's GraphQL
// endpoint 504s on a 60-PR page that includes it, while the same page without
// it returns fine. Only request it on pages small enough to survive.
const OPEN_FIELDS = `${BASE_FIELDS},comments,statusCheckRollup`;
const OPEN_LIMIT = 50;
// Largest page GitHub reliably serves *with* the rollup; measured 504s above
// this, while the same page without the rollup returns in ~2s.
const ROLLUP_PAGE = 30;

function summarizeChecks(checks: RawPr["statusCheckRollup"]): {
  ciState: InboxPr["ciState"];
  failingChecks: string[];
} {
  if (!checks?.length) return { ciState: "none", failingChecks: [] };
  const failing: string[] = [];
  let pending = 0;
  for (const check of checks) {
    const name = check.name ?? check.context ?? "unknown";
    const verdict = (check.conclusion ?? check.state ?? "").toUpperCase();
    const running = (check.status ?? "").toUpperCase();
    if (["FAILURE", "ERROR", "TIMED_OUT"].includes(verdict)) failing.push(name);
    else if (
      ["IN_PROGRESS", "QUEUED"].includes(running) ||
      verdict === "PENDING" ||
      (verdict === "" && running !== "COMPLETED")
    ) {
      pending += 1;
    }
  }
  return {
    ciState: failing.length ? "failure" : pending ? "pending" : "success",
    failingChecks: [...new Set(failing)],
  };
}

function normalizeReviewState(state?: string): InboxPr["myReview"] {
  switch (state?.toUpperCase()) {
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

function normalizeDecision(decision: string | null): InboxPr["reviewDecision"] {
  switch (decision?.toUpperCase()) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes_requested";
    case "REVIEW_REQUIRED":
      return "review_required";
    default:
      return null;
  }
}

// Graphite's inbox semantics, expressed over the data gh gives us. Order
// matters: the first matching rule owns the PR so sections never double-count.
function bucketFor(args: {
  authoredByViewer: boolean;
  isDraft: boolean;
  merged: boolean;
  myReview: InboxPr["myReview"];
  decision: InboxPr["reviewDecision"];
  reviewRequestedOfViewer: boolean;
}): InboxPr["bucket"] {
  const { authoredByViewer, isDraft, merged, myReview, decision } = args;
  if (merged) return "recently-merged";
  if (authoredByViewer) {
    if (isDraft) return "drafts";
    if (decision === "changes_requested") return "returned-to-you";
    if (decision === "approved") return "approved-or-merging";
    return "waiting-for-reviewers";
  }
  // Someone else's PR that you approved and that is now fully approved is
  // waiting to land, not waiting on you — surface it next to your own
  // ready-to-merge work rather than burying it under "reviewed by you".
  if (myReview === "approved" && decision === "approved") {
    return "approved-or-merging";
  }
  // Still approved by you but not by everyone required: it is in flight.
  if (myReview !== null) return "reviewed-by-you";
  return "needs-your-review";
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    repos: {
      type: "string",
      label: 'Repositories (comma-separated "owner/repo")',
      default: "makenotion/notion-next,makenotion/notion-data",
    },
    mergedLimit: {
      type: "string",
      label: "How many recently merged PRs to keep per query",
      default: "20",
    },
  });

  async function runGh(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync("gh", args, {
      env: {
        ...process.env,
        PATH: `${process.env.PATH ?? ""}:/opt/homebrew/bin:/usr/local/bin`,
      },
      timeout: 45_000,
      maxBuffer: 32 * 1024 * 1024,
    });
    return stdout;
  }

  async function viewer(): Promise<string | null> {
    const cached = await bb.storage.kv.get<string>("viewerLogin");
    if (cached) return cached;
    try {
      const login = (await runGh(["api", "user", "--jq", ".login"])).trim();
      if (login) await bb.storage.kv.set("viewerLogin", login);
      return login || null;
    } catch {
      return null;
    }
  }

  interface Query {
    repo: string;
    search: string[];
    state: "open" | "merged";
  }

  async function fetchQuery(
    query: Query,
    viewerLogin: string | null,
    mergedLimit: number,
  ): Promise<InboxPr[]> {
    const args = (fields: string, limitOverride?: number) => [
      "pr",
      "list",
      "-R",
      query.repo,
      ...query.search,
      "--state",
      query.state,
      "--json",
      fields,
      "--limit",
      String(
        limitOverride ??
          (query.state === "merged" ? mergedLimit : OPEN_LIMIT),
      ),
    ];
    // Two concurrent requests beat one compromise: a cheap rollup-free page
    // gives the complete list (a 50-PR page including the rollup 504s), and a
    // small rollup page supplies CI state for the newest PRs. Rows beyond that
    // window simply show no check state instead of vanishing.
    let stdout: string;
    let rollupByNumber = new Map<number, RawPr["statusCheckRollup"]>();
    if (query.state === "merged") {
      stdout = await runGh(args(BASE_FIELDS));
    } else {
      const [listOut, rollupOut] = await Promise.all([
        runGh(args(BASE_FIELDS)),
        runGh(args(OPEN_FIELDS, ROLLUP_PAGE)).catch((error: unknown) => {
          bb.log.warn(
            `rollup page failed for ${query.repo} ${query.search.join(" ")}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          return null;
        }),
      ]);
      stdout = listOut;
      if (rollupOut) {
        rollupByNumber = new Map(
          (JSON.parse(rollupOut) as RawPr[]).map((pr) => [
            pr.number,
            pr.statusCheckRollup,
          ]),
        );
      }
    }
    const raw = JSON.parse(stdout) as RawPr[];
    return raw.map((pr) => {
      const author = pr.author?.login ?? "unknown";
      const myReview = viewerLogin
        ? normalizeReviewState(
            (pr.latestReviews ?? []).find(
              (review) => review.author?.login === viewerLogin,
            )?.state,
          )
        : null;
      const requests = pr.reviewRequests ?? [];
      const reviewers: InboxPr["reviewers"] = [
        ...(pr.latestReviews ?? []).flatMap((review) => {
          const login = review.author?.login;
          const state = normalizeReviewState(review.state);
          return login && state && state !== "dismissed"
            ? [{ login, state }]
            : [];
        }),
        ...requests.flatMap((request) =>
          request.login ? [{ login: request.login, state: "pending" as const }] : [],
        ),
      ];
      const reviewTeams = requests.flatMap((request) =>
        request.__typename === "Team" && (request.slug ?? request.name)
          ? [request.slug ?? request.name!]
          : [],
      );
      const directReviewRequest =
        viewerLogin !== null &&
        requests.some((request) => request.login === viewerLogin);
      const decision = normalizeDecision(pr.reviewDecision);
      return {
        repo: query.repo,
        number: pr.number,
        title: pr.title,
        url: pr.url,
        consoleUrl:
          query.repo === "makenotion/notion-next"
            ? `https://console.makenotion.com/deploy?tab=pullRequests&pr=${pr.number}`
            : null,
        author,
        branch: pr.headRefName,
        baseBranch: pr.baseRefName,
        isDraft: pr.isDraft,
        updatedAt: pr.updatedAt,
        bucket: bucketFor({
          authoredByViewer: viewerLogin !== null && author === viewerLogin,
          isDraft: pr.isDraft,
          merged: query.state === "merged",
          myReview,
          decision,
          reviewRequestedOfViewer: (pr.reviewRequests ?? []).some(
            (request) => request.login === viewerLogin,
          ),
        }),
        additions: pr.additions ?? 0,
        deletions: pr.deletions ?? 0,
        commentCount: pr.comments?.length ?? 0,
        labels: (pr.labels ?? []).flatMap((label) =>
          label.name ? [label.name] : [],
        ),
        reviewers,
        myReview,
        reviewDecision: decision,
        ...summarizeChecks(
          pr.statusCheckRollup ?? rollupByNumber.get(pr.number) ?? null,
        ),
        directReviewRequest,
        reviewTeams,
        stackPosition: null,
        stackTotal: null,
      };
    });
  }

  // Stacked PRs: a PR whose base branch is another cached PR's head branch is
  // one layer up that stack. Walk each chain once and stamp position/total.
  function annotateStacks(prs: InboxPr[]): void {
    const byBranch = new Map<string, InboxPr>();
    for (const pr of prs) {
      if (!byBranch.has(pr.branch)) byBranch.set(pr.branch, pr);
    }
    const depthCache = new Map<string, number>();
    const depth = (pr: InboxPr, seen = new Set<string>()): number => {
      const cached = depthCache.get(pr.branch);
      if (cached !== undefined) return cached;
      if (seen.has(pr.branch)) return 1;
      seen.add(pr.branch);
      const parent = byBranch.get(pr.baseBranch);
      const value = parent ? depth(parent, seen) + 1 : 1;
      depthCache.set(pr.branch, value);
      return value;
    };
    // Root branch of each chain, so every member shares one total.
    const rootOf = (pr: InboxPr, seen = new Set<string>()): string => {
      if (seen.has(pr.branch)) return pr.branch;
      seen.add(pr.branch);
      const parent = byBranch.get(pr.baseBranch);
      return parent ? rootOf(parent, seen) : pr.branch;
    };
    const totals = new Map<string, number>();
    for (const pr of prs) {
      const root = rootOf(pr);
      totals.set(root, Math.max(totals.get(root) ?? 0, depth(pr)));
    }
    for (const pr of prs) {
      const total = totals.get(rootOf(pr)) ?? 1;
      if (total > 1) {
        pr.stackPosition = depth(pr);
        pr.stackTotal = total;
      }
    }
  }

  async function sync(): Promise<{ synced: number; errors: string[] }> {
    const { repos, mergedLimit } = await settings.get();
    const repoList = repos
      .split(",")
      .map((repo) => repo.trim())
      .filter(Boolean);
    const limit = Number(mergedLimit) || 20;
    const viewerLogin = await viewer();

    const queries: Query[] = [];
    for (const repo of repoList) {
      queries.push({ repo, search: ["--author", "@me"], state: "open" });
      queries.push({
        repo,
        search: ["--search", "review-requested:@me"],
        state: "open",
      });
      queries.push({
        repo,
        search: ["--search", "reviewed-by:@me"],
        state: "open",
      });
      queries.push({ repo, search: ["--author", "@me"], state: "merged" });
      queries.push({
        repo,
        search: ["--search", "reviewed-by:@me"],
        state: "merged",
      });
    }

    const errors: string[] = [];
    const settled = await Promise.all(
      queries.map(async (query) => {
        try {
          return await fetchQuery(query, viewerLogin, limit);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${query.repo} ${query.search.join(" ")}: ${message}`);
          bb.log.warn(`sync failed: ${message}`);
          return [] as InboxPr[];
        }
      }),
    );

    // Dedupe; an open row always beats the merged copy of the same PR.
    const byKey = new Map<string, InboxPr>();
    for (const pr of settled.flat()) {
      const key = `${pr.repo}#${pr.number}`;
      const existing = byKey.get(key);
      if (!existing || existing.bucket === "recently-merged") byKey.set(key, pr);
    }
    const prs = [...byKey.values()];
    annotateStacks(prs);

    await bb.storage.kv.set("prs", prs);
    await bb.storage.kv.set("lastSyncAt", Date.now());
    await bb.storage.kv.set("lastError", errors.length ? errors.join("; ") : null);
    bb.realtime.publish("inbox-updated", { count: prs.length });
    bb.log.info(`synced ${prs.length} PR(s), ${errors.length} error(s)`);
    return { synced: prs.length, errors };
  }

  bb.rpc.register(rpcContract, {
    async list() {
      return {
        prs: (await bb.storage.kv.get<InboxPr[]>("prs")) ?? [],
        viewerLogin: (await bb.storage.kv.get<string>("viewerLogin")) ?? null,
        lastSyncAt: (await bb.storage.kv.get<number>("lastSyncAt")) ?? null,
        lastError: (await bb.storage.kv.get<string | null>("lastError")) ?? null,
      };
    },
    async sync() {
      return sync();
    },
  });

  bb.background.schedule("sync", "*/5 * * * *", async () => {
    await sync();
  });

  bb.cli.register({
    name: "pr-inbox",
    summary: "PR inbox: your review queue and open PRs with CI state",
    commands: [
      {
        name: "list",
        summary: "List cached PRs, grouped by inbox section",
        usage: "bb pr-inbox list [section]",
      },
      {
        name: "sync",
        summary: "Refresh the PR cache from GitHub now",
        usage: "bb pr-inbox sync",
      },
    ],
    async run(argv) {
      const [command, filter] = argv;
      if (command === "sync") {
        const result = await sync();
        return {
          exitCode: result.errors.length ? 1 : 0,
          stdout: `Synced ${result.synced} PR(s).`,
          stderr: result.errors.join("\n"),
        };
      }
      if (command === "list" || command === undefined) {
        const prs = (await bb.storage.kv.get<InboxPr[]>("prs")) ?? [];
        if (!prs.length) {
          return { exitCode: 0, stdout: "Nothing cached. Run `bb pr-inbox sync`." };
        }
        const lines: string[] = [];
        for (const bucket of BUCKETS) {
          if (filter && bucket !== filter) continue;
          const rows = prs.filter((pr) => pr.bucket === bucket);
          if (!rows.length) continue;
          lines.push(`${bucket} (${rows.length}):`);
          for (const pr of rows) {
            const ci =
              pr.ciState === "failure"
                ? `CI FAIL(${pr.failingChecks.slice(0, 2).join(", ")})`
                : pr.ciState === "pending"
                  ? "CI pending"
                  : pr.ciState === "success"
                    ? "CI ok"
                    : "CI —";
            const teams = pr.reviewTeams.length
              ? ` [${pr.reviewTeams.map((team) => team.split("/").pop()).join(",")}]`
              : "";
            const stack = pr.stackTotal
              ? ` stack ${pr.stackPosition}/${pr.stackTotal}`
              : "";
            lines.push(
              `  ${pr.repo}#${pr.number} ${ci}${teams}${stack} +${pr.additions}/-${pr.deletions} ${pr.author} — ${pr.title}`,
            );
            lines.push(`    ${pr.url}${pr.consoleUrl ? `\n    ${pr.consoleUrl}` : ""}`);
          }
        }
        return {
          exitCode: 0,
          stdout: lines.length
            ? lines.join("\n")
            : `No PRs in section "${filter}". Sections: ${BUCKETS.join(", ")}`,
        };
      }
      return {
        exitCode: 2,
        stdout: "",
        stderr: `Unknown command "${command}". Usage: bb pr-inbox [list|sync]`,
      };
    },
  });
}
