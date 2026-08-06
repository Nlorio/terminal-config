// bb-plugin-worktrees — simple worktree table: worktree, project, last touched.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRealtime, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract, WorktreeRow } from "./server";
import { Button } from "@/components/ui/button";

function lastTouched(row: WorktreeRow): number | null {
  const candidates = [row.lastCommitAt, row.lastThreadActivityAt].filter(
    (value): value is number => value !== null,
  );
  return candidates.length ? Math.max(...candidates) : null;
}

function formatAge(ts: number | null): string {
  if (!ts) return "—";
  const days = (Date.now() - ts) / 86_400_000;
  if (days < 1 / 24) return "just now";
  if (days < 1) return `${Math.round(days * 24)}h ago`;
  if (days < 2) return "1 day ago";
  if (days < 60) return `${Math.floor(days)} days ago`;
  return new Date(ts).toLocaleDateString();
}

function AdoptCell({
  row,
  onAdopted,
}: {
  row: WorktreeRow;
  onAdopted: () => void;
}) {
  const rpc = useRpc<typeof rpcContract>();
  const [busy, setBusy] = useState(false);
  if (row.isMain) {
    return <span className="text-xs text-subtle-foreground">—</span>;
  }
  if (row.environmentId) {
    return <span className="text-xs text-success">✓ selectable</span>;
  }
  return (
    <Button
      size="sm"
      variant="outline"
      className="h-6 px-2 text-xs"
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void rpc
          .call("adoptWorktree", {
            projectId: row.projectId,
            hostId: row.hostId,
            path: row.path,
          })
          .then(() => {
            toast.success(`Adopted ${row.branch ?? row.path} — now in the composer's worktree list.`);
            onAdopted();
          })
          .catch((error: unknown) => {
            toast.error(error instanceof Error ? error.message : String(error));
          })
          .finally(() => setBusy(false));
      }}
    >
      {busy ? "Adopting…" : "Adopt"}
    </Button>
  );
}

function Dashboard() {
  const rpc = useRpc<typeof rpcContract>();
  const [rows, setRows] = useState<WorktreeRow[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // kick=true returns the cached snapshot instantly and starts a background
  // rescan; the "worktrees-updated" signal re-reads the fresh cache.
  const refresh = useCallback(
    async (kick: boolean) => {
      if (kick) setRefreshing(true);
      try {
        const result = await rpc.call("listWorktrees", { kick });
        setRows(result.worktrees);
        setErrors(result.errors);
        setScannedAt(result.scannedAt);
        setRefreshing(result.refreshing);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error));
        setRefreshing(false);
      } finally {
        setLoaded(true);
      }
    },
    [rpc],
  );

  useEffect(() => {
    void refresh(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRealtime("worktrees-updated", () => {
    void refresh(false);
  });

  const sorted = [...rows].sort(
    (a, b) => (lastTouched(b) ?? 0) - (lastTouched(a) ?? 0),
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border p-3">
        <span className="text-sm text-muted-foreground">
          {rows.length} worktrees
          {scannedAt ? (
            <span className="text-subtle-foreground">
              {" "}
              · scanned {formatAge(scannedAt)}
            </span>
          ) : null}
        </span>
        {refreshing ? (
          <span className="text-xs text-subtle-foreground">rescanning…</span>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="ml-auto"
          disabled={refreshing}
          onClick={() => void refresh(true)}
        >
          Rescan
        </Button>
      </div>
      {errors.map((error) => (
        <div
          key={error}
          className="border-b border-border bg-destructive/10 px-3 py-1.5 text-xs text-destructive-text"
        >
          {error}
        </div>
      ))}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-3 py-2 font-medium">Worktree</th>
              <th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 text-right font-medium">Last touched</th>
              <th className="px-3 py-2 text-right font-medium">In composer</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.path}
                className="border-t border-border-hairline hover:bg-state-hover"
                title={row.path}
              >
                <td className="px-3 py-2">
                  <div className="font-mono text-sm">
                    {row.branch ?? row.head}
                    {row.isMain ? (
                      <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">
                        main checkout
                      </span>
                    ) : null}
                  </div>
                  <div className="truncate font-mono text-xs text-subtle-foreground">
                    {row.path.replace(/^\/Users\/[^/]+\//, "~/")}
                  </div>
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {row.projectName}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                  {formatAge(lastTouched(row))}
                </td>
                <td className="px-3 py-2 text-right">
                  <AdoptCell row={row} onAdopted={() => void refresh(true)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">
            No worktrees found.
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
