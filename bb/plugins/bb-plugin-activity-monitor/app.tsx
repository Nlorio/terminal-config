// bb-plugin-activity-monitor — hierarchical resource manager UI.
//
// Tree view: project roots + worktree environments with CPU/RSS rollups and
// sparklines, expandable to their top processes. Flat view: the classic
// sortable process table. Kill actions on every process row.
import { useCallback, useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract, GroupRow, ProcessRow } from "./server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatMb(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toLocaleString()} MB`;
}

function shortCommand(command: string): string {
  const first = command.split(" ")[0] ?? command;
  return first.split("/").pop() ?? first;
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="inline-block w-16" />;
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * 64;
      const y = 18 - ((value - min) / range) * 14 - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width="64" height="18" className="inline-block text-muted-foreground">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

function KillControls({
  pid,
  onKill,
}: {
  pid: number;
  onKill: (pid: number, signal: "TERM" | "KILL") => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return (
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs text-muted-foreground"
        onClick={() => setConfirming(true)}
      >
        Kill
      </Button>
    );
  }
  return (
    <span className="flex justify-end gap-1">
      <Button
        size="sm"
        variant="destructive"
        className="h-6 px-2 text-xs"
        onClick={() => onKill(pid, "TERM")}
      >
        TERM
      </Button>
      <Button
        size="sm"
        variant="destructive"
        className="h-6 px-2 text-xs"
        onClick={() => onKill(pid, "KILL")}
      >
        KILL -9
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-xs"
        onClick={() => setConfirming(false)}
      >
        ✕
      </Button>
    </span>
  );
}

function ProcessLine({
  proc,
  onKill,
}: {
  proc: ProcessRow;
  onKill: (pid: number, signal: "TERM" | "KILL") => void;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded px-2 py-1 hover:bg-state-hover"
      title={proc.command}
    >
      <span className="w-14 shrink-0 font-mono text-xs text-subtle-foreground">
        {proc.pid}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">
        <span className="font-medium">{shortCommand(proc.command)}</span>
        <span className="ml-2 text-xs text-subtle-foreground">
          {proc.command.slice(0, 100)}
        </span>
      </span>
      <span className="w-16 shrink-0 text-right font-mono text-xs">
        {proc.cpu.toFixed(1)}%
      </span>
      <span className="w-20 shrink-0 text-right font-mono text-xs">
        {formatMb(proc.rssMb)}
      </span>
      <span className="w-24 shrink-0 text-right">
        <KillControls pid={proc.pid} onKill={onKill} />
      </span>
    </div>
  );
}

function GroupCard({
  group,
  sortKey,
  filter,
  onKill,
}: {
  group: GroupRow;
  sortKey: "rssMb" | "cpu";
  filter: string;
  onKill: (pid: number, signal: "TERM" | "KILL") => void;
}) {
  const [expanded, setExpanded] = useState(group.kind === "worktree");
  const needle = filter.trim().toLowerCase();
  const processes = group.processes
    .filter(
      (proc) =>
        !needle ||
        proc.command.toLowerCase().includes(needle) ||
        String(proc.pid).includes(needle),
    )
    .sort((a, b) => b[sortKey] - a[sortKey]);
  if (needle && processes.length === 0) return null;
  const open = expanded || Boolean(needle);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-state-hover"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="w-3 text-xs text-muted-foreground">
          {open ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1 truncate">
          <span className="text-sm font-medium">{group.label}</span>
          {group.projectName && group.kind === "worktree" ? (
            <span className="ml-2 text-xs text-subtle-foreground">
              {group.projectName}
            </span>
          ) : null}
          <span className="ml-2 text-xs text-subtle-foreground">
            {group.processCount} procs
          </span>
        </span>
        <Sparkline
          values={sortKey === "rssMb" ? group.rssHistory : group.cpuHistory}
        />
        <span className="w-16 shrink-0 text-right font-mono text-xs">
          {group.cpu.toFixed(1)}%
        </span>
        <span className="w-20 shrink-0 text-right font-mono text-sm font-medium">
          {formatMb(group.rssMb)}
        </span>
      </button>
      {open ? (
        <div className="border-t border-border-hairline px-1 py-1">
          {processes.map((proc) => (
            <ProcessLine key={proc.pid} proc={proc} onKill={onKill} />
          ))}
          {group.processCount > group.processes.length ? (
            <div className="px-2 py-1 text-xs text-subtle-foreground">
              …plus {group.processCount - group.processes.length} smaller
              processes (aggregated in the rollup)
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Monitor() {
  const rpc = useRpc<typeof rpcContract>();
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [totals, setTotals] = useState<{ cpu: number; rssMb: number } | null>(
    null,
  );
  const [flatRows, setFlatRows] = useState<ProcessRow[]>([]);
  const [sampledAt, setSampledAt] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<"rssMb" | "cpu">("rssMb");
  const [view, setView] = useState<"tree" | "flat">("tree");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const viewRef = useRef(view);
  viewRef.current = view;

  const refresh = useCallback(async () => {
    if (viewRef.current === "tree") {
      const result = await rpc.call("sample");
      setGroups(result.groups);
      setTotals({ cpu: result.totalCpu, rssMb: result.totalRssMb });
      setSampledAt(result.sampledAt);
    } else {
      const result = await rpc.call("listProcesses");
      setFlatRows(result.processes);
      setSampledAt(result.sampledAt);
    }
  }, [rpc]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!pausedRef.current) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [refresh, view]);

  async function kill(pid: number, signal: "TERM" | "KILL") {
    const result = await rpc.call("kill", { pid, signal });
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
    void refresh();
  }

  const needle = filter.trim().toLowerCase();
  const flatVisible = flatRows
    .filter(
      (row) =>
        !needle ||
        row.command.toLowerCase().includes(needle) ||
        String(row.pid).includes(needle),
    )
    .sort((a, b) => b[sortKey] - a[sortKey])
    .slice(0, 80);

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-2 border-b border-border p-3">
        {totals ? (
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-lg font-semibold">
              {totals.cpu.toFixed(1)}%
            </span>
            <span className="text-muted-foreground">·</span>
            <span className="font-mono text-lg font-semibold">
              {formatMb(totals.rssMb)}
            </span>
            <span className="text-xs text-muted-foreground">Σ RSS</span>
            <span className="ml-auto text-xs text-subtle-foreground">
              {sampledAt ? new Date(sampledAt).toLocaleTimeString() : "…"}
            </span>
          </div>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter by command or pid…"
            className="h-8 max-w-xs"
          />
          <Button
            size="sm"
            variant={sortKey === "rssMb" ? "default" : "outline"}
            onClick={() => setSortKey("rssMb")}
          >
            RSS
          </Button>
          <Button
            size="sm"
            variant={sortKey === "cpu" ? "default" : "outline"}
            onClick={() => setSortKey("cpu")}
          >
            CPU
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setView(view === "tree" ? "flat" : "tree")}
          >
            {view === "tree" ? "Flat view" : "Tree view"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() => setPaused((value) => !value)}
          >
            {paused ? "Resume" : "Pause"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {view === "tree" ? (
          <div className="space-y-2">
            {groups.length === 0 ? (
              <div className="text-sm text-muted-foreground">Sampling…</div>
            ) : (
              [...groups]
                .sort((a, b) => {
                  if (a.kind === "other") return 1;
                  if (b.kind === "other") return -1;
                  return b[sortKey === "rssMb" ? "rssMb" : "cpu"] -
                    a[sortKey === "rssMb" ? "rssMb" : "cpu"];
                })
                .map((group) => (
                  <GroupCard
                    key={group.key}
                    group={group}
                    sortKey={sortKey}
                    filter={filter}
                    onKill={kill}
                  />
                ))
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            {flatVisible.map((proc) => (
              <ProcessLine key={proc.pid} proc={proc} onKill={kill} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "activity",
    title: "Activity",
    icon: "Activity",
    path: "activity",
    component: Monitor,
  });
});
