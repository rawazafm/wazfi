import { motion } from "framer-motion";
import {
  Cpu,
  HardDrive,
  Package,
  ShieldCheck,
  ShieldAlert,
  Wifi,
  ArrowRight,
  Download,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store";
import { ACCENT_CLASSES, MODULES, type ModuleId } from "@/lib/menu";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
};

export function Dashboard({ onOpen }: { onOpen: (id: ModuleId) => void }) {
  const {
    system,
    tools,
    interfaces,
    installTools,
    installing,
    canInstall,
  } = useApp();

  const essential = tools.filter((t) => t.category === "essential");
  const optional = tools.filter((t) => t.category === "optional");
  const essentialReady = essential.filter((t) => t.installed).length;
  const optionalReady = optional.filter((t) => t.installed).length;
  const readyPct = tools.length
    ? Math.round((tools.filter((t) => t.installed).length / tools.length) * 100)
    : 0;
  const allReady = tools.length > 0 && tools.every((t) => t.installed);

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="space-y-5"
    >
      {/* Hero */}
      <motion.div variants={item}>
        <Card className="relative overflow-hidden">
          <div className="absolute inset-0 grid-overlay opacity-40" />
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-16 right-32 h-48 w-48 rounded-full bg-secondary/20 blur-3xl" />
          <CardContent className="relative flex flex-col gap-6 p-7 md:flex-row md:items-center md:justify-between">
            <div className="max-w-xl">
              <Badge className="mb-3 border-primary/30 bg-primary/10 text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                airgeddon {system?.airgeddon_version ?? "12.02"} engine
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight">
                Wireless auditing,{" "}
                <span className="text-gradient">reimagined</span>
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                A modern control surface for airgeddon. Pick an adapter, scan
                the air, and drive handshake capture, Evil Twin, WPS, WEP and
                Enterprise attacks from one place — with live feedback the
                terminal never gave you.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button onClick={() => onOpen("interface")}>
                  <Wifi className="h-4 w-4" /> Set up adapter
                </Button>
                <Button variant="glass" onClick={() => onOpen("handshake")}>
                  Capture handshake <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="shrink-0">
              <div className="scanline relative grid h-32 w-32 place-items-center overflow-hidden rounded-2xl border border-primary/30 bg-primary/5">
                <Wifi className="h-14 w-14 text-primary/80" />
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Stat row */}
      <div className="grid gap-4 md:grid-cols-3">
        <motion.div variants={item}>
          <StatCard
            icon={<HardDrive className="h-4 w-4" />}
            label="Platform"
            value={system ? `${system.platform}` : "—"}
            sub={system ? `${system.arch} · ${system.os_version}` : ""}
            tone={system?.attack_capable ? "ok" : "warn"}
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            icon={<Wifi className="h-4 w-4" />}
            label="Adapters"
            value={`${interfaces.length}`}
            sub={
              interfaces.filter((i) => i.supports_monitor).length +
              " monitor-capable"
            }
            tone="info"
          />
        </motion.div>
        <motion.div variants={item}>
          <StatCard
            icon={<Package className="h-4 w-4" />}
            label="Tooling"
            value={`${readyPct}%`}
            sub={`${essentialReady}/${essential.length} essential · ${optionalReady}/${optional.length} optional`}
            tone={essentialReady === essential.length ? "ok" : "warn"}
          />
        </motion.div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        {/* Modules grid */}
        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" /> Attack Modules
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {MODULES.filter((m) => m.id !== "interface").map((m) => {
                const accent = ACCENT_CLASSES[m.accent];
                const Icon = m.icon;
                return (
                  <button
                    key={m.id}
                    onClick={() => onOpen(m.id)}
                    className={cn(
                      "glass-hover group flex items-start gap-3 rounded-lg border border-border/60 p-3 text-left",
                    )}
                  >
                    <div
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
                        accent.bg,
                        accent.border,
                      )}
                    >
                      <Icon className={cn("h-4 w-4", accent.text)} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {m.short}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {m.tagline}
                      </div>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>
        </motion.div>

        {/* Tool readiness */}
        <motion.div variants={item}>
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2">
                  {system?.attack_capable ? (
                    <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  ) : (
                    <ShieldAlert className="h-4 w-4 text-amber-400" />
                  )}
                  Environment
                </CardTitle>
                <Button
                  size="sm"
                  variant={allReady ? "glass" : "default"}
                  onClick={installTools}
                  disabled={installing || allReady || !canInstall}
                  title={
                    canInstall
                      ? "Install missing tools on this Linux host"
                      : "No package manager found — run wazfi on a Linux host"
                  }
                >
                  {installing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5" />
                  )}
                  {installing
                    ? "Installing"
                    : allReady
                      ? "All installed"
                      : "Install tools"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {!canInstall && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                  No Linux package manager detected. wazfi is meant to run on a
                  Linux host (Kali, Parrot, …) where the tools and wireless
                  adapter live — see <span className="font-mono">linux/PARROT-UTM.md</span>.
                </div>
              )}
              {!system?.attack_capable && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                  Live attacks need a Linux host with the aircrack-ng suite and a
                  monitor-mode adapter. On this machine wazfi runs in preview
                  mode: the full UI and flows work with representative data.
                </div>
              )}
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Essential tools</span>
                  <span className="font-mono">
                    {essentialReady}/{essential.length}
                  </span>
                </div>
                <Progress
                  value={
                    essential.length
                      ? (essentialReady / essential.length) * 100
                      : 0
                  }
                  indicatorClassName="bg-emerald-400"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Optional tools</span>
                  <span className="font-mono">
                    {optionalReady}/{optional.length}
                  </span>
                </div>
                <Progress
                  value={
                    optional.length ? (optionalReady / optional.length) * 100 : 0
                  }
                  indicatorClassName="bg-violet-400"
                />
              </div>
              <Separatorish />
              <div className="flex flex-wrap gap-1.5">
                {tools.slice(0, 18).map((t) => (
                  <span
                    key={t.name}
                    className={cn(
                      "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                      t.installed
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                        : "border-border bg-muted/40 text-muted-foreground line-through",
                    )}
                  >
                    {t.name}
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function Separatorish() {
  return <div className="h-px w-full bg-border/60" />;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "ok" | "warn" | "info";
}) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : "text-cyan-400";
  return (
    <Card className="glass-hover">
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            "grid h-11 w-11 place-items-center rounded-xl border border-border/60 bg-muted/40",
            toneClass,
          )}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </div>
          <div className="truncate text-xl font-bold">{value}</div>
          <div className="truncate text-[11px] text-muted-foreground">{sub}</div>
        </div>
      </CardContent>
    </Card>
  );
}
