import * as React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Crosshair, Play, Square, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ACCENT_CLASSES,
  LEVEL_META,
  type AppModule,
  type AttackAction,
} from "@/lib/menu";
import { useApp } from "@/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NetworkTable } from "@/components/NetworkTable";
import { Console } from "@/components/Console";
import { CapturesList } from "@/components/CapturesList";
import { WordlistGenerator } from "@/components/WordlistGenerator";

export function ModulePanel({ module }: { module: AppModule }) {
  const {
    interfaces,
    selectedIface,
    selectedId,
    networks,
    tools,
    log,
    attacks,
    launchDeauth,
    launchCapture,
    stopAttack,
  } = useApp();
  const [running, setRunning] = React.useState<string | null>(null);

  const accent = ACCENT_CLASSES[module.accent];
  const iface = interfaces.find((i) => i.name === selectedIface);
  const monitorOk = !module.needsMonitor || iface?.mode === "monitor";
  const target = networks.find((n) => n.id === selectedId);
  const needsTarget = module.id !== "decrypt";

  const installed = new Set(tools.filter((t) => t.installed).map((t) => t.name));

  // Actions wired to real execution (the rest are previews for now).
  function implementedJob(action: AttackAction): "deauth" | "capture" | null {
    const key = `${module.id}:${action.id}`;
    if (key === "dos:deauth_aireplay") return "deauth";
    if (key === "handshake:capture_handshake") return "capture";
    return null;
  }

  function launch(action: AttackAction) {
    const job = implementedJob(action);

    if (needsTarget && !target) {
      log("err", `${module.label}: select a target network first`);
      return;
    }

    if (job) {
      // Real execution — the backend puts the adapter into monitor mode itself.
      if (!selectedIface) {
        log("err", "select an interface first");
        return;
      }
      if (job === "deauth") {
        void launchDeauth(selectedIface, target!.bssid, target!.channel);
      } else {
        void launchCapture(selectedIface, target!.bssid, target!.channel);
      }
      return;
    }

    // Preview (not yet wired to real execution).
    if (module.needsMonitor && !monitorOk) {
      log("err", `${module.label}: adapter not in monitor mode`);
      return;
    }
    setRunning(action.id);
    log("cmd", buildCommand(module, action, selectedIface, target?.bssid));
    const missing = action.requires.filter((r) => !installed.has(r));
    window.setTimeout(() => {
      if (missing.length) {
        log("warn", `missing tools: ${missing.join(", ")} — install to run`);
      }
      log("warn", `${action.title}: preview only — not wired to real execution yet`);
      setRunning(null);
    }, 900);
  }

  const Icon = module.icon;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center rounded-xl border",
              accent.bg,
              accent.border,
            )}
          >
            <Icon className={cn("h-6 w-6", accent.text)} />
          </div>
          <div className="max-w-2xl">
            <h2 className="text-xl font-bold tracking-tight">{module.label}</h2>
            <p className="text-sm text-muted-foreground">{module.description}</p>
          </div>
        </div>
        {module.needsMonitor && (
          <Badge
            className={cn(
              monitorOk
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-amber-500/30 bg-amber-500/10 text-amber-300",
            )}
          >
            {monitorOk ? "monitor ready" : "needs monitor mode"}
          </Badge>
        )}
      </div>

      {/* Preconditions */}
      {module.needsMonitor && !monitorOk && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This module needs {selectedIface ?? "an adapter"} in monitor mode. Go
          to Interface Control and enable it.
        </div>
      )}

      <div
        className={cn(
          "grid gap-5",
          needsTarget ? "xl:grid-cols-[1fr_1.1fr]" : "xl:grid-cols-1",
        )}
      >
        {/* Target column */}
        {needsTarget && (
          <div className="min-h-[360px]">
            <NetworkTable />
          </div>
        )}

        {/* Actions + console */}
        <div className="flex flex-col gap-5">
          {needsTarget && (
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Crosshair
                  className={cn(
                    "h-5 w-5",
                    target ? accent.text : "text-muted-foreground",
                  )}
                />
                {target ? (
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{target.essid}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {target.bssid} · ch {target.channel} · {target.encryption}
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    No target selected — pick one from the list.
                  </span>
                )}
              </CardContent>
            </Card>
          )}

          {module.id === "decrypt" && <WordlistGenerator />}
          {(module.id === "handshake" || module.id === "decrypt") && (
            <CapturesList />
          )}

          <div className="grid gap-3">
            {module.actions.map((action, idx) => {
              const missing = action.requires.filter((r) => !installed.has(r));
              const level = LEVEL_META[action.level];
              const job = implementedJob(action);
              const liveRunning = job ? attacks.includes(job) : false;
              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                >
                  <Card className="glass-hover">
                    <CardContent className="flex items-center gap-4 p-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{action.title}</span>
                          <Badge className={cn("text-[10px]", level.className)}>
                            {level.label}
                          </Badge>
                          {job && (
                            <Badge className="border-primary/30 bg-primary/10 text-[10px] text-primary">
                              live
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {action.description}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          <Terminal className="h-3 w-3 text-muted-foreground" />
                          {action.requires.map((r) => (
                            <span
                              key={r}
                              className={cn(
                                "rounded border px-1 py-0.5 font-mono text-[9px]",
                                installed.has(r)
                                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                                  : "border-border bg-muted/40 text-muted-foreground",
                              )}
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>
                      {liveRunning ? (
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => job && stopAttack(job)}
                        >
                          <Square className="h-3.5 w-3.5" />
                          Stop
                        </Button>
                      ) : (
                        <Button
                          variant={missing.length ? "glass" : "default"}
                          size="sm"
                          disabled={running === action.id}
                          onClick={() => launch(action)}
                        >
                          <Play
                            className={cn(
                              "h-3.5 w-3.5",
                              running === action.id && "animate-pulse",
                            )}
                          />
                          {running === action.id ? "…" : "Launch"}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>

          <Console className="h-56" />
        </div>
      </div>
    </div>
  );
}

function buildCommand(
  module: AppModule,
  action: AttackAction,
  iface: string | null,
  bssid?: string,
): string {
  const i = iface ?? "wlan0mon";
  const b = bssid ?? "<bssid>";
  switch (`${module.id}:${action.id}`) {
    case "dos:deauth_aireplay":
      return `aireplay-ng --deauth 0 -a ${b} ${i}`;
    case "dos:deauth_mdk4":
      return `mdk4 ${i} d -B ${b}`;
    case "dos:beacon":
      return `mdk4 ${i} b -n fake_ap`;
    case "handshake:capture_handshake":
      return `airodump-ng -c <ch> --bssid ${b} -w handshake ${i}`;
    case "handshake:capture_pmkid":
      return `hcxdumptool -i ${i} --enable_status=1 -o pmkid.pcapng`;
    case "decrypt:dict_aircrack":
      return `aircrack-ng -w wordlist.txt -b ${b} handshake-01.cap`;
    case "decrypt:dict_hashcat":
      return `hashcat -m 22000 pmkid.hc22000 wordlist.txt`;
    case "wps:scan":
      return `wash -i ${i}`;
    case "wps:pixie":
      return `reaver -i ${i} -b ${b} -K 1 -vv`;
    case "wps:bruteforce":
      return `reaver -i ${i} -b ${b} -vv`;
    case "wep:allinone":
      return `aireplay-ng --arpreplay -b ${b} ${i} && aircrack-ng wep-01.cap`;
    case "wep:besside":
      return `besside-ng -b ${b} ${i}`;
    case "eviltwin:captive":
      return `hostapd + dnsmasq + lighttpd captive portal on ${i}`;
    case "enterprise:smooth":
      return `hostapd-wpe rogue AP on ${i}`;
    case "wpa3:downgrade":
      return `hcxdumptool -i ${i} --filterlist_ap=${b} (WPA2 downgrade)`;
    default:
      return `airgeddon → ${module.label} → ${action.title}`;
  }
}
