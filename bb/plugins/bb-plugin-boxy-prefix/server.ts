// bb-plugin-boxy-prefix — prefix thread titles with "boxy - " when the
// thread's environment runs on a boxy host.
//
// Listens to thread.created and thread.idle (idle also catches bb's
// auto-generated titles, which land after the first turn) and renames via
// the SDK when the title lacks the prefix. Hosts are matched by name
// against the `hostPattern` setting.
import type { BbPluginApi } from "@bb/plugin-sdk";

const PREFIX = "boxy - ";

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    hostPattern: {
      type: "string",
      label: "Host-name substring that marks a boxy host (case-insensitive)",
      default: "boxy",
    },
  });

  // hostId → isBoxy, refreshed lazily.
  const hostCache = new Map<string, { isBoxy: boolean; at: number }>();
  const envHostCache = new Map<string, string | null>();

  async function isBoxyHost(hostId: string): Promise<boolean> {
    const cached = hostCache.get(hostId);
    if (cached && Date.now() - cached.at < 300_000) return cached.isBoxy;
    const { hostPattern } = await settings.get();
    let isBoxy = false;
    try {
      const host = await bb.sdk.hosts.get({ hostId });
      const name = (host as { name?: string | null }).name ?? "";
      isBoxy = name.toLowerCase().includes(hostPattern.toLowerCase());
    } catch {
      isBoxy = false;
    }
    hostCache.set(hostId, { isBoxy, at: Date.now() });
    return isBoxy;
  }

  async function maybePrefix(thread: {
    id: string;
    title?: string | null;
    environmentId?: string | null;
  }): Promise<void> {
    try {
      const title = thread.title ?? "";
      if (!title || title.toLowerCase().startsWith(PREFIX.toLowerCase())) return;
      const environmentId = thread.environmentId;
      if (!environmentId) return;
      let hostId = envHostCache.get(environmentId);
      if (hostId === undefined) {
        try {
          const environment = await bb.sdk.environments.get({ environmentId });
          hostId = (environment as { hostId?: string | null }).hostId ?? null;
        } catch {
          hostId = null;
        }
        envHostCache.set(environmentId, hostId);
      }
      if (!hostId || !(await isBoxyHost(hostId))) return;
      await bb.sdk.threads.update({ threadId: thread.id, title: `${PREFIX}${title}` });
      bb.log.info(`prefixed thread ${thread.id}: "${PREFIX}${title}"`);
    } catch (error) {
      bb.log.warn(
        `prefix failed for ${thread.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  bb.events.on("thread.created", ({ thread }) => {
    void maybePrefix(thread as Parameters<typeof maybePrefix>[0]);
  });
  bb.events.on("thread.idle", ({ thread }) => {
    void maybePrefix(thread as Parameters<typeof maybePrefix>[0]);
  });
}
