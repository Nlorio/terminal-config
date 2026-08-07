// bb-plugin-usage — usage meters for Claude Code / Codex / Cursor.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";

type Usage = Awaited<
  ReturnType<
    ReturnType<typeof useRpc<typeof rpcContract>>["call"]
  >
>;

type ProviderData = Usage["claudeCode"];

const PROVIDER_LABELS: Record<string, string> = {
  claudeCode: "Claude Code",
  codex: "Codex",
  cursor: "Cursor",
};

function meterTone(percent: number): string {
  if (percent >= 90) return "bg-destructive";
  if (percent >= 70) return "bg-warning";
  return "bg-primary";
}

function resetLabel(resetsAt: string | null): string | null {
  if (!resetsAt) return null;
  const at = Date.parse(resetsAt);
  if (Number.isNaN(at)) return resetsAt;
  const hours = (at - Date.now()) / 3_600_000;
  if (hours <= 0) return "resets soon";
  if (hours < 1) return `resets in ${Math.round(hours * 60)}m`;
  if (hours < 48) return `resets in ${Math.round(hours)}h`;
  return `resets ${new Date(at).toLocaleDateString()}`;
}

function Sparkline({ points }: { points: { at: number; usedPercent: number }[] }) {
  if (points.length < 2) return null;
  const xs = points.map((p) => p.at);
  const min = Math.min(...xs);
  const range = Math.max(Math.max(...xs) - min, 1);
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(((p.at - min) / range) * 96).toFixed(1)},${(
          22 -
          (Math.min(p.usedPercent, 100) / 100) * 20
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg width="96" height="24" className="text-muted-foreground">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function ProviderCard({
  id,
  data,
  history,
}: {
  id: string;
  data: ProviderData;
  history: Usage["history"];
}) {
  const label = PROVIDER_LABELS[id] ?? id;
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {data.status === "ok" ? (
          <span className="text-xs text-muted-foreground">
            {data.planLabel ?? "unknown plan"}
            {data.accountEmail ? ` · ${data.accountEmail}` : ""}
          </span>
        ) : (
          <span className="text-xs text-warning-text">{data.status}</span>
        )}
      </div>
      {data.status === "ok" ? (
        data.windows.length === 0 ? (
          <div className="text-xs text-subtle-foreground">
            No usage windows reported for this plan.
          </div>
        ) : (
          data.windows.map((window) => {
            const series = history.filter(
              (h) => h.provider === id && h.label === window.label,
            );
            return (
              <div key={window.label} className="space-y-1">
                <div className="flex items-baseline gap-2 text-xs">
                  <span className="text-muted-foreground">{window.label}</span>
                  <span className="font-mono font-medium text-foreground">
                    {window.usedPercent.toFixed(0)}%
                  </span>
                  {window.cost ? (
                    <span className="font-mono text-subtle-foreground">
                      ${(window.cost.usedUsdCents / 100).toFixed(2)} / $
                      {(window.cost.limitUsdCents / 100).toFixed(2)}
                    </span>
                  ) : null}
                  <span className="ml-auto text-subtle-foreground">
                    {resetLabel(window.resetsAt)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className={`h-full rounded ${meterTone(window.usedPercent)}`}
                      style={{ width: `${Math.min(window.usedPercent, 100)}%` }}
                    />
                  </div>
                  <Sparkline points={series} />
                </div>
              </div>
            );
          })
        )
      ) : data.status === "error" ? (
        <div className="text-xs text-muted-foreground">{data.message}</div>
      ) : (
        <div className="text-xs text-subtle-foreground">
          {data.status === "not_installed"
            ? "CLI not installed on this machine."
            : data.status === "unauthenticated"
              ? "Not signed in."
              : "Session expired — re-authenticate the CLI."}
        </div>
      )}
    </div>
  );
}

function UsagePanel() {
  const rpc = useRpc<typeof rpcContract>();
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUsage(await rpc.call("getUsage"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5 * 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5">
      <div className="mx-auto w-full max-w-3xl space-y-3">
        <div className="flex items-center">
          <span className="text-xs text-subtle-foreground">
            {usage
              ? `sampled ${new Date(usage.sampledAt).toLocaleTimeString()}`
              : "…"}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={loading}
            onClick={() => void refresh()}
          >
            {loading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
        {usage
          ? (["claudeCode", "codex", "cursor"] as const).map((id) =>
              usage[id].status === "not_installed" ? null : (
                <ProviderCard
                  key={id}
                  id={id}
                  data={usage[id]}
                  history={usage.history}
                />
              ),
            )
          : null}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "usage",
    title: "Usage",
    icon: "Gauge",
    path: "usage",
    component: UsagePanel,
  });
});
