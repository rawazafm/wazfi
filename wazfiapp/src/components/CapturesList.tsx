import * as React from "react";
import { FileArchive, RefreshCw, Trash2, Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store";
import {
  deleteCapture,
  listCaptures,
  type CaptureFile,
} from "@/lib/tauri";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function human(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ago(secs: number) {
  if (!secs) return "";
  const d = Date.now() / 1000 - secs;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function CapturesList() {
  const { lastCapture, log } = useApp();
  const [items, setItems] = React.useState<CaptureFile[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      setItems(await listCaptures());
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and whenever a new handshake is captured.
  React.useEffect(() => {
    void load();
  }, [load, lastCapture]);

  async function remove(c: CaptureFile) {
    try {
      await deleteCapture(c.path);
      log("info", `deleted ${c.name}`);
      void load();
    } catch (e) {
      log("err", `delete failed: ${String(e)}`);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileArchive className="h-4 w-4 text-primary" />
            Captured handshakes
            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {items.length}
            </span>
          </div>
          <Button size="sm" variant="glass" onClick={load} disabled={loading}>
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-6 text-center text-xs text-muted-foreground">
            No captures yet. Run <span className="font-medium">Capture handshake</span>{" "}
            — saved files appear here (<span className="font-mono">~/wazfi-captures</span>).
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((c) => (
              <div
                key={c.path}
                className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-mono text-xs text-foreground">
                    {c.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{human(c.size)}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {ago(c.modified)}
                    </span>
                  </div>
                </div>
                {c.has_handshake ? (
                  <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                    <Check className="h-3 w-3" /> handshake
                  </Badge>
                ) : (
                  <Badge className="border-border bg-muted/40 text-muted-foreground">
                    no handshake
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-rose-300"
                  onClick={() => remove(c)}
                  title="delete capture"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
