import { Activity, Crosshair, Cpu, ShieldCheck, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store";

export function StatusBar() {
  const { system, selectedIface, interfaces, selectedId, networks, scanning } =
    useApp();
  const iface = interfaces.find((i) => i.name === selectedIface);
  const target = networks.find((n) => n.id === selectedId);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-border/70 bg-background/60 px-4 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              scanning ? "animate-pulse bg-cyan-400" : "bg-emerald-400",
            )}
          />
          {scanning ? "scanning" : "idle"}
        </span>
        <span className="flex items-center gap-1.5 font-mono">
          <Cpu className="h-3 w-3" />
          {iface ? `${iface.name} · ${iface.mode}` : "no adapter"}
        </span>
        {target && (
          <span className="flex items-center gap-1.5 font-mono text-cyan-300">
            <Crosshair className="h-3 w-3" />
            {target.essid} ({target.bssid})
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 font-mono">
          <Activity className="h-3 w-3" />
          {networks.length} nets
        </span>
        {system?.attack_capable ? (
          <span className="flex items-center gap-1.5 text-emerald-400">
            <ShieldCheck className="h-3 w-3" /> live mode
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-amber-400">
            <ShieldAlert className="h-3 w-3" /> preview mode
          </span>
        )}
      </div>
    </footer>
  );
}
