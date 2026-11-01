import { motion, AnimatePresence } from "framer-motion";
import { Lock, LockOpen, Radar, RefreshCw, Wifi } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function signalBars(power: number) {
  // power is negative dBm; closer to 0 = stronger
  if (power >= -50) return 4;
  if (power >= -60) return 3;
  if (power >= -70) return 2;
  return 1;
}

function encColor(enc: string) {
  if (enc === "OPN") return "text-rose-300 border-rose-500/30 bg-rose-500/10";
  if (enc === "WEP") return "text-amber-300 border-amber-500/30 bg-amber-500/10";
  if (enc.includes("WPA3")) return "text-emerald-300 border-emerald-500/30 bg-emerald-500/10";
  if (enc.includes("EAP")) return "text-violet-300 border-violet-500/30 bg-violet-500/10";
  return "text-cyan-300 border-cyan-500/30 bg-cyan-500/10";
}

export function NetworkTable() {
  const { networks, selectedId, selectTarget, runScan, scanning } = useApp();

  return (
    <div className="glass flex h-full flex-col overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Radar className="h-4 w-4 text-primary" />
          Nearby Networks
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {networks.length}
          </span>
        </div>
        <Button size="sm" variant="glass" onClick={runScan} disabled={scanning}>
          <RefreshCw className={cn("h-3.5 w-3.5", scanning && "animate-spin")} />
          {scanning ? "Scanning" : "Scan"}
        </Button>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 border-b border-border/40 px-4 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>ESSID / BSSID</span>
        <span className="text-center">Ch</span>
        <span className="text-center">Enc</span>
        <span className="text-center">WPS</span>
        <span className="text-right">Signal</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {networks.length === 0 && !scanning && (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center text-sm text-muted-foreground">
            <Wifi className="h-8 w-8 opacity-30" />
            No networks yet. Run a scan to discover targets.
          </div>
        )}
        <AnimatePresence initial={false}>
          {networks.map((n) => {
            const selected = n.id === selectedId;
            const bars = signalBars(n.power);
            return (
              <motion.button
                key={n.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                onClick={() => selectTarget(selected ? null : n.id)}
                className={cn(
                  "grid w-full grid-cols-[1fr_auto_auto_auto_auto] items-center gap-3 border-b border-border/30 px-4 py-2.5 text-left text-sm transition-colors",
                  selected
                    ? "bg-primary/10"
                    : "hover:bg-accent/40",
                )}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {n.essid === "<hidden>" ? (
                        <span className="italic text-muted-foreground">
                          &lt;hidden&gt;
                        </span>
                      ) : (
                        n.essid
                      )}
                    </span>
                    <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">
                      {n.band}
                    </span>
                  </div>
                  <div className="truncate font-mono text-[10px] text-muted-foreground">
                    {n.bssid} · {n.clients} clients
                  </div>
                </div>
                <span className="text-center font-mono text-xs text-muted-foreground">
                  {n.channel}
                </span>
                <Badge className={cn("justify-center", encColor(n.encryption))}>
                  {n.encryption === "OPN" ? (
                    <LockOpen className="h-3 w-3" />
                  ) : (
                    <Lock className="h-3 w-3" />
                  )}
                  {n.encryption}
                </Badge>
                <span className="text-center text-xs">
                  {n.wps ? (
                    <span className="text-emerald-400">●</span>
                  ) : (
                    <span className="text-muted-foreground/30">○</span>
                  )}
                </span>
                <span className="flex items-center justify-end gap-0.5">
                  {[1, 2, 3, 4].map((b) => (
                    <span
                      key={b}
                      className={cn(
                        "w-1 rounded-sm",
                        b <= bars ? "bg-cyan-400" : "bg-muted",
                      )}
                      style={{ height: `${4 + b * 3}px` }}
                    />
                  ))}
                  <span className="ml-1 w-9 text-right font-mono text-[10px] text-muted-foreground">
                    {n.power}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
