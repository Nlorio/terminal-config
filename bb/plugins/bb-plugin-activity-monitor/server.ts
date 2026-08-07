// bb-plugin-activity-monitor — Orca-style resource manager for bb.
//
// Samples every process with `ps`, attributes process subtrees to bb
// projects and worktree environments (via command-line path matching, with
// an lsof cwd fallback for bare shells), and serves a hierarchical view
// with rollup totals and per-group history for sparklines. Kill actions
// stay per-process.
import { execFile } from "node:child_process";
import { cpus } from "node:os";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const processSchema = z.object({
  pid: z.number(),
  ppid: z.number(),
  pgid: z.number(),
  cpu: z.number(),
  rssMb: z.number(),
  elapsed: z.string(),
  command: z.string(),
});
export type ProcessRow = z.infer<typeof processSchema>;

const serverSchema = z.object({
  pid: z.number(),
  pgid: z.number(),
  ports: z.array(z.number()),
  command: z.string(),
});
export type ServerRow = z.infer<typeof serverSchema>;

const groupSchema = z.object({
  key: z.string(),
  label: z.string(),
  kind: z.enum(["worktree", "project-root", "other"]),
  projectName: z.string().nullable(),
  path: z.string().nullable(),
  cpu: z.number(),
  rssMb: z.number(),
  processCount: z.number(),
  processes: z.array(processSchema),
  servers: z.array(serverSchema),
  rssHistory: z.array(z.number()),
  cpuHistory: z.array(z.number()),
});
export type GroupRow = z.infer<typeof groupSchema>;

export const rpcContract = defineRpcContract({
  sample: {
    input: z.null(),
    output: z.object({
      groups: z.array(groupSchema),
      totalCpu: z.number(),
      cpuCores: z.number(),
      totalRssMb: z.number(),
      sampledAt: z.number(),
    }),
  },
  listProcesses: {
    input: z.null(),
    output: z.object({
      processes: z.array(processSchema),
      sampledAt: z.number(),
      totalMemMb: z.number(),
    }),
  },
  kill: {
    input: z
      .object({
        pid: z.number().int().gt(1),
        signal: z.enum(["TERM", "KILL"]),
        // Kill the whole process group (pid is a pgid) — for dev-server
        // sessions where the supervisor would respawn a killed child.
        group: z.boolean().optional(),
      })
      .strict(),
    output: z.object({ ok: z.boolean(), message: z.string() }),
  },
});

interface PsRow extends ProcessRow {
  children: PsRow[];
  groupKey: string | null;
}

interface Target {
  key: string;
  label: string;
  kind: "worktree" | "project-root";
  projectName: string | null;
  path: string;
}

function parsePsLine(line: string): ProcessRow | null {
  const match = line.match(
    /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/,
  );
  if (!match) return null;
  return {
    pid: Number(match[1]),
    ppid: Number(match[2]),
    pgid: Number(match[3]),
    cpu: Number(match[4]),
    rssMb: Math.round(Number(match[5]) / 1024),
    elapsed: match[6]!,
    command: match[7]!.slice(0, 400),
  };
}

const SHELL_RE = /^-?(zsh|bash|fish|sh|tmux|login)(\s|$)/;
const HISTORY_LIMIT = 60;

export default async function plugin(bb: BbPluginApi) {
  // Per-load sparkline history; a plugin reload starts fresh.
  const history = new Map<string, { rss: number[]; cpu: number[] }>();
  let targetsCache: { targets: Target[]; fetchedAt: number } | null = null;

  async function ps(): Promise<ProcessRow[]> {
    const { stdout } = await execFileAsync(
      "ps",
      ["axo", "pid,ppid,pgid,pcpu,rss,etime,command"],
      { maxBuffer: 32 * 1024 * 1024 },
    );
    return stdout
      .split("\n")
      .slice(1)
      .map(parsePsLine)
      .filter((row): row is ProcessRow => row !== null);
  }

  async function loadTargets(): Promise<Target[]> {
    if (targetsCache && Date.now() - targetsCache.fetchedAt < 60_000) {
      return targetsCache.targets;
    }
    const targets: Target[] = [];
    const projectNames = new Map<string, string>();
    try {
      const projects = await bb.sdk.projects.list({ includePersonal: true });
      for (const project of projects) {
        projectNames.set(project.id, project.name);
        for (const source of project.sources ?? []) {
          if (source.path) {
            targets.push({
              key: `project:${project.id}:${source.path}`,
              label: project.name,
              kind: "project-root",
              projectName: project.name,
              path: source.path.replace(/\/+$/, ""),
            });
          }
        }
      }
      // Git worktrees of each project (covers Orca/manual worktrees the bb
      // SDK doesn't track as environments).
      for (const project of projects) {
        for (const source of project.sources ?? []) {
          if (!source.path) continue;
          try {
            const { stdout } = await execFileAsync(
              "git",
              ["-C", source.path, "worktree", "list", "--porcelain"],
              { timeout: 10_000 },
            );
            let worktreePath: string | null = null;
            for (const line of `${stdout}\n`.split("\n")) {
              if (line.startsWith("worktree ")) {
                worktreePath = line.slice("worktree ".length).replace(/\/+$/, "");
              } else if (line.startsWith("branch ") && worktreePath) {
                if (worktreePath !== source.path.replace(/\/+$/, "")) {
                  const branch = line.slice("branch ".length).replace("refs/heads/", "");
                  targets.push({
                    key: `worktree:${worktreePath}`,
                    label: branch,
                    kind: "worktree",
                    projectName: project.name,
                    path: worktreePath,
                  });
                }
                worktreePath = null;
              }
            }
          } catch {
            // Not a git repo or git unavailable; skip.
          }
        }
      }
      const threads = await bb.sdk.threads.list({ includeHidden: true });
      const environmentIds = [
        ...new Set(
          threads
            .map((thread) => thread.environmentId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      for (const environmentId of environmentIds) {
        try {
          const environment = await bb.sdk.environments.get({ environmentId });
          if (!environment.path) continue;
          targets.push({
            key: `env:${environment.id}`,
            label:
              environment.branchName ??
              environment.name ??
              environment.path.split("/").pop() ??
              environment.id,
            kind: "worktree",
            projectName: projectNames.get(environment.projectId) ?? null,
            path: environment.path.replace(/\/+$/, ""),
          });
        } catch {
          // Environment may be destroyed; skip it.
        }
      }
    } catch (error) {
      bb.log.warn(
        `target discovery failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Longest path first so the most specific target wins a match.
    targets.sort((a, b) => b.path.length - a.path.length);
    targetsCache = { targets, fetchedAt: Date.now() };
    return targets;
  }

  function directMatch(command: string, targets: Target[]): string | null {
    for (const target of targets) {
      if (command.includes(target.path)) return target.key;
    }
    return null;
  }

  async function cwdFallback(
    rows: Map<number, PsRow>,
    targets: Target[],
  ): Promise<void> {
    // Bare shells (bb terminals, tmux panes) carry no path in argv; resolve
    // their cwd in one lsof call and attribute by directory prefix.
    const shellPids = [...rows.values()]
      .filter((row) => row.groupKey === null && SHELL_RE.test(row.command))
      .map((row) => row.pid)
      .slice(0, 100);
    if (!shellPids.length) return;
    try {
      const { stdout } = await execFileAsync(
        "lsof",
        ["-a", "-d", "cwd", "-F", "pn", "-p", shellPids.join(",")],
        { timeout: 10_000, maxBuffer: 4 * 1024 * 1024 },
      );
      let currentPid: number | null = null;
      for (const line of stdout.split("\n")) {
        if (line.startsWith("p")) currentPid = Number(line.slice(1));
        else if (line.startsWith("n") && currentPid !== null) {
          const cwd = line.slice(1);
          const target = targets.find(
            (t) => cwd === t.path || cwd.startsWith(`${t.path}/`),
          );
          const row = rows.get(currentPid);
          if (target && row) row.groupKey = target.key;
        }
      }
    } catch {
      // lsof can fail on permission-restricted pids; attribution just stays partial.
    }
  }

  // One lsof sweep: pid → listening TCP ports.
  async function listeningPorts(): Promise<Map<number, Set<number>>> {
    const byPid = new Map<number, Set<number>>();
    try {
      const { stdout } = await execFileAsync(
        "lsof",
        ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"],
        { timeout: 10_000, maxBuffer: 8 * 1024 * 1024 },
      );
      let currentPid: number | null = null;
      for (const line of stdout.split("\n")) {
        if (line.startsWith("p")) currentPid = Number(line.slice(1));
        else if (line.startsWith("n") && currentPid !== null) {
          const port = Number(line.slice(1).split(":").pop());
          if (!Number.isNaN(port)) {
            const ports = byPid.get(currentPid) ?? new Set<number>();
            ports.add(port);
            byPid.set(currentPid, ports);
          }
        }
      }
    } catch {
      // lsof unavailable or permission-limited; server chips just stay empty.
    }
    return byPid;
  }

  async function sample() {
    const [targets, processes, listeners] = await Promise.all([
      loadTargets(),
      ps(),
      listeningPorts(),
    ]);
    const rows = new Map<number, PsRow>();
    for (const proc of processes) {
      rows.set(proc.pid, { ...proc, children: [], groupKey: null });
    }
    for (const row of rows.values()) {
      rows.get(row.ppid)?.children.push(row);
      row.groupKey = directMatch(row.command, targets);
    }
    await cwdFallback(rows, targets);
    // Descend: children inherit the nearest attributed ancestor unless they
    // matched a more specific target themselves.
    const roots = [...rows.values()].filter(
      (row) => !rows.has(row.ppid) || row.ppid === 0,
    );
    const stack: { row: PsRow; inherited: string | null }[] = roots.map(
      (row) => ({ row, inherited: null }),
    );
    while (stack.length) {
      const { row, inherited } = stack.pop()!;
      if (row.groupKey === null) row.groupKey = inherited;
      for (const child of row.children) {
        stack.push({ row: child, inherited: row.groupKey });
      }
    }

    const byGroup = new Map<string | null, PsRow[]>();
    for (const row of rows.values()) {
      const list = byGroup.get(row.groupKey) ?? [];
      list.push(row);
      byGroup.set(row.groupKey, list);
    }

    const groups: GroupRow[] = [];
    let totalCpu = 0;
    let totalRssMb = 0;
    for (const row of rows.values()) {
      totalCpu += row.cpu;
      totalRssMb += row.rssMb;
    }
    const targetByKey = new Map(targets.map((t) => [t.key, t]));
    for (const [key, members] of byGroup.entries()) {
      const cpu = members.reduce((sum, row) => sum + row.cpu, 0);
      const rssMb = members.reduce((sum, row) => sum + row.rssMb, 0);
      const target = key ? targetByKey.get(key) : undefined;
      const groupKey = key ?? "other";
      const bucket = history.get(groupKey) ?? { rss: [], cpu: [] };
      bucket.rss.push(rssMb);
      bucket.cpu.push(cpu);
      if (bucket.rss.length > HISTORY_LIMIT) bucket.rss.shift();
      if (bucket.cpu.length > HISTORY_LIMIT) bucket.cpu.shift();
      history.set(groupKey, bucket);
      const servers: ServerRow[] = members
        .filter((row) => listeners.has(row.pid))
        .map((row) => ({
          pid: row.pid,
          pgid: row.pgid,
          ports: [...listeners.get(row.pid)!].sort((a, b) => a - b),
          command: row.command.slice(0, 120),
        }))
        .sort((a, b) => (a.ports[0] ?? 0) - (b.ports[0] ?? 0));
      groups.push({
        key: groupKey,
        label: target?.label ?? "Everything else",
        kind: target?.kind ?? "other",
        projectName: target?.projectName ?? null,
        path: target?.path ?? null,
        cpu: Math.round(cpu * 10) / 10,
        rssMb,
        processCount: members.length,
        processes: members
          .sort((a, b) => b.rssMb - a.rssMb)
          .slice(0, 15)
          .map(({ children: _c, groupKey: _g, ...proc }) => proc),
        servers,
        rssHistory: bucket.rss,
        cpuHistory: bucket.cpu,
      });
    }
    groups.sort((a, b) => {
      if (a.kind === "other") return 1;
      if (b.kind === "other") return -1;
      return b.rssMb - a.rssMb;
    });
    return {
      groups,
      totalCpu: Math.round(totalCpu * 10) / 10,
      cpuCores: cpus().length,
      totalRssMb,
      sampledAt: Date.now(),
    };
  }

  bb.rpc.register(rpcContract, {
    async sample() {
      return sample();
    },
    async listProcesses() {
      const processes = (await ps())
        .sort((a, b) => b.rssMb - a.rssMb)
        .slice(0, 400);
      const totalMemMb = processes.reduce((sum, row) => sum + row.rssMb, 0);
      return { processes, sampledAt: Date.now(), totalMemMb };
    },
    async kill({ pid, signal, group }) {
      if (pid === process.pid || (group && pid === process.getgid?.())) {
        return { ok: false, message: "That is the bb server itself." };
      }
      try {
        // Guard: never signal a group that contains the bb server.
        if (group) {
          const { stdout } = await execFileAsync("ps", [
            "-o",
            "pgid=",
            "-p",
            String(process.pid),
          ]);
          if (Number(stdout.trim()) === pid) {
            return { ok: false, message: "That group contains the bb server." };
          }
        }
        process.kill(group ? -pid : pid, `SIG${signal}`);
        bb.log.info(
          `sent SIG${signal} to ${group ? `process group ${pid}` : `pid ${pid}`}`,
        );
        return {
          ok: true,
          message: `Sent SIG${signal} to ${group ? `session (pgid ${pid})` : pid}.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, message };
      }
    },
  });
}
