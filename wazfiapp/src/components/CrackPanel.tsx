import * as React from "react";
import { KeyRound, Play, Square, RefreshCw, Check } from "lucide-react";
import { useApp } from "@/store";
import {
  listCaptures,
  listWordlists,
  type CaptureFile,
  type WordlistFile,
} from "@/lib/tauri";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function human(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

export function CrackPanel() {
  const { attacks, launchCrack, stopAttack, crackKey, lastCapture } = useApp();
  const [caps, setCaps] = React.useState<CaptureFile[]>([]);
  const [wls, setWls] = React.useState<WordlistFile[]>([]);
  const [cap, setCap] = React.useState("");
  const [wl, setWl] = React.useState("");

  const running = attacks.includes("crack");

  const load = React.useCallback(async () => {
    const [c, w] = await Promise.all([listCaptures(), listWordlists()]);
    const withHs = c.filter((x) => x.has_handshake);
    setCaps(withHs);
    setWls(w);
    setCap((cur) => cur || withHs[0]?.path || "");
    setWl((cur) => cur || w[0]?.path || "");
  }, []);

  React.useEffect(() => {
    void load();
  }, [load, lastCapture]);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-primary" />
            Dictionary attack (aircrack-ng)
          </div>
          <Button size="sm" variant="glass" onClick={load}>
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
        </div>

        {crackKey && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
            <Check className="h-4 w-4 shrink-0" />
            <span>
              KEY FOUND:{" "}
              <span className="font-mono font-semibold text-emerald-100">
                {crackKey}
              </span>
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Handshake capture
            </label>
            <select
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              disabled={running}
              className="h-9 w-full rounded-md border border-input bg-background/60 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              {caps.length === 0 && <option value="">no captures with a handshake</option>}
              {caps.map((c) => (
                <option key={c.path} value={c.path}>
                  {c.name} ({human(c.size)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Wordlist
            </label>
            <select
              value={wl}
              onChange={(e) => setWl(e.target.value)}
              disabled={running}
              className="h-9 w-full rounded-md border border-input bg-background/60 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 disabled:opacity-50"
            >
              {wls.length === 0 && (
                <option value="">no wordlists — generate one above</option>
              )}
              {wls.map((w) => (
                <option key={w.path} value={w.path}>
                  {w.name} ({human(w.size)})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              Cracks the handshake offline against the chosen wordlist.
            </span>
            {running ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => stopAttack("crack")}
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => cap && wl && launchCrack(cap, wl)}
                disabled={!cap || !wl}
              >
                <Play className="h-3.5 w-3.5" /> Crack
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
