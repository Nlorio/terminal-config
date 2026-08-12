// bb-plugin-live-browser — live view of a CDP-driven Chrome page.
//
// Opens as a thread-panel tab (beside the conversation) or a nav panel. The
// image is an MJPEG stream from the plugin's own HTTP route, so frames arrive
// push-style with no client polling.
import { useCallback, useEffect, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract, CdpTarget } from "./server";
import { Button } from "@/components/ui/button";

const PLUGIN_ID = "live-browser";
const STREAM_URL = `/api/v1/plugins/${PLUGIN_ID}/http/stream`;

function shortUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").slice(0, 60) || "(blank)";
}

function LiveBrowser() {
  const rpc = useRpc<typeof rpcContract>();
  const [targets, setTargets] = useState<CdpTarget[]>([]);
  const [endpoints, setEndpoints] = useState<
    { port: number; browser: string; pages: number }[]
  >([]);
  const [streaming, setStreaming] = useState(false);
  const [active, setActive] = useState<CdpTarget | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [quality, setQuality] = useState(60);
  const [maxWidth, setMaxWidth] = useState(1200);
  // Bumped on every (re)attach so the <img> reconnects to a fresh stream.
  const [streamKey, setStreamKey] = useState(0);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const result = await rpc.call("listTargets");
      setTargets(result.targets);
      setEndpoints(result.endpoints);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setScanning(false);
    }
  }, [rpc]);

  const refreshStatus = useCallback(async () => {
    const status = await rpc.call("status");
    setStreaming(status.streaming);
    setActive(status.target);
    setFrameCount(status.frameCount);
    setError(status.error);
  }, [rpc]);

  useEffect(() => {
    void scan();
    void refreshStatus();
    const timer = setInterval(() => {
      if (!document.hidden) void refreshStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, [scan, refreshStatus]);

  async function attach(target: CdpTarget) {
    const result = await rpc.call("attach", {
      port: target.port,
      targetId: target.targetId,
      maxWidth,
      quality,
    });
    if (result.ok) {
      setStreamKey((key) => key + 1);
      toast.success(`Watching ${shortUrl(target.url)}`);
    } else {
      toast.error(result.message);
    }
    await refreshStatus();
  }

  async function detach() {
    await rpc.call("detach");
    await refreshStatus();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border p-2">
        <select
          className="h-7 max-w-[280px] rounded-md border border-input bg-background px-2 text-xs text-foreground"
          value={active ? `${active.port}:${active.targetId}` : ""}
          onChange={(event) => {
            const target = targets.find(
              (candidate) =>
                `${candidate.port}:${candidate.targetId}` === event.target.value,
            );
            if (target) void attach(target);
          }}
        >
          <option value="">
            {targets.length ? "Pick a page to watch…" : "No pages found"}
          </option>
          {targets.map((target) => (
            <option
              key={`${target.port}:${target.targetId}`}
              value={`${target.port}:${target.targetId}`}
            >
              :{target.port} · {target.title || shortUrl(target.url)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          disabled={scanning}
          onClick={() => void scan()}
        >
          {scanning ? "Scanning…" : "Rescan"}
        </Button>
        {streaming ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={() => void detach()}
          >
            Stop
          </Button>
        ) : null}
        <select
          className="h-7 rounded-md border border-input bg-background px-1 text-xs text-muted-foreground"
          value={String(maxWidth)}
          onChange={(event) => setMaxWidth(Number(event.target.value))}
          title="Stream width"
        >
          {[800, 1200, 1600].map((width) => (
            <option key={width} value={width}>
              {width}px
            </option>
          ))}
        </select>
        <select
          className="h-7 rounded-md border border-input bg-background px-1 text-xs text-muted-foreground"
          value={String(quality)}
          onChange={(event) => setQuality(Number(event.target.value))}
          title="JPEG quality"
        >
          {[30, 60, 85].map((value) => (
            <option key={value} value={value}>
              q{value}
            </option>
          ))}
        </select>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-subtle-foreground">
          {streaming ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              {frameCount} frames
            </>
          ) : (
            <span>idle</span>
          )}
        </span>
      </div>
      {error && !streaming ? (
        <div className="border-b border-border bg-destructive/10 px-2 py-1 text-xs text-destructive-text">
          {error}
        </div>
      ) : null}
      <div className="flex flex-1 items-center justify-center overflow-auto bg-surface-recessed p-2">
        {streaming ? (
          <img
            key={streamKey}
            src={`${STREAM_URL}?k=${streamKey}`}
            alt="Live browser view"
            className="max-h-full max-w-full rounded border border-border-hairline"
          />
        ) : (
          <div className="max-w-md space-y-2 p-4 text-center">
            <div className="text-sm text-muted-foreground">
              Pick a page above to watch it live.
            </div>
            <div className="text-xs text-subtle-foreground">
              {endpoints.length
                ? `CDP endpoints: ${endpoints
                    .map(
                      (endpoint) => `:${endpoint.port} (${endpoint.pages} pages)`,
                    )
                    .join(", ")}`
                : "No CDP endpoints found. Start Chrome with --remote-debugging-port, or launch a chrome-devtools-mcp / terminal-browser session."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.threadPanelAction({
    id: "live-browser",
    title: "Live browser",
    icon: "Globe",
    component: LiveBrowser,
    layout: "flush",
    run: ({ openPanel }) => openPanel({ title: "Live browser" }),
  });
  app.slots.navPanel({
    id: "live-browser",
    title: "Live Browser",
    icon: "Globe",
    path: "live-browser",
    component: LiveBrowser,
  });
});
