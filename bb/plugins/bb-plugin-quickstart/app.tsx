// bb-plugin-quickstart — a single "Quickstart" entry in the thread panel
// Actions list. The panel holds every preset: built-in terminals (tmux,
// dev server, nvim) and custom presets from plugin settings.
import { useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";

const BUILTIN_PRESETS = [
  { title: "tmux", command: "tmux new -A -s bb" },
  { title: "notion run --listenToStripe", command: "notion run --listenToStripe" },
  { title: "nvim", command: "nvim ." },
];

function QuickstartPanel({ threadId }: { threadId: string; params: unknown }) {
  const rpc = useRpc<typeof rpcContract>();
  const [customPresets, setCustomPresets] = useState<
    { title: string; command: string }[]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void rpc.call("listPresets").then((result) => setCustomPresets(result.presets));
  }, [rpc]);

  async function startTerminal(title: string, command: string) {
    setBusy(title);
    try {
      const result = await rpc.call("runCommand", { threadId, title, command });
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  const renderPreset = (preset: { title: string; command: string }) => (
    <button
      key={preset.title}
      type="button"
      disabled={busy !== null}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-state-hover disabled:opacity-50"
      onClick={() => void startTerminal(preset.title, preset.command)}
    >
      <span className="text-sm font-medium">
        {busy === preset.title ? "Starting…" : preset.title}
      </span>
      <span className="ml-auto truncate font-mono text-xs text-muted-foreground">
        {preset.command}
      </span>
    </button>
  );

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
          Terminals
        </div>
        {BUILTIN_PRESETS.map(renderPreset)}
        {customPresets.length > 0 ? (
          <>
            <div className="pt-2 text-xs font-medium uppercase tracking-wide text-subtle-foreground">
              Custom
            </div>
            {customPresets.map(renderPreset)}
          </>
        ) : (
          <div className="pt-2 text-xs text-subtle-foreground">
            Add custom presets: `bb plugin config quickstart set presets "logs ::
            tail -f server.log ;; psql :: psql notion"`, then `bb plugin reload
            quickstart`.
          </div>
        )}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "quickstart",
    title: "Quickstart",
    icon: "Zap",
    component: QuickstartPanel,
    layout: "flush",
    run: ({ openPanel }) => openPanel({ title: "Quickstart" }),
  });
});
