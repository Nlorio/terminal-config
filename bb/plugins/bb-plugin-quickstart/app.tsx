// bb-plugin-quickstart — thread panel Actions entries for common starts.
//
// Terminal presets call the backend rpc directly from run() (plain fetch to
// the plugin's local-auth rpc route — run() has no hooks) and toast the
// outcome; the created terminal appears in the thread's terminal tabs.
// The browser preset opens an iframe panel tab.
import { useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";

const PLUGIN_ID = "quickstart";

async function callRpc<T>(method: string, input: unknown): Promise<T> {
  const response = await fetch(`/api/v1/plugins/${PLUGIN_ID}/rpc/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const envelope = (await response.json()) as
    | { ok: true; result: T }
    | { ok: false; error: { message?: string } };
  if (!envelope.ok) throw new Error(envelope.error?.message ?? "RPC failed");
  return envelope.result;
}

async function startTerminal(threadId: string, title: string, command: string) {
  try {
    const result = await callRpc<{ ok: boolean; message: string }>(
      "runCommand",
      { threadId, title, command },
    );
    if (result.ok) toast.success(result.message);
    else toast.error(result.message);
  } catch (error) {
    toast.error(error instanceof Error ? error.message : String(error));
  }
}

function BrowserPanel({ params }: { threadId: string; params: unknown }) {
  const url =
    params && typeof params === "object" && "url" in params
      ? String((params as { url: unknown }).url)
      : "http://localhost:3000";
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <span className="font-mono">{url}</span>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-primary hover:underline"
        >
          Open externally
        </a>
      </div>
      <iframe
        src={url}
        title={url}
        className="h-full w-full flex-1 border-0 bg-white"
      />
    </div>
  );
}

function PresetsPanel({ threadId }: { threadId: string; params: unknown }) {
  const rpc = useRpc<typeof rpcContract>();
  const [presets, setPresets] = useState<{ title: string; command: string }[]>(
    [],
  );
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    void rpc.call("listPresets").then((result) => {
      setPresets(result.presets);
      setLoaded(true);
    });
  }, [rpc]);
  return (
    <div className="space-y-2">
      <div className="text-sm text-muted-foreground">
        Custom presets from plugin settings (`Title :: command`, separated by
        `;;`). Each starts a terminal in this thread.
      </div>
      {loaded && presets.length === 0 ? (
        <div className="text-sm text-subtle-foreground">
          None configured — add some via `bb plugin config quickstart set
          presets "dev server :: notion run ;; logs :: tail -f out.log"`.
        </div>
      ) : null}
      {presets.map((preset) => (
        <Button
          key={preset.title}
          size="sm"
          variant="outline"
          className="mr-2"
          onClick={() => void startTerminal(threadId, preset.title, preset.command)}
        >
          {preset.title}
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {preset.command.slice(0, 40)}
          </span>
        </Button>
      ))}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "tmux",
    title: "Terminal: tmux",
    icon: "Terminal",
    component: () => null,
    run: ({ threadId }) => startTerminal(threadId, "tmux", "tmux new -A -s bb"),
  });
  app.slots.threadPanelAction({
    id: "notion-run",
    title: "Terminal: notion run --listenToStripe",
    icon: "Terminal",
    component: () => null,
    run: ({ threadId }) =>
      startTerminal(
        threadId,
        "notion run --listenToStripe",
        "notion run --listenToStripe",
      ),
  });
  app.slots.threadPanelAction({
    id: "nvim",
    title: "Terminal: nvim",
    icon: "Terminal",
    component: () => null,
    run: ({ threadId }) => startTerminal(threadId, "nvim", "nvim ."),
  });
  app.slots.threadPanelAction({
    id: "localhost",
    title: "Browser: localhost:3000",
    icon: "Globe",
    component: BrowserPanel,
    layout: "flush",
    run: ({ openPanel }) =>
      openPanel({
        title: "localhost:3000",
        params: { url: "http://localhost:3000" },
      }),
  });
  app.slots.threadPanelAction({
    id: "presets",
    title: "Quickstart presets…",
    icon: "Zap",
    component: PresetsPanel,
    run: ({ openPanel }) => openPanel({ title: "Quickstart presets" }),
  });
});
