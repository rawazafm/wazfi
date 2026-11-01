import * as React from "react";
import { Wand2, Play, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store";
import { generateWordlist } from "@/lib/tauri";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const PRESETS: { id: string; label: string; charset: string }[] = [
  { id: "digits", label: "Digits (0-9)", charset: "0123456789" },
  { id: "lower", label: "Lowercase a-z", charset: "abcdefghijklmnopqrstuvwxyz" },
  {
    id: "lowerdigits",
    label: "Lowercase + digits",
    charset: "abcdefghijklmnopqrstuvwxyz0123456789",
  },
  {
    id: "alnum",
    label: "Alphanumeric (a-z A-Z 0-9)",
    charset:
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  },
  { id: "custom", label: "Custom…", charset: "" },
];

// Rough keyspace estimate = charsetLen ^ maxLen (dominant term).
function estimate(charsetLen: number, max: number): string {
  if (!charsetLen || !max) return "—";
  const count = Math.pow(charsetLen, max);
  if (!isFinite(count)) return "enormous";
  if (count < 1e6) return `${Math.round(count).toLocaleString()} lines`;
  if (count < 1e9) return `~${(count / 1e6).toFixed(1)}M lines`;
  if (count < 1e12) return `~${(count / 1e9).toFixed(1)}B lines`;
  return "huge (hours/days + lots of disk)";
}

export function WordlistGenerator() {
  const { attacks, stopAttack, log } = useApp();
  const [preset, setPreset] = React.useState("lowerdigits");
  const [custom, setCustom] = React.useState("");
  const [min, setMin] = React.useState("8");
  const [max, setMax] = React.useState("8");
  const [pattern, setPattern] = React.useState("");
  const [name, setName] = React.useState("wazfi");
  const [busy, setBusy] = React.useState(false);

  const running = attacks.includes("wordlist");
  const charset =
    preset === "custom"
      ? custom
      : PRESETS.find((p) => p.id === preset)?.charset ?? "";
  const minN = parseInt(min, 10) || 0;
  const maxN = parseInt(max, 10) || 0;

  async function generate() {
    setBusy(true);
    try {
      const out = await generateWordlist({
        charset,
        min: minN,
        max: maxN,
        pattern,
        name,
      });
      log("ok", `wordlist → ${out}`);
    } catch (e) {
      log("err", `wordlist failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Wand2 className="h-4 w-4 text-primary" />
          Advanced dictionary generator
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            crunch
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Character set
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setPreset(p.id)}
                  disabled={running}
                  className={cn(
                    "rounded-md border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                    preset === p.id
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 text-muted-foreground hover:bg-accent/40",
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {preset === "custom" && (
              <Input
                className="mt-2 font-mono"
                placeholder="e.g. abc123!@#"
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                disabled={running}
                spellCheck={false}
              />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Min length
              </label>
              <Input
                type="number"
                min={1}
                max={20}
                value={min}
                onChange={(e) => setMin(e.target.value)}
                disabled={running}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Max length
              </label>
              <Input
                type="number"
                min={1}
                max={20}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                disabled={running}
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-muted-foreground">
                Output name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={running}
                spellCheck={false}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Pattern (optional) — <span className="font-mono">@</span>=lower{" "}
              <span className="font-mono">,</span>=upper{" "}
              <span className="font-mono">%</span>=digit{" "}
              <span className="font-mono">^</span>=symbol
            </label>
            <Input
              className="font-mono"
              placeholder="e.g. pass%%%%"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              disabled={running}
              spellCheck={false}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/20 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">
              Estimated size:{" "}
              <span className="font-mono text-foreground">
                {estimate(charset.length, maxN)}
              </span>
            </span>
            {running ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => stopAttack("wordlist")}
              >
                <Square className="h-3.5 w-3.5" /> Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={generate}
                disabled={busy || !charset || maxN < minN || maxN < 1}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                Generate
              </Button>
            )}
          </div>
          <p className="text-[10px] leading-relaxed text-muted-foreground">
            Saved to <span className="font-mono">~/wazfi-wordlists/{name || "wordlist"}.txt</span>.
            Progress streams to the console. Large keyspaces can fill the disk —
            watch the estimate.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
