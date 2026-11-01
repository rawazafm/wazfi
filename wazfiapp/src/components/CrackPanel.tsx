import * as React from "react";
import { KeyRound, Play, Square, RefreshCw, Check, Upload } from "lucide-react";
import { useApp } from "@/store";
import {
  listCaptures,
  listWordlists,
  pickWordlist,
  type CaptureFile,
  type WordlistFile,
} from "@/lib/tauri";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

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
  const [custom, setCustom] = React.useState<WordlistFile[]>([]);

  const running = attacks.includes("crack");
  const allWls = [...custom, ...wls];
  const selectedCap = caps.find((c) => c.path === cap);
  const isPmkid = selectedCap?.kind === "pmkid";
  const engine = isPmkid ? "hashcat (mode 22000)" : "aircrack-ng";

  async function upload() {
    const path = await pickWordlist();
    if (!path) return;
    const name = path.split("/").pop() ?? path;
    setCustom((c) =>
      c.some((x) => x.path === path) ? c : [{ name: `${name} (custom)`, path, size: 0 }, ...c],
    );
    setWl(path);
  }

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
            Dictionary attack
            <span className="font-mono text-[11px] font-normal text-muted-foreground">
              {engine}
            </span>
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
              Handshake / PMKID capture
            </label>
            <Select
              value={cap}
              onChange={(e) => setCap(e.target.value)}
              disabled={running}
            >
              {caps.length === 0 && (
                <option value="">no crackable captures yet</option>
              )}
              {caps.map((c) => (
                <option key={c.path} value={c.path}>
                  {c.kind === "pmkid" ? "[PMKID] " : ""}
                  {c.name} ({human(c.size)})
                </option>
              ))}
            </Select>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-[11px] text-muted-foreground">Wordlist</label>
              <button
                onClick={upload}
                disabled={running}
                className="flex items-center gap-1 text-[11px] text-primary hover:underline disabled:opacity-50"
              >
                <Upload className="h-3 w-3" /> Upload .txt
              </button>
            </div>
            <Select
              value={wl}
              onChange={(e) => setWl(e.target.value)}
              disabled={running}
            >
              {allWls.length === 0 && (
                <option value="">no wordlists — generate or upload one</option>
              )}
              {allWls.map((w) => (
                <option key={w.path} value={w.path}>
                  {w.name}
                  {w.size ? ` (${human(w.size)})` : ""}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {isPmkid
                ? "Converts the PMKID with hcxpcapngtool and cracks it offline with hashcat."
                : "Cracks the handshake offline against the chosen wordlist."}
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
