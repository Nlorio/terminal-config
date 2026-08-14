// bb-plugin-live-browser — watch CDP-driven Chrome inside bb.
//
// Discovers Chrome DevTools Protocol endpoints on loopback (chrome-devtools-mcp,
// terminal-browser, orca, anything started with --remote-debugging-port), then
// streams the selected page as MJPEG so an e2e run is visible beside the
// conversation.
//
// Frames come from Page.startScreencast, which only emits on visual change —
// an idle page costs nothing and an active automation streams smoothly.
import { defineRpcContract, type BbPluginApi } from "@bb/plugin-sdk";
import { z } from "zod";

const targetSchema = z.object({
  port: z.number(),
  targetId: z.string(),
  title: z.string(),
  url: z.string(),
  browser: z.string(),
});
export type CdpTarget = z.infer<typeof targetSchema>;

export const rpcContract = defineRpcContract({
  listTargets: {
    input: z.null(),
    output: z.object({
      targets: z.array(targetSchema),
      endpoints: z.array(
        z.object({ port: z.number(), browser: z.string(), pages: z.number() }),
      ),
      scannedAt: z.number(),
    }),
  },
  status: {
    input: z.null(),
    output: z.object({
      streaming: z.boolean(),
      target: targetSchema.nullable(),
      frameCount: z.number(),
      lastFrameAt: z.number().nullable(),
      error: z.string().nullable(),
    }),
  },
  attach: {
    input: z
      .object({
        port: z.number(),
        targetId: z.string(),
        maxWidth: z.number().int().min(200).max(2400),
        quality: z.number().int().min(10).max(90),
      })
      .strict(),
    output: z.object({ ok: z.boolean(), message: z.string() }),
  },
  detach: {
    input: z.null(),
    output: z.object({ ok: z.boolean() }),
  },
});

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

// Chrome's default port plus the range the MCP / terminal-browser launchers
// pick from. Each probe is a sub-second loopback fetch, all run concurrently.
const PROBE_PORTS = [
  9222, 9223, 9224, 9225, 9226, 9227, 9228, 9230, 9231, 9232, 9333,
];

type WsLike = {
  send(data: string): void;
  close(): void;
  addEventListener(type: string, handler: (event: unknown) => void): void;
};
type WsCtor = new (url: string) => WsLike;

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    extraPorts: {
      type: "string",
      label: "Additional CDP ports to probe (comma-separated)",
      default: "",
    },
  });

  // Node 22 exposes a global WebSocket; older runtimes need the ws package.
  let wsCtor: WsCtor | null = null;
  async function getWs(): Promise<WsCtor> {
    if (wsCtor) return wsCtor;
    const globalWs = (globalThis as { WebSocket?: WsCtor }).WebSocket;
    if (globalWs) {
      wsCtor = globalWs;
      bb.log.info("using global WebSocket");
      return wsCtor;
    }
    const mod = (await import("ws")) as unknown as { default: WsCtor };
    wsCtor = mod.default;
    bb.log.info("using ws package");
    return wsCtor;
  }

  async function probePorts(): Promise<number[]> {
    const { extraPorts } = await settings.get();
    const extra = extraPorts
      .split(",")
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value > 0);
    return [...new Set([...PROBE_PORTS, ...extra])];
  }

  async function fetchJson<T>(url: string, timeoutMs = 400): Promise<T | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) return null;
      return (await response.json()) as T;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  interface Session {
    port: number;
    target: CdpTarget;
    socket: WsLike;
    sessionId: string | null;
    latestFrame: Buffer | null;
    frameCount: number;
    lastFrameAt: number | null;
    listeners: Set<(frame: Buffer) => void>;
    closed: boolean;
  }
  // One session at a time: the panel shows a single page.
  let session: Session | null = null;
  let lastError: string | null = null;

  function teardown(): void {
    if (!session) return;
    session.closed = true;
    try {
      session.socket.close();
    } catch {
      // already closing
    }
    session.listeners.clear();
    session = null;
  }
  bb.onDispose(teardown);

  async function attach(
    port: number,
    targetId: string,
    maxWidth: number,
    quality: number,
  ): Promise<{ ok: boolean; message: string }> {
    teardown();
    lastError = null;
    const version = await fetchJson<{
      webSocketDebuggerUrl?: string;
      Browser?: string;
    }>(`http://127.0.0.1:${port}/json/version`, 1000);
    if (!version?.webSocketDebuggerUrl) {
      lastError = `No CDP endpoint on port ${port}`;
      return { ok: false, message: lastError };
    }
    const Ws = await getWs();
    const socket = new Ws(version.webSocketDebuggerUrl);
    const state: Session = {
      port,
      target: {
        port,
        targetId,
        title: "",
        url: "",
        browser: version.Browser ?? "unknown",
      },
      socket,
      sessionId: null,
      latestFrame: null,
      frameCount: 0,
      lastFrameAt: null,
      listeners: new Set(),
      closed: false,
    };
    session = state;

    let nextId = 0;
    const pending = new Map<number, (message: CdpMessage) => void>();
    const send = (
      method: string,
      params: Record<string, unknown> = {},
      sessionId?: string,
    ): Promise<CdpMessage> =>
      new Promise((resolve) => {
        const id = ++nextId;
        pending.set(id, resolve);
        socket.send(
          JSON.stringify({
            id,
            method,
            params,
            ...(sessionId ? { sessionId } : {}),
          }),
        );
      });

    socket.addEventListener("message", (event: unknown) => {
      const data = (event as { data?: unknown }).data ?? event;
      const raw = typeof data === "string" ? data : String(data);
      let message: CdpMessage;
      try {
        message = JSON.parse(raw) as CdpMessage;
      } catch {
        return;
      }
      if (message.id !== undefined && pending.has(message.id)) {
        pending.get(message.id)!(message);
        pending.delete(message.id);
        return;
      }
      if (message.method === "Page.screencastFrame") {
        const params = message.params as
          | { data?: string; sessionId?: number }
          | undefined;
        if (params?.data) {
          const frame = Buffer.from(params.data, "base64");
          state.latestFrame = frame;
          state.frameCount += 1;
          state.lastFrameAt = Date.now();
          for (const listener of state.listeners) listener(frame);
        }
        // Chrome stops sending frames unless each one is acked.
        if (params?.sessionId !== undefined) {
          void send(
            "Page.screencastFrameAck",
            { sessionId: params.sessionId },
            state.sessionId ?? undefined,
          );
        }
      }
      if (
        message.method === "Inspector.detached" ||
        message.method === "Target.detachedFromTarget"
      ) {
        lastError = "Chrome detached the session (page closed?)";
        teardown();
      }
    });
    socket.addEventListener("close", () => {
      if (state === session && !state.closed) {
        lastError = "CDP socket closed";
        teardown();
      }
    });

    const opened = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 5000);
      socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.addEventListener("error", () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
    if (!opened || session !== state) {
      lastError = lastError ?? "CDP connect failed";
      teardown();
      return { ok: false, message: lastError };
    }

    const attached = await send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const sessionId = (attached.result as { sessionId?: string } | undefined)
      ?.sessionId;
    if (!sessionId) {
      lastError = attached.error?.message ?? "attachToTarget failed";
      teardown();
      return { ok: false, message: lastError };
    }
    state.sessionId = sessionId;
    await send("Page.enable", {}, sessionId);
    const started = await send(
      "Page.startScreencast",
      { format: "jpeg", quality, maxWidth, everyNthFrame: 1 },
      sessionId,
    );
    if (started.error) {
      lastError = started.error.message ?? "startScreencast failed";
      teardown();
      return { ok: false, message: lastError };
    }
    // Seed a frame so the panel is never blank on a static page.
    const shot = await send(
      "Page.captureScreenshot",
      { format: "jpeg", quality },
      sessionId,
    );
    const seed = (shot.result as { data?: string } | undefined)?.data;
    if (seed) {
      state.latestFrame = Buffer.from(seed, "base64");
      state.lastFrameAt = Date.now();
    }

    bb.log.info(`streaming target ${targetId} on port ${port}`);
    return { ok: true, message: "Streaming." };
  }

  bb.rpc.register(rpcContract, {
    async listTargets() {
      const ports = await probePorts();
      const endpoints: { port: number; browser: string; pages: number }[] = [];
      const targets: CdpTarget[] = [];
      await Promise.all(
        ports.map(async (port) => {
          const version = await fetchJson<{ Browser?: string }>(
            `http://127.0.0.1:${port}/json/version`,
          );
          if (!version) return;
          const list =
            (await fetchJson<
              { id: string; type: string; title?: string; url?: string }[]
            >(`http://127.0.0.1:${port}/json/list`)) ?? [];
          const pages = list.filter((entry) => entry.type === "page");
          endpoints.push({
            port,
            browser: version.Browser ?? "unknown",
            pages: pages.length,
          });
          for (const page of pages) {
            targets.push({
              port,
              targetId: page.id,
              title: page.title ?? "",
              url: page.url ?? "",
              browser: version.Browser ?? "unknown",
            });
          }
        }),
      );
      endpoints.sort((a, b) => a.port - b.port);
      targets.sort((a, b) => a.port - b.port || a.url.localeCompare(b.url));
      return { targets, endpoints, scannedAt: Date.now() };
    },
    async status() {
      return {
        streaming: session !== null && session.sessionId !== null,
        target: session?.target ?? null,
        frameCount: session?.frameCount ?? 0,
        lastFrameAt: session?.lastFrameAt ?? null,
        error: lastError,
      };
    },
    async attach({ port, targetId, maxWidth, quality }) {
      try {
        return await attach(port, targetId, maxWidth, quality);
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        teardown();
        return { ok: false, message: lastError };
      }
    },
    async detach() {
      teardown();
      return { ok: true };
    },
  });

  // MJPEG: an <img> pointed here renders a live view with no client polling.
  bb.http.route(
    "get",
    "/stream",
    (context) => {
      const state = session;
      if (!state) return context.text("Not streaming", 409);
      const boundary = "bbframe";
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          let closed = false;
          const push = (frame: Buffer) => {
            if (closed) return;
            try {
              controller.enqueue(
                encoder.encode(
                  `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`,
                ),
              );
              controller.enqueue(new Uint8Array(frame));
              controller.enqueue(encoder.encode("\r\n"));
            } catch {
              closed = true;
            }
          };
          if (state.latestFrame) push(state.latestFrame);
          state.listeners.add(push);
          // Re-send the last frame periodically so a reconnecting <img> is
          // never blank, and so a dead session closes the response.
          const heartbeat = setInterval(() => {
            if (closed || state.closed) {
              clearInterval(heartbeat);
              state.listeners.delete(push);
              try {
                controller.close();
              } catch {
                // already closed
              }
              return;
            }
            if (state.latestFrame) push(state.latestFrame);
          }, 10_000);
        },
      });
      return new Response(stream, {
        headers: {
          "content-type": `multipart/x-mixed-replace; boundary=${boundary}`,
          "cache-control": "no-store",
        },
      });
    },
    { auth: "local" },
  );

  // Single frame: cheap poll fallback, and what smoke tests hit.
  bb.http.route(
    "get",
    "/frame",
    (context) => {
      if (!session?.latestFrame) return context.text("No frame", 404);
      return new Response(new Uint8Array(session.latestFrame), {
        headers: { "content-type": "image/jpeg", "cache-control": "no-store" },
      });
    },
    { auth: "local" },
  );
}
