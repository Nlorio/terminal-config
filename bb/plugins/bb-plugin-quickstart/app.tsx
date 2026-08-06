// bb-plugin-quickstart — a single "Quickstart" entry in the thread panel
// Actions list. The panel holds every preset: built-in terminals (tmux,
// dev server, nvim), a localhost browser view (rendered inline in the same
// tab), and custom presets from plugin settings.
import { useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";

const BUILTIN_PRESETS = [
  { title: "tmux", command: "tmux new -A -s bb" },
  { title: "notion run --listenToStripe", command: "notion run --listenToStripe" },
  { title: "nvim", command: "nvim ." },
];

const BROWSER_URL = "http://localhost:3000";

function BrowserView({ url, onBack }: { url: string; onBack: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={onBack}>
          ← Presets
        </Button>
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
      <iframe src={url} title={url} className="h-full w-full flex-1 border-0 bg-white" />
    </div>
  );
}

function QuickstartPanel({ threadId }: { threadId: string; params: unknown }) {
  const rpc = useRpc<typeof rpcContract>();
  const [customPresets, setCustomPresets] = useState<
    { title: string; command: string }[]
  >([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [browserOpen, setBrowserOpen] = useState(false);

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

  if (browserOpen) {
    return <BrowserView url={BROWSER_URL} onBack={() => setBrowserOpen(false)} />;
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
        <div className="pt-2 text-xs font-medium uppercase tracking-wide text-subtle-foreground">
          Browser
        </div>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left hover:bg-state-hover"
          onClick={() => setBrowserOpen(true)}
        >
          <span className="text-sm font-medium">localhost:3000</span>
          <span className="ml-auto font-mono text-xs text-muted-foreground">
            renders here in this tab
          </span>
        </button>
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
