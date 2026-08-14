// bb-plugin-fresh-start — "Start fresh" thread panel action.
//
// Opens a panel with bb's real new-thread composer seeded with the current
// thread's project and environment: same worktree, empty context — the bb
// equivalent of Claude Code's /clear. Optionally archives the old thread.
import { useEffect, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  useRpc,
  experimental_NewThreadComposer as NewThreadComposer,
} from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";

function FreshStartPanel({ threadId }: { threadId: string; params: unknown }) {
  const rpc = useRpc<typeof rpcContract>();
  const navigate = useBbNavigate();
  const [context, setContext] = useState<{
    projectId: string | null;
    environmentId: string | null;
    title: string | null;
  } | null>(null);
  const [archiveOld, setArchiveOld] = useState(false);

  useEffect(() => {
    void rpc
      .call("getThreadContext", { threadId })
      .then(setContext)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : String(error)),
      );
  }, [rpc, threadId]);

  if (!context) {
    return (
      <div className="p-4 text-sm text-muted-foreground">Loading context…</div>
    );
  }

  return (
    <div className="space-y-3 p-1">
      <div className="text-sm text-muted-foreground">
        Fresh context, same workspace — the new thread starts in this thread's
        exact environment{context.title ? ` (from "${context.title}")` : ""}.
        {" "}Use native <span className="font-mono">/compact</span> instead if
        you only need to shrink context.
      </div>
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={archiveOld}
          onChange={(event) => setArchiveOld(event.target.checked)}
        />
        Archive this thread after starting the new one
      </label>
      <NewThreadComposer
        defaultProjectId={context.projectId ?? undefined}
        defaultEnvironment={
          context.environmentId
            ? { type: "environment", environmentId: context.environmentId }
            : undefined
        }
        placeholder="Same worktree, clean slate — what next?"
        layout="document"
        onSubmit={async (request) => {
          const result = await rpc.call("createThread", {
            request: request as unknown as Record<string, unknown>,
            archiveThreadId: archiveOld ? threadId : null,
          });
          toast.success("Fresh thread started.");
          navigate.toThread(result.threadId);
        }}
      />
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "fresh-start",
    title: "Start fresh (clear context)",
    icon: "RotateCcw",
    component: FreshStartPanel,
    run: ({ openPanel }) => openPanel({ title: "Start fresh" }),
  });
});
