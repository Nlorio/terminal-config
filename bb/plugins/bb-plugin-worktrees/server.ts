// bb-plugin-worktrees — worktree ↔ thread visibility and cleanup.
//
// Enumerates every git worktree of each bb project (bb-managed AND external
// orca/manual ones), maps threads to worktrees via their environments, and
// computes staleness signals (dirty/clean, merged into origin/main, thread
// activity). Actions: start a thread in any worktree (unmanaged host
// workspace), open a terminal there, archive an environment's threads, and
// remove genuinely stale external worktrees.
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const execFileAsync = promisify(execFile);

const threadRefSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number().nullable(),
});

const worktreeSchema = z.object({
  path: z.string(),
  branch: z.string().nullable(),
  head: z.string(),
  isMain: z.boolean(),
  managed: z.boolean(),
  environmentId: z.string().nullable(),
  projectId: z.string(),
  projectName: z.string(),
  hostId: z.string().nullable(),
  dirtyFiles: z.number(),
  mergedToMain: z.boolean(),
  lastCommitAt: z.number().nullable(),
  threads: z.array(threadRefSchema),
  lastThreadActivityAt: z.number().nullable(),
});
export type WorktreeRow = z.infer<typeof worktreeSchema>;

export const rpcContract = defineRpcContract({
  // Stale-while-revalidate: returns the cached snapshot immediately (kicking
  // a background rescan unless kick=false); scans synchronously only when no
  // snapshot exists yet. A finished rescan publishes "worktrees-updated".
  listWorktrees: {
    input: z.object({ kick: z.boolean() }).strict(),
    output: z.object({
      worktrees: z.array(worktreeSchema),
      scannedAt: z.number(),
      errors: z.array(z.string()),
      refreshing: z.boolean(),
    }),
  },
  startThread: {
    input: z
      .object({
        projectId: z.string(),
        hostId: z.string().nullable(),
        path: z.string(),
        prompt: z.string().min(1),
      })
      .strict(),
    output: z.object({ threadId: z.string() }),
  },
  adoptWorktree: {
    input: z
      .object({
        projectId: z.string(),
        hostId: z.string().nullable(),
        path: z.string(),
      })
      .strict(),
    output: z.object({ threadId: z.string() }),
  },
  openTerminal: {
    input: z
      .object({ hostId: z.string(), path: z.string(), title: z.string() })
      .strict(),
    output: z.object({ terminalId: z.string() }),
  },
  archiveThreads: {
    input: z.object({ environmentId: z.string() }).strict(),
    output: z.object({ ok: z.boolean(), message: z.string() }),
  },
  removeWorktree: {
    input: z
      .object({
        rootPath: z.string(),
        path: z.string(),
        force: z.boolean(),
      })
      .strict(),
    output: z.object({ ok: z.boolean(), message: z.string() }),
  },
});

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", cwd, ...args], {
    timeout: 30_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  return stdout;
}

interface GitWorktree {
  path: string;
  head: string;
  branch: string | null;
}

function parseWorktreeList(porcelain: string): GitWorktree[] {
  const result: GitWorktree[] = [];
  let current: Partial<GitWorktree> = {};
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) {
      if (current.path) result.push(current as GitWorktree);
      current = { path: line.slice(9), head: "", branch: null };
    } else if (line.startsWith("HEAD ")) {
      current.head = line.slice(5);
    } else if (line.startsWith("branch ")) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, "");
    }
  }
  if (current.path) result.push(current as GitWorktree);
  return result;
}

interface Snapshot {
  worktrees: WorktreeRow[];
  scannedAt: number;
  errors: string[];
}

export default async function plugin(bb: BbPluginApi) {
  // In-flight guard so concurrent panel opens share one rescan.
  let refreshing: Promise<Snapshot> | null = null;

  async function scan(): Promise<Snapshot> {
      const errors: string[] = [];
      const rows: WorktreeRow[] = [];

      // Thread → environment → path mapping.
      const envThreads = new Map<
        string,
        { id: string; title: string; updatedAt: number | null }[]
      >();
      const envInfo = new Map<
        string,
        { path: string | null; hostId: string | null }
      >();
      try {
        const threads = await bb.sdk.threads.list({ includeHidden: true });
        for (const thread of threads) {
          const environmentId = (thread as { environmentId?: string | null })
            .environmentId;
          if (!environmentId) continue;
          const list = envThreads.get(environmentId) ?? [];
          const updatedAtRaw = (thread as { updatedAt?: number | string | null })
            .updatedAt;
          const updatedAt =
            typeof updatedAtRaw === "number"
              ? updatedAtRaw
              : typeof updatedAtRaw === "string"
                ? Date.parse(updatedAtRaw) || null
                : null;
          list.push({
            id: thread.id,
            title: (thread as { title?: string }).title ?? thread.id,
            updatedAt,
          });
          envThreads.set(environmentId, list);
        }
        for (const environmentId of envThreads.keys()) {
          try {
            const environment = await bb.sdk.environments.get({ environmentId });
            envInfo.set(environmentId, {
              path:
                (environment as { path?: string | null }).path?.replace(/\/+$/, "") ??
                null,
              hostId: (environment as { hostId?: string | null }).hostId ?? null,
            });
          } catch {
            // Destroyed environment; threads become unattributed.
          }
        }
      } catch (error) {
        errors.push(
          `thread mapping: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      const envByPath = new Map<string, string>();
      for (const [environmentId, info] of envInfo) {
        if (info.path) envByPath.set(info.path, environmentId);
      }

      const projects = await bb.sdk.projects.list({ includePersonal: false });
      for (const project of projects) {
        // A project can have sources on several hosts (e.g. a boxy machine).
        // git runs on the server machine, so scan only sources whose path
        // exists here; remote-host sources are skipped, not errors.
        const sources = (project.sources ?? []).filter(
          (s) =>
            (s as { type?: string }).type === "local_path" &&
            (s as { path?: string }).path,
        ) as { path: string; hostId?: string }[];
        const source = sources.find((s) =>
          existsSync(s.path.replace(/\/+$/, "")),
        );
        if (!source) {
          if (sources.length > 0) {
            errors.push(
              `${project.name}: no source path exists on this machine (remote-only sources skipped)`,
            );
          }
          continue;
        }
        const root = source.path.replace(/\/+$/, "");
        let worktrees: GitWorktree[];
        try {
          worktrees = parseWorktreeList(
            await git(root, ["worktree", "list", "--porcelain"]),
          );
        } catch (error) {
          errors.push(
            `${project.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          continue;
        }
        for (const worktree of worktrees) {
          const path = worktree.path.replace(/\/+$/, "");
          let dirtyFiles = 0;
          let mergedToMain = false;
          let lastCommitAt: number | null = null;
          try {
            const status = await git(path, ["status", "--porcelain"]);
            dirtyFiles = status.split("\n").filter(Boolean).length;
          } catch {
            dirtyFiles = -1; // unreadable
          }
          try {
            await git(root, [
              "merge-base",
              "--is-ancestor",
              worktree.head,
              "origin/main",
            ]);
            mergedToMain = true;
          } catch {
            mergedToMain = false;
          }
          try {
            const ts = await git(path, ["log", "-1", "--format=%ct"]);
            lastCommitAt = Number(ts.trim()) * 1000 || null;
          } catch {
            lastCommitAt = null;
          }
          const environmentId = envByPath.get(path) ?? null;
          const threads = environmentId
            ? (envThreads.get(environmentId) ?? [])
            : [];
          const lastThreadActivityAt = threads.reduce<number | null>(
            (max, thread) =>
              thread.updatedAt !== null && (max === null || thread.updatedAt > max)
                ? thread.updatedAt
                : max,
            null,
          );
          rows.push({
            path,
            branch: worktree.branch,
            head: worktree.head.slice(0, 10),
            isMain: path === root,
            managed: environmentId !== null,
            environmentId,
            projectId: project.id,
            projectName: project.name,
            hostId: source.hostId ?? null,
            dirtyFiles,
            mergedToMain,
            lastCommitAt,
            threads,
            lastThreadActivityAt,
          });
        }
      }
      return { worktrees: rows, scannedAt: Date.now(), errors };
  }

  async function refreshSnapshot(): Promise<Snapshot> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const snapshot = await scan();
        await bb.storage.kv.set("snapshot", snapshot);
        bb.realtime.publish("worktrees-updated", {
          scannedAt: snapshot.scannedAt,
        });
        return snapshot;
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
  }

  bb.rpc.register(rpcContract, {
    async listWorktrees({ kick }) {
      const cached = await bb.storage.kv.get<Snapshot>("snapshot");
      if (!cached) {
        // First load ever: scan synchronously so the panel has real data.
        const snapshot = await refreshSnapshot();
        return { ...snapshot, refreshing: false };
      }
      if (kick) {
        void refreshSnapshot().catch((error) => {
          bb.log.warn(
            `background rescan failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }
      return { ...cached, refreshing: kick || refreshing !== null };
    },

    // Register an external worktree as a bb environment so it appears in the
    // composer's "Existing worktree" picker. Environments are only created by
    // thread provisioning, AND the picker builds its candidates from live
    // thread rows — so the anchor thread must be visible and persistent
    // (hidden anchors get cleaned up and the candidate disappears).
    async adoptWorktree({ projectId, hostId, path }) {
      const name = path.split("/").pop() ?? path;
      const thread = await bb.sdk.threads.spawn({
        projectId,
        prompt:
          "This thread anchors this worktree in bb so it can be selected in the new-thread composer. Reply with exactly: OK.",
        title: `worktree: ${name}`,
        visibility: "visible",
        environment: {
          type: "host",
          ...(hostId ? { hostId } : {}),
          workspace: { type: "unmanaged", path },
        },
      } as Parameters<typeof bb.sdk.threads.spawn>[0]);
      void refreshSnapshot().catch(() => {});
      return { threadId: thread.id };
    },

    async startThread({ projectId, hostId, path, prompt }) {
      const thread = await bb.sdk.threads.spawn({
        projectId,
        prompt,
        environment: {
          type: "host",
          ...(hostId ? { hostId } : {}),
          workspace: { type: "unmanaged", path },
        },
      } as Parameters<typeof bb.sdk.threads.spawn>[0]);
      return { threadId: thread.id };
    },

    async openTerminal({ hostId, path, title }) {
      const terminal = await bb.sdk.terminals.create({
        scope: { kind: "host_path", hostId, cwd: path },
        cols: 120,
        rows: 36,
        title,
      });
      return { terminalId: terminal.id };
    },

    async archiveThreads({ environmentId }) {
      try {
        await bb.sdk.environments.archiveThreads({ environmentId });
        void refreshSnapshot().catch(() => {});
        return { ok: true, message: "Archived the environment's threads." };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },

    async removeWorktree({ rootPath, path, force }) {
      if (path === rootPath.replace(/\/+$/, "")) {
        return { ok: false, message: "Refusing to remove the main checkout." };
      }
      try {
        const args = ["worktree", "remove"];
        if (force) args.push("--force");
        args.push(path);
        await git(rootPath, args);
        bb.log.info(`removed worktree ${path}${force ? " (forced)" : ""}`);
        void refreshSnapshot().catch(() => {});
        return { ok: true, message: `Removed ${path}.` };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });
}
