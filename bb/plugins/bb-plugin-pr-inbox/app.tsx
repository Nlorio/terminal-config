// bb-plugin-pr-inbox — Graphite-style PR inbox.
//
// Collapsible sections of dense rows: avatar, title + author·repo#number,
// reviewer avatars, comments, stack position, review/CI status glyphs, diff
// size, relative age. Title links to GitHub; the ⚙ chip links to the deploy
// console.
import { useCallback, useEffect, useMemo, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract, InboxPr } from "./server";
import { Button } from "@/components/ui/button";

// "Needs your review" is split by *who* was asked: you personally first, then
// each watched team, then anything else. Team slugs come from GitHub's
// reviewRequests, so this needs no extra queries.
const REVIEW_TEAMS: { slug: string; label: string }[] = [
  { slug: "makenotion/monetization", label: "Monetization" },
  {
    slug: "makenotion/monetization-foundations",
    label: "Monetization Foundations",
  },
];

const SECTIONS: { key: InboxPr["bucket"]; label: string; openByDefault: boolean }[] = [
  { key: "returned-to-you", label: "Returned to you", openByDefault: true },
  { key: "approved-or-merging", label: "Approved or merging", openByDefault: true },
  { key: "waiting-for-reviewers", label: "Waiting for reviewers", openByDefault: true },
  { key: "reviewed-by-you", label: "Reviewed by you", openByDefault: false },
  { key: "drafts", label: "Drafts", openByDefault: false },
  { key: "recently-merged", label: "Recently merged", openByDefault: false },
];

function relativeAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  return `${Math.round(days / 30)}mo`;
}

function Avatar({ login, size = 20 }: { login: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initials = login.slice(0, 2).toUpperCase();
  if (failed) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full bg-muted text-[9px] font-medium text-muted-foreground"
        style={{ width: size, height: size }}
        title={login}
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      src={`https://github.com/${encodeURIComponent(login)}.png?size=${size * 2}`}
      alt={login}
      title={login}
      width={size}
      height={size}
      loading="lazy"
      className="shrink-0 rounded-full bg-muted"
      onError={() => setFailed(true)}
    />
  );
}

// Review, CI, and merge-readiness glyphs — the three status columns.
function ReviewGlyph({ pr }: { pr: InboxPr }) {
  if (pr.reviewDecision === "approved") {
    return <span className="text-success" title="Approved">✓</span>;
  }
  if (pr.reviewDecision === "changes_requested") {
    return (
      <span className="text-destructive-text" title="Changes requested">
        ✕
      </span>
    );
  }
  return (
    <span className="text-subtle-foreground" title="Review required">
      ◦
    </span>
  );
}

function CiGlyph({ pr }: { pr: InboxPr }) {
  switch (pr.ciState) {
    case "success":
      return <span className="text-success" title="Checks passing">●</span>;
    case "failure":
      return (
        <span
          className="text-destructive-text"
          title={`Failing: ${pr.failingChecks.slice(0, 5).join(", ")}`}
        >
          ✕
        </span>
      );
    case "pending":
      return <span className="text-warning-text" title="Checks running">◐</span>;
    default:
      return <span className="text-subtle-foreground" title="No checks">—</span>;
  }
}

function Row({ pr }: { pr: InboxPr }) {
  const reviewers = pr.reviewers.slice(0, 5);
  return (
    <div className="flex items-center gap-2 border-t border-border-hairline px-3 py-1.5 hover:bg-state-hover">
      <Avatar login={pr.author} />
      <span className="min-w-0 flex-1">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="block truncate text-sm font-medium text-foreground hover:text-primary hover:underline"
        >
          {pr.title}
        </a>
        <span className="block truncate text-xs text-subtle-foreground">
          {pr.author} · {pr.repo} #{pr.number}
          {pr.labels.length ? ` · ${pr.labels.slice(0, 2).join(", ")}` : ""}
        </span>
      </span>
      <span className="hidden shrink-0 items-center gap-0.5 sm:flex">
        {reviewers.map((reviewer) => (
          <span
            key={reviewer.login}
            className={
              reviewer.state === "approved"
                ? "rounded-full ring-1 ring-success"
                : reviewer.state === "changes_requested"
                  ? "rounded-full ring-1 ring-destructive"
                  : "rounded-full opacity-60"
            }
            title={`${reviewer.login}: ${reviewer.state.replace("_", " ")}`}
          >
            <Avatar login={reviewer.login} size={18} />
          </span>
        ))}
        {pr.reviewers.length > 5 ? (
          <span className="text-xs text-subtle-foreground">
            +{pr.reviewers.length - 5}
          </span>
        ) : null}
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {pr.commentCount > 0 ? `💬${pr.commentCount}` : ""}
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {pr.stackTotal ? `${pr.stackPosition}/${pr.stackTotal}` : ""}
      </span>
      <span className="w-5 shrink-0 text-center text-sm">
        <ReviewGlyph pr={pr} />
      </span>
      <span className="w-5 shrink-0 text-center text-sm">
        <CiGlyph pr={pr} />
      </span>
      <span className="w-24 shrink-0 text-right font-mono text-xs">
        <span className="text-success">+{pr.additions.toLocaleString()}</span>{" "}
        <span className="text-destructive-text">
          −{pr.deletions.toLocaleString()}
        </span>
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
        {relativeAge(pr.updatedAt)}
      </span>
      <span className="flex w-28 shrink-0 justify-end gap-2 text-xs">
        <a
          href={pr.url}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          GitHub
        </a>
        {pr.consoleUrl ? (
          <a
            href={pr.consoleUrl}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
            title="Infra deploy console"
          >
            Deploy
          </a>
        ) : null}
      </span>
    </div>
  );
}

function Section({
  label,
  prs,
  openByDefault,
}: {
  label: string;
  prs: InboxPr[];
  openByDefault: boolean;
}) {
  const [open, setOpen] = useState(openByDefault);
  const [sort, setSort] = useState<"updated" | "changes">("updated");
  const sorted = useMemo(
    () =>
      [...prs].sort((a, b) =>
        sort === "updated"
          ? b.updatedAt.localeCompare(a.updatedAt)
          : b.additions + b.deletions - (a.additions + a.deletions),
      ),
    [prs, sort],
  );
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          onClick={() => setOpen((value) => !value)}
        >
          <span className="w-3 text-xs text-muted-foreground">
            {open ? "▾" : "▸"}
          </span>
          <span className="text-sm font-semibold">{label}</span>
          <span className="text-sm text-muted-foreground">{prs.length}</span>
        </button>
        {open && prs.length > 0 ? (
          <button
            type="button"
            className="text-xs text-subtle-foreground hover:text-foreground"
            title="Toggle sort"
            onClick={() =>
              setSort((value) => (value === "updated" ? "changes" : "updated"))
            }
          >
            sort: {sort}
          </button>
        ) : null}
      </div>
      {open && prs.length > 0 ? (
        <div>
          {sorted.map((pr) => (
            <Row key={`${pr.repo}#${pr.number}`} pr={pr} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Inbox() {
  const rpc = useRpc<typeof rpcContract>();
  const [prs, setPrs] = useState<InboxPr[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");

  const refresh = useCallback(async () => {
    const result = await rpc.call("list");
    setPrs(result.prs);
    setLastSyncAt(result.lastSyncAt);
    setLastError(result.lastError);
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime("inbox-updated", () => void refresh());

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await rpc.call("sync");
      if (result.errors.length) toast.error(result.errors[0]!);
      else toast.success(`Synced ${result.synced} PRs`);
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? prs.filter(
        (pr) =>
          pr.title.toLowerCase().includes(needle) ||
          pr.author.toLowerCase().includes(needle) ||
          pr.branch.toLowerCase().includes(needle) ||
          String(pr.number).includes(needle.replace(/^#/, "")),
      )
    : prs;

  // Split the review queue by requester. First match wins, so a PR that asks
  // for you personally never also shows up under one of your teams.
  const reviewSections = useMemo(() => {
    const queue = filtered.filter((pr) => pr.bucket === "needs-your-review");
    const claimed = new Set<InboxPr>();
    const take = (predicate: (pr: InboxPr) => boolean) => {
      const picked = queue.filter((pr) => !claimed.has(pr) && predicate(pr));
      picked.forEach((pr) => claimed.add(pr));
      return picked;
    };
    const direct = take((pr) => pr.directReviewRequest);
    const teams = REVIEW_TEAMS.map((team) => ({
      key: `team:${team.slug}`,
      label: `Review for ${team.label}`,
      openByDefault: true,
      prs: take((pr) => pr.reviewTeams.includes(team.slug)),
    }));
    const rest = queue.filter((pr) => !claimed.has(pr));
    return [
      {
        key: "direct",
        label: "Requested from you directly",
        openByDefault: true,
        prs: direct,
      },
      ...teams,
      {
        key: "other-teams",
        label: "Review for other teams",
        openByDefault: false,
        prs: rest,
      },
    ];
  }, [filtered]);

  return (
    <div className="h-full overflow-y-auto p-3 md:p-4">
      <div className="mx-auto w-full max-w-6xl space-y-2">
        <div className="flex items-center gap-2 pb-1">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter…"
            className="h-8 w-56 rounded-md border border-input bg-background px-2 text-sm text-foreground placeholder:text-subtle-foreground"
          />
          <span className="text-xs text-subtle-foreground">
            {filtered.length} PRs
            {lastSyncAt
              ? ` · synced ${new Date(lastSyncAt).toLocaleTimeString()}`
              : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={syncing}
            onClick={() => void syncNow()}
          >
            {syncing ? "Syncing…" : "Sync"}
          </Button>
        </div>
        {lastError ? (
          <div className="rounded border border-border bg-destructive/10 p-2 text-xs text-destructive-text">
            {lastError}
          </div>
        ) : null}
        {reviewSections.map((section) => (
          <Section
            key={section.key}
            label={section.label}
            openByDefault={section.openByDefault}
            prs={section.prs}
          />
        ))}
        {SECTIONS.map((section) => (
          <Section
            key={section.key}
            label={section.label}
            openByDefault={section.openByDefault}
            prs={filtered.filter((pr) => pr.bucket === section.key)}
          />
        ))}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "inbox",
    title: "PR Inbox",
    icon: "Inbox",
    path: "inbox",
    component: Inbox,
  });
});
