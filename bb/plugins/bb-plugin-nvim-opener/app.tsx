// bb-plugin-nvim-opener — frontend entry.
//
// Registers a fileOpener for code extensions. Opening a matching file
// creates a bb terminal in the file's environment running `nvim <path>`.
import { useEffect, useRef, useState } from "react";
import { definePluginApp, useRpc } from "@bb/plugin-sdk/app";
import { toast } from "sonner";
import type { rpcContract } from "./server";
import { Button } from "@/components/ui/button";

const CODE_EXTENSIONS = [
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "rb",
  "sh",
  "zsh",
  "bash",
  "c",
  "h",
  "cpp",
  "hpp",
  "java",
  "kt",
  "swift",
  "sql",
  "json",
  "yaml",
  "yml",
  "toml",
  "css",
  "scss",
  "html",
  "vue",
  "svelte",
  "lua",
  "vim",
  "tf",
  "proto",
  "graphql",
  "env",
  "conf",
  "ini",
];

interface FileOpenerProps {
  path: string;
  source: {
    kind: "workspace" | "host" | "thread-storage";
    threadId: string | null;
    environmentId: string | null;
    projectId: string | null;
  };
}

function NvimOpener({ path, source }: FileOpenerProps) {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<string>("Opening in nvim…");
  const [failed, setFailed] = useState(false);
  const openedRef = useRef(false);

  async function open() {
    setFailed(false);
    setStatus("Opening in nvim…");
    try {
      const result = await rpc.call("openInNvim", {
        path,
        environmentId: source.environmentId,
        threadId: source.threadId,
        sourceKind: source.kind,
      });
      setStatus(result.message);
      setFailed(!result.ok);
      if (result.ok) {
        toast.success(`nvim: ${path}`);
      }
    } catch (error) {
      setFailed(true);
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="font-mono text-sm text-foreground">{path}</div>
      <div
        className={
          failed ? "text-sm text-destructive" : "text-sm text-muted-foreground"
        }
      >
        {status}
      </div>
      <Button size="sm" variant="outline" onClick={() => void open()}>
        {failed ? "Retry" : "Open another nvim"}
      </Button>
      <div className="text-xs text-subtle-foreground">
        The nvim terminal appears in this thread's terminal tabs.
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.fileOpener({
    id: "nvim",
    title: "Neovim (terminal)",
    extensions: CODE_EXTENSIONS,
    component: NvimOpener,
  });
});
