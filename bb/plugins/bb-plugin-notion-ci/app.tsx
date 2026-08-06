// bb-plugin-notion-ci — navPanel dashboard for PR + CI state.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract, PrRow } from "./server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function ciBadge(pr: PrRow) {
  switch (pr.ciState) {
    case "success":
      return (
        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-success/15 text-success">
          CI green
        </span>
      );
    case "failure":
      return (
        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-destructive/15 text-destructive-text">
          CI failing
        </span>
      );
    case "pending":
      return (
        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-warning/15 text-warning-text">
          CI running ({pr.pendingChecks})
        </span>
      );
    default:
      return (
        <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
          no checks
        </span>
      );
  }
}

function PrCard({ pr }: { pr: PrRow }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        {ciBadge(pr)}
        {pr.isDraft ? (
          <span className="rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground">
            draft
          </span>
        ) : null}
        {pr.role === "review-requested" ? (
          <span className="rounded px-1.5 py-0.5 text-xs bg-primary/15 text-primary">
            review requested
          </span>
        ) : null}
        {pr.changesRequested ? (
          <span className="rounded px-1.5 py-0.5 text-xs bg-destructive/15 text-destructive-text">
            changes requested
          </span>
        ) : null}
        <span className="ml-auto text-xs text-subtle-foreground">
          {pr.repo.split("/").pop()} · {pr.author} · #{pr.number}
        </span>
      </div>
      <a
        href={pr.url}
        target="_blank"
        rel="noreferrer"
        className="block text-sm font-medium text-foreground hover:text-primary"
      >
        {pr.title}
      </a>
      <div className="font-mono text-xs text-muted-foreground truncate">
        {pr.branch}
      </div>
      {pr.failingChecks.length > 0 ? (
        <div className="text-xs text-destructive-text">
          Failing: {pr.failingChecks.slice(0, 4).join(", ")}
          {pr.failingChecks.length > 4
            ? ` +${pr.failingChecks.length - 4} more`
            : ""}
        </div>
      ) : null}
      <div className="flex gap-3 text-xs">
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
          >
            Deploy console
          </a>
        ) : null}
      </div>
    </div>
  );
}

function Dashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const [prs, setPrs] = useState<PrRow[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [viewerLogin, setViewerLogin] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [query, setQuery] = useState("");
  const [authorFilter, setAuthorFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<PrRow["group"] | "all">("all");
  const [groupBy, setGroupBy] = useState<"status" | "repo" | "none">("none");

  const refresh = useCallback(async () => {
    const result = await rpc.call("listPrs");
    setPrs(result.prs);
    setLastSyncAt(result.lastSyncAt);
    setLastError(result.lastError);
    setViewerLogin(result.viewerLogin);
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useRealtime("prs-updated", () => {
    void refresh();
  });

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await rpc.call("sync");
      if (result.errors.length) {
        toast.error(`Sync finished with errors: ${result.errors[0]}`);
      } else {
        toast.success(`Synced ${result.synced} PRs`);
      }
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSyncing(false);
    }
  }

  const needle = query.trim().toLowerCase();
  const filtered = prs.filter((pr) => {
    if (authorFilter === "mine") {
      if (viewerLogin === null || pr.author !== viewerLogin) return false;
    } else if (authorFilter !== "all" && pr.author !== authorFilter) {
      return false;
    }
    if (!needle) return true;
    return (
      String(pr.number).includes(needle.replace(/^#/, "")) ||
      pr.title.toLowerCase().includes(needle) ||
      pr.branch.toLowerCase().includes(needle) ||
      pr.author.toLowerCase().includes(needle)
    );
  });

  const authors = [...new Set(prs.map((pr) => pr.author))].sort();
  const STATUSES: { key: PrRow["group"]; label: string }[] = [
    { key: "ready", label: "Ready for review" },
    { key: "approved", label: "Approved" },
    { key: "draft", label: "Draft" },
    { key: "merged", label: "Merged" },
  ];
  // Status counts reflect the search/author filters so the chips stay honest.
  const statusCounts = new Map<PrRow["group"], number>();
  for (const pr of filtered) {
    statusCounts.set(pr.group, (statusCounts.get(pr.group) ?? 0) + 1);
  }
  const visible =
    statusFilter === "all"
      ? filtered
      : filtered.filter((pr) => pr.group === statusFilter);
  const failing = visible.filter((pr) => pr.ciState === "failure");

  const byUpdated = (a: PrRow, b: PrRow) => b.updatedAt.localeCompare(a.updatedAt);
  let sections: { label: string | null; prs: PrRow[] }[];
  if (groupBy === "status") {
    sections = STATUSES.map(({ key, label }) => ({
      label: `${label} (${statusCounts.get(key) ?? 0})`,
      prs: visible.filter((pr) => pr.group === key).sort(byUpdated),
    })).filter((section) => section.prs.length > 0);
  } else if (groupBy === "repo") {
    const repos = [...new Set(visible.map((pr) => pr.repo))].sort();
    sections = repos.map((repo) => ({
      label: repo,
      prs: visible.filter((pr) => pr.repo === repo).sort(byUpdated),
    }));
  } else {
    sections = [{ label: null, prs: [...visible].sort(byUpdated) }];
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search PR #, title, branch, author…"
            className="h-8 max-w-xs"
          />
          <Button
            size="sm"
            variant={authorFilter === "mine" ? "default" : "outline"}
            onClick={() =>
              setAuthorFilter(authorFilter === "mine" ? "all" : "mine")
            }
          >
            Mine{viewerLogin ? ` (${viewerLogin})` : ""}
          </Button>
          <select
            value={authorFilter === "mine" ? "all" : authorFilter}
            onChange={(event) => setAuthorFilter(event.target.value)}
            className="h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="all">All authors</option>
            {authors.map((author) => (
              <option key={author} value={author}>
                {author}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant={statusFilter === "all" ? "default" : "outline"}
            onClick={() => setStatusFilter("all")}
          >
            All ({filtered.length})
          </Button>
          {STATUSES.map(({ key, label }) => (
            <Button
              key={key}
              size="sm"
              variant={statusFilter === key ? "default" : "outline"}
              onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
            >
              {label} ({statusCounts.get(key) ?? 0})
            </Button>
          ))}
          <select
            value={groupBy}
            onChange={(event) =>
              setGroupBy(event.target.value as "status" | "repo" | "none")
            }
            className="ml-auto h-8 rounded-md border border-input bg-background px-2 text-sm text-foreground"
          >
            <option value="none">Flat list</option>
            <option value="status">Group: status</option>
            <option value="repo">Group: repo</option>
          </select>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm text-muted-foreground">
            {visible.length} of {prs.length} PRs
            {failing.length ? (
              <span className="text-destructive-text">
                {" "}
                · {failing.length} failing CI
              </span>
            ) : null}
            {lastSyncAt ? (
              <span className="text-subtle-foreground">
                {" "}
                · synced {new Date(lastSyncAt).toLocaleTimeString()}
              </span>
            ) : null}
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={syncing}
            onClick={() => void syncNow()}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
        {lastError ? (
          <div className="rounded border border-border bg-destructive/10 p-2 text-xs text-destructive-text">
            Last sync error: {lastError}
          </div>
        ) : null}
        {visible.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {prs.length === 0
              ? 'Nothing cached yet — hit "Sync now".'
              : "No PRs match the current filters."}
          </div>
        ) : (
          sections.map((section) => (
            <div key={section.label ?? "flat"} className="space-y-2">
              {section.label ? (
                <div className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                  {section.label}
                </div>
              ) : null}
              {section.prs.map((pr) => (
                <PrCard key={`${pr.repo}#${pr.number}`} pr={pr} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "ci",
    title: "Notion CI",
    icon: "GitPullRequest",
    path: "ci",
    component: Dashboard,
  });
});
