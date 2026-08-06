// bb-plugin-worktrees — worktree dashboard UI.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useBbNavigate, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract, WorktreeRow } from "./server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const STALE_DAYS = 14;

function age(ts: number | null): string {
  if (!ts) return "—";
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 1) return "today";
  if (days < 2) return "1 day ago";
  return `${Math.floor(days)} days ago`;
}

function isStale(row: WorktreeRow): boolean {
  if (row.isMain) return false;
  const lastActivity = Math.max(
    row.lastCommitAt ?? 0,
    row.lastThreadActivityAt ?? 0,
  );
  const old = lastActivity < Date.now() - STALE_DAYS * 86_400_000;
  return (row.mergedToMain && row.dirtyFiles === 0) || (old && row.dirtyFiles === 0);
}

function Badge({
  tone,
  children,
}: {
  tone: "success" | "warn" | "danger" | "muted" | "primary";
  children: React.ReactNode;
}) {
  const classes = {
    success: "bg-success/15 text-success",
    warn: "bg-warning/15 text-warning-text",
    danger: "bg-destructive/15 text-destructive-text",
    muted: "bg-muted text-muted-foreground",
    primary: "bg-primary/15 text-primary",
  }[tone];
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${classes}`}>
      {children}
    </span>
  );
}

function WorktreeCard({
  row,
  rootPath,
  onRefresh,
}: {
  row: WorktreeRow;
  rootPath: string;
  onRefresh: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [promptOpen, setPromptOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const stale = isStale(row);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-medium">
          {row.branch ?? row.head}
        </span>
        {row.isMain ? <Badge tone="primary">main checkout</Badge> : null}
        {row.managed ? (
          <Badge tone="primary">bb-managed</Badge>
        ) : row.isMain ? null : (
          <Badge tone="muted">external</Badge>
        )}
        {row.dirtyFiles > 0 ? (
          <Badge tone="warn">{row.dirtyFiles} dirty</Badge>
        ) : row.dirtyFiles === 0 ? (
          <Badge tone="success">clean</Badge>
        ) : (
          <Badge tone="muted">unreadable</Badge>
        )}
        {row.mergedToMain && !row.isMain ? (
          <Badge tone="success">merged to main</Badge>
        ) : null}
        {stale ? <Badge tone="danger">stale</Badge> : null}
      </div>
      <div className="font-mono text-xs text-subtle-foreground">{row.path}</div>
      <div className="text-xs text-muted-foreground">
        last commit {age(row.lastCommitAt)}
        {row.threads.length
          ? ` · ${row.threads.length} thread(s), active ${age(row.lastThreadActivityAt)}`
          : " · no threads"}
      </div>
      {row.threads.length ? (
        <div className="flex flex-wrap gap-1.5">
          {row.threads.slice(0, 6).map((thread) => (
            <button
              key={thread.id}
              type="button"
              className="rounded border border-border px-1.5 py-0.5 text-xs text-foreground hover:bg-state-hover"
              onClick={() => navigate.toThread(thread.id)}
              title={thread.title}
            >
              {thread.title.slice(0, 40)}
            </button>
          ))}
          {row.threads.length > 6 ? (
            <span className="text-xs text-subtle-foreground">
              +{row.threads.length - 6} more
            </span>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPromptOpen((value) => !value)}
        >
          New thread here
        </Button>
        {row.hostId ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await rpc.call("openTerminal", {
                  hostId: row.hostId!,
                  path: row.path,
                  title: row.branch ?? row.path.split("/").pop() ?? "worktree",
                });
                toast.success("Terminal started (see thread panel / terminals).");
              })
            }
          >
            Terminal here
          </Button>
        ) : null}
        {row.environmentId ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const result = await rpc.call("archiveThreads", {
                  environmentId: row.environmentId!,
                });
                if (result.ok) toast.success(result.message);
                else toast.error(result.message);
                onRefresh();
              })
            }
          >
            Archive threads
          </Button>
        ) : null}
        {!row.isMain ? (
          confirmRemove ? (
            <span className="flex items-center gap-1">
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const result = await rpc.call("removeWorktree", {
                      rootPath,
                      path: row.path,
                      force: row.dirtyFiles !== 0,
                    });
                    if (result.ok) toast.success(result.message);
                    else toast.error(result.message);
                    setConfirmRemove(false);
                    onRefresh();
                  })
                }
              >
                {row.dirtyFiles > 0
                  ? `Force remove (${row.dirtyFiles} dirty files)`
                  : "Confirm remove"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmRemove(false)}
              >
                ✕
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive-text"
              disabled={busy}
              onClick={() => setConfirmRemove(true)}
            >
              Remove worktree
            </Button>
          )
        ) : null}
      </div>
      {promptOpen ? (
        <div className="flex gap-2">
          <Input
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="What should the agent do in this worktree?"
            className="h-8"
          />
          <Button
            size="sm"
            disabled={busy || !prompt.trim()}
            onClick={() =>
              void run(async () => {
                const result = await rpc.call("startThread", {
                  projectId: row.projectId,
                  hostId: row.hostId,
                  path: row.path,
                  prompt: prompt.trim(),
                });
                toast.success("Thread started.");
                setPrompt("");
                setPromptOpen(false);
                navigate.toThread(result.threadId);
              })
            }
          >
            Start
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Dashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const [rows, setRows] = useState<WorktreeRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [staleOnly, setStaleOnly] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rpc.call("listWorktrees");
      setRows(result.worktrees);
      setErrors(result.errors);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const visible = staleOnly ? rows.filter(isStale) : rows;
  const staleCount = rows.filter(isStale).length;
  const projects = [...new Set(visible.map((row) => row.projectName))];
  const rootFor = (projectName: string) =>
    rows.find((row) => row.projectName === projectName && row.isMain)?.path ?? "";

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5">
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex items-center gap-2">
          <div className="text-sm text-muted-foreground">
            {rows.length} worktrees
            {staleCount ? (
              <span className="text-destructive-text"> · {staleCount} stale</span>
            ) : null}
          </div>
          <Button
            size="sm"
            variant={staleOnly ? "default" : "outline"}
            className="ml-auto"
            onClick={() => setStaleOnly((value) => !value)}
          >
            Stale only ({staleCount})
          </Button>
          <Button size="sm" variant="outline" disabled={loading} onClick={() => void refresh()}>
            {loading ? "Scanning…" : "Rescan"}
          </Button>
        </div>
        {errors.map((error) => (
          <div
            key={error}
            className="rounded border border-border bg-destructive/10 p-2 text-xs text-destructive-text"
          >
            {error}
          </div>
        ))}
        {projects.map((projectName) => (
          <div key={projectName} className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
              {projectName}
            </div>
            {visible
              .filter((row) => row.projectName === projectName)
              .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.path.localeCompare(b.path))
              .map((row) => (
                <WorktreeCard
                  key={row.path}
                  row={row}
                  rootPath={rootFor(projectName)}
                  onRefresh={() => void refresh()}
                />
              ))}
          </div>
        ))}
        {!loading && visible.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            {staleOnly ? "No stale worktrees. 🎉" : "No worktrees found."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "worktrees",
    title: "Worktrees",
    icon: "GitBranch",
    path: "worktrees",
    component: Dashboard,
  });
});
