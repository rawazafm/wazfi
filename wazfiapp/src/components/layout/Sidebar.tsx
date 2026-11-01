import { motion } from "framer-motion";
import { Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_CLASSES, DASHBOARD, MODULES, type ModuleId } from "@/lib/menu";
import { useApp } from "@/store";

interface SidebarProps {
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
}

export function Sidebar({ active, onSelect }: SidebarProps) {
  const { selectedIface, interfaces } = useApp();
  const iface = interfaces.find((i) => i.name === selectedIface);
  const monitor = iface?.mode === "monitor";

  const items = [DASHBOARD, ...MODULES];

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-border/70 bg-background/40">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="relative grid h-10 w-10 place-items-center rounded-xl bg-primary/15 neon-ring">
          <Radar className="h-5 w-5 text-primary" />
          <span className="absolute inset-0 rounded-xl pulse-ring" />
        </div>
        <div>
          <div className="text-lg font-bold leading-none tracking-tight">
            <span className="text-gradient">wazfi</span>
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Audit Suite
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        {items.map((m) => {
          const isActive = active === m.id;
          const accent =
            "accent" in m
              ? ACCENT_CLASSES[(m as (typeof MODULES)[number]).accent]
              : ACCENT_CLASSES.cyan;
          const Icon = m.icon;
          const needsMon =
            "needsMonitor" in m && (m as (typeof MODULES)[number]).needsMonitor;
          return (
            <button
              key={m.id}
              onClick={() => onSelect(m.id as ModuleId)}
              className={cn(
                "group relative flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-active"
                  className={cn(
                    "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-full",
                    accent.dot,
                  )}
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  isActive ? accent.text : "text-muted-foreground group-hover:text-foreground",
                )}
              />
              <span className="flex-1 text-left">{m.short}</span>
              {needsMon && (
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    monitor ? "bg-emerald-400" : "bg-muted-foreground/40",
                  )}
                  title={monitor ? "monitor mode ready" : "needs monitor mode"}
                />
              )}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-border/70 px-4 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Adapter</span>
          <span className="font-mono text-foreground">
            {selectedIface ?? "—"}
          </span>
        </div>
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Mode</span>
          <span
            className={cn(
              "font-mono",
              monitor ? "text-emerald-400" : "text-amber-400",
            )}
          >
            {iface?.mode ?? "—"}
          </span>
        </div>
      </div>
    </aside>
  );
}
