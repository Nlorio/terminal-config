// bb-plugin-fresh-start — /clear for bb threads.
//
// bb has no in-place context clear (threads are durable; /compact is the
// native shrink). This plugin approximates Claude Code's /clear: a panel
// action that starts a NEW thread pre-seeded with the current thread's
// project + environment (same worktree, empty context), optionally
// archiving the old thread.
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

export const rpcContract = defineRpcContract({
  getThreadContext: {
    input: z.object({ threadId: z.string() }).strict(),
    output: z.object({
      projectId: z.string().nullable(),
      environmentId: z.string().nullable(),
      title: z.string().nullable(),
    }),
  },
  createThread: {
    input: z
      .object({
        request: z.record(z.string(), z.unknown()),
        archiveThreadId: z.string().nullable(),
      })
      .strict(),
    output: z.object({ threadId: z.string() }),
  },
});

export default async function plugin(bb: BbPluginApi) {
  bb.rpc.register(rpcContract, {
    async getThreadContext({ threadId }) {
      const thread = (await bb.sdk.threads.get({ threadId })) as {
        projectId?: string | null;
        environmentId?: string | null;
        title?: string | null;
      };
      return {
        projectId: thread.projectId ?? null,
        environmentId: thread.environmentId ?? null,
        title: thread.title ?? null,
      };
    },
    async createThread({ request, archiveThreadId }) {
      const thread = await bb.sdk.threads.spawn(
        request as Parameters<typeof bb.sdk.threads.spawn>[0],
      );
      if (archiveThreadId) {
        try {
          await bb.sdk.threads.archive({ threadId: archiveThreadId });
        } catch (error) {
          bb.log.warn(
            `archive of ${archiveThreadId} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return { threadId: thread.id };
    },
  });
}
