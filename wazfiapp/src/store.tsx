import * as React from "react";
import {
  checkPrereqs,
  checkTools,
  detectUsbWifi,
  getSystemInfo,
  installTools as installToolsCmd,
  listInterfaces,
  scanNetworks,
  setMonitorMode,
  isTauri,
  type Network,
  type Prereqs,
  type SystemInfo,
  type ToolStatus,
  type UsbWifi,
  type WifiInterface,
} from "@/lib/tauri";

export interface LogLine {
  id: number;
  ts: string;
  level: "info" | "ok" | "warn" | "err" | "cmd";
  text: string;
}

interface AppState {
  system: SystemInfo | null;
  tools: ToolStatus[];
  interfaces: WifiInterface[];
  selectedIface: string | null;
  networks: Network[];
  selectedId: string | null;
  scanning: boolean;
  logs: LogLine[];
  booting: boolean;

  /** host prerequisites + USB adapters + tool installation */
  prereqs: Prereqs | null;
  usbWifi: UsbWifi[];
  installing: boolean;
  canInstall: boolean;

  selectIface: (name: string) => void;
  selectTarget: (id: string | null) => void;
  toggleMonitor: (name: string) => Promise<void>;
  runScan: () => Promise<void>;
  log: (level: LogLine["level"], text: string) => void;
  refresh: () => Promise<void>;
  installTools: () => Promise<void>;
}

const Ctx = React.createContext<AppState | null>(null);

let logCounter = 0;

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [system, setSystem] = React.useState<SystemInfo | null>(null);
  const [tools, setTools] = React.useState<ToolStatus[]>([]);
  const [interfaces, setInterfaces] = React.useState<WifiInterface[]>([]);
  const [selectedIface, setSelectedIface] = React.useState<string | null>(null);
  const [networks, setNetworks] = React.useState<Network[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [logs, setLogs] = React.useState<LogLine[]>([]);
  const [booting, setBooting] = React.useState(true);
  const [prereqs, setPrereqs] = React.useState<Prereqs | null>(null);
  const [usbWifi, setUsbWifi] = React.useState<UsbWifi[]>([]);
  const [installing, setInstalling] = React.useState(false);

  const log = React.useCallback((level: LogLine["level"], text: string) => {
    const ts = new Date().toLocaleTimeString("en-GB");
    setLogs((prev) => [
      ...prev.slice(-400),
      { id: ++logCounter, ts, level, text },
    ]);
  }, []);

  const refresh = React.useCallback(async () => {
    const [sys, tls, ifs, usb] = await Promise.all([
      getSystemInfo(),
      checkTools(),
      listInterfaces(),
      detectUsbWifi(),
    ]);
    setSystem(sys);
    setTools(tls);
    setInterfaces(ifs);
    setUsbWifi(usb);
    setSelectedIface((cur) => cur ?? ifs[0]?.name ?? null);
  }, []);

  React.useEffect(() => {
    (async () => {
      log("info", "wazfi initializing…");
      try {
        setPrereqs(await checkPrereqs());
      } catch {
        /* ignore */
      }
      await refresh();
      setBooting(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    if (!system) return;
    log("info", `host ${system.hostname} · ${system.platform} ${system.arch}`);
    if (system.attack_capable) {
      log(
        "ok",
        `airgeddon ${system.airgeddon_version ?? "?"} ${system.airgeddon_path ? `at ${system.airgeddon_path}` : "engine ready"}`,
      );
    } else {
      log(
        "warn",
        "wazfi is built for a Linux host — running here in preview mode with sample data",
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [system]);

  // Stream local tool-install output; finish on install-done.
  React.useEffect(() => {
    if (!isTauri()) return;
    let offLog: (() => void) | undefined;
    let offDone: (() => void) | undefined;
    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      offLog = await listen<{ level: string; line: string }>("install-log", (e) => {
        const { level, line } = e.payload;
        if (!line?.trim()) return;
        const lvl: LogLine["level"] =
          level === "err"
            ? "warn"
            : level === "cmd"
              ? "cmd"
              : level === "ok"
                ? "ok"
                : level === "warn"
                  ? "warn"
                  : "info";
        log(lvl, line);
      });
      offDone = await listen<{ ok: boolean }>("install-done", async (e) => {
        setInstalling(false);
        log(e.payload.ok ? "ok" : "warn", "tool install finished");
        const [tls, sys] = await Promise.all([checkTools(), getSystemInfo()]);
        setTools(tls);
        setSystem(sys);
      });
    })();
    return () => {
      offLog?.();
      offDone?.();
    };
  }, [log]);

  const selectIface = React.useCallback(
    (name: string) => {
      setSelectedIface(name);
      log("info", `selected interface ${name}`);
    },
    [log],
  );

  const selectTarget = React.useCallback(
    (id: string | null) => {
      setSelectedId(id);
      if (id) log("info", `target locked ${id}`);
    },
    [log],
  );

  const toggleMonitor = React.useCallback(
    async (name: string) => {
      const iface = interfaces.find((i) => i.name === name);
      const enable = iface?.mode !== "monitor";
      log("cmd", `airmon-ng ${enable ? "start" : "stop"} ${name}`);
      try {
        const updated = await setMonitorMode(name, enable);
        if (updated && updated.length) {
          setInterfaces(
            updated.map((i) =>
              i.name === name ? { ...i, mode: enable ? "monitor" : "managed" } : i,
            ),
          );
        } else {
          setInterfaces((prev) =>
            prev.map((i) =>
              i.name === name ? { ...i, mode: enable ? "monitor" : "managed" } : i,
            ),
          );
        }
        log(
          "ok",
          `${name} now in ${enable ? "monitor" : "managed"} mode`,
        );
      } catch (e) {
        log("err", `monitor toggle failed: ${String(e)}`);
      }
    },
    [interfaces, log],
  );

  const runScan = React.useCallback(async () => {
    if (!selectedIface) {
      log("err", "no interface selected");
      return;
    }
    setScanning(true);
    setNetworks([]);
    setSelectedId(null);
    log("cmd", `scanning on ${selectedIface}…`);
    try {
      const found = await scanNetworks(selectedIface);
      for (let i = 0; i < found.length; i++) {
        await new Promise((r) => setTimeout(r, 120));
        setNetworks((prev) => [...prev, found[i]]);
      }
      log(
        found.length ? "ok" : "warn",
        found.length
          ? `scan complete — ${found.length} networks discovered`
          : "scan returned no networks",
      );
    } catch (e) {
      log("err", `scan failed: ${String(e)}`);
    } finally {
      setScanning(false);
    }
  }, [selectedIface, log]);

  const installTools = React.useCallback(async () => {
    if (!prereqs?.pkg_manager) {
      log("err", "no package manager found — wazfi must run on a Linux host (apt/pacman/dnf)");
      return;
    }
    const missing = tools.filter((t) => !t.installed).map((t) => t.name);
    if (missing.length === 0) {
      log("ok", "all tracked tools already installed");
      return;
    }
    setInstalling(true);
    log("cmd", `installing ${missing.length} missing tool(s) via ${prereqs.pkg_manager}`);
    if (!prereqs.is_root) {
      log("warn", "not running as root — install uses sudo -n (run wazfi with sudo if it fails)");
    }
    try {
      await installToolsCmd(missing);
      // completion handled by the install-done listener
    } catch (e) {
      setInstalling(false);
      log("err", `install failed: ${String(e)}`);
    }
  }, [tools, prereqs, log]);

  const value: AppState = {
    system,
    tools,
    interfaces,
    selectedIface,
    networks,
    selectedId,
    scanning,
    logs,
    booting,
    prereqs,
    usbWifi,
    installing,
    canInstall: !!prereqs?.pkg_manager,
    selectIface,
    selectTarget,
    toggleMonitor,
    runScan,
    log,
    refresh,
    installTools,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
