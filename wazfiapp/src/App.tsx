import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Radar, Search } from "lucide-react";
import { AppProvider, useApp } from "@/store";
import { MODULES, type ModuleId } from "@/lib/menu";
import { Sidebar } from "@/components/layout/Sidebar";
import { StatusBar } from "@/components/layout/StatusBar";
import { Dashboard } from "@/components/panels/Dashboard";
import { InterfacePanel } from "@/components/panels/InterfacePanel";
import { ModulePanel } from "@/components/panels/ModulePanel";
import { Badge } from "@/components/ui/badge";

function Boot() {
  return (
    <div className="app-canvas flex h-full w-full flex-col items-center justify-center gap-5">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="relative grid h-20 w-20 place-items-center rounded-2xl bg-primary/15 neon-ring"
      >
        <Radar className="h-10 w-10 text-primary" />
        <span className="absolute inset-0 rounded-2xl pulse-ring" />
      </motion.div>
      <div className="text-center">
        <div className="text-2xl font-bold text-gradient">wazfi</div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          probing environment…
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const { booting, system } = useApp();
  const [active, setActive] = React.useState<ModuleId>("dashboard");

  if (booting) return <Boot />;

  const activeModule = MODULES.find((m) => m.id === active);
  const title =
    active === "dashboard"
      ? "Dashboard"
      : (activeModule?.label ?? "Interface Control");

  return (
    <div className="app-canvas flex h-full w-full overflow-hidden">
      <Sidebar active={active} onSelect={setActive} />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-6">
          <div className="flex items-center gap-3">
            <h1 className="text-sm font-semibold tracking-wide text-muted-foreground">
              {title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <Search className="h-3.5 w-3.5" />
              <span className="font-mono">
                {system?.hostname ?? "localhost"}
              </span>
            </div>
            <Badge
              className={
                system?.attack_capable
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/30 bg-amber-500/10 text-amber-300"
              }
            >
              <span
                className={
                  system?.attack_capable
                    ? "h-1.5 w-1.5 rounded-full bg-emerald-400"
                    : "h-1.5 w-1.5 rounded-full bg-amber-400"
                }
              />
              {system?.attack_capable ? "LIVE" : "PREVIEW"}
            </Badge>
          </div>
        </header>

        {/* Content */}
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {active === "dashboard" && <Dashboard onOpen={setActive} />}
              {active === "interface" && <InterfacePanel />}
              {activeModule && activeModule.id !== "interface" && (
                <ModulePanel module={activeModule} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        <StatusBar />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  );
}
