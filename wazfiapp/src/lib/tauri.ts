/**
 * Thin typed wrapper around the Rust backend commands.
 *
 * wazfi runs natively on a Linux host and talks to the local system (iw,
 * airmon-ng, nmcli, the host package manager, …) through these commands.
 *
 * When opened in a plain browser (e.g. `npm run dev` without the Tauri shell)
 * the invoke bridge is missing, so read calls fall back to representative demo
 * data to keep the UI explorable during design work.
 */

export interface SystemInfo {
  platform: string;
  os_version: string;
  arch: string;
  /** airgeddon can only drive real attacks on Linux */
  attack_capable: boolean;
  airgeddon_path: string | null;
  airgeddon_version: string | null;
  hostname: string;
}

export interface WifiInterface {
  name: string;
  driver: string;
  chipset: string;
  mac: string;
  mode: "managed" | "monitor" | "unknown";
  supports_monitor: boolean;
  up: boolean;
}

export interface ToolStatus {
  name: string;
  installed: boolean;
  category: "essential" | "optional" | "update";
  path: string | null;
}

export interface Network {
  /** stable unique id (BSSID on Linux) */
  id: string;
  bssid: string;
  essid: string;
  channel: number;
  power: number;
  encryption: string;
  wps: boolean;
  clients: number;
  band: "2.4GHz" | "5GHz" | "6GHz";
}

export interface Prereqs {
  os: string;
  /** host package manager for installing tools (apt/pacman/dnf), if any */
  pkg_manager: string | null;
  is_root: boolean;
}

export interface UsbWifi {
  name: string;
  vendor: string;
  vendor_id: string;
  product_id: string;
  chipset: string;
  linux_driver: string;
  usable_here: boolean;
  note: string;
}

type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;

let invokeImpl: InvokeFn | null = null;
let triedLoad = false;

async function getInvoke(): Promise<InvokeFn | null> {
  if (triedLoad) return invokeImpl;
  triedLoad = true;
  try {
    const mod = await import("@tauri-apps/api/core");
    if (mod && typeof mod.invoke === "function" && "__TAURI_INTERNALS__" in window) {
      invokeImpl = mod.invoke as InvokeFn;
    }
  } catch {
    invokeImpl = null;
  }
  return invokeImpl;
}

async function requireInvoke(): Promise<InvokeFn> {
  const invoke = await getInvoke();
  if (!invoke) throw new Error("this action requires the wazfi desktop app on Linux");
  return invoke;
}

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function call<T>(cmd: string, fallback: T, args?: Record<string, unknown>): Promise<T> {
  const invoke = await getInvoke();
  if (!invoke) return fallback;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.warn(`invoke ${cmd} failed, using fallback`, err);
    return fallback;
  }
}

/* ----------------------------- demo datasets ----------------------------- */

const DEMO_INTERFACES: WifiInterface[] = [
  {
    name: "wlan0",
    driver: "ath9k_htc",
    chipset: "Atheros AR9271",
    mac: "00:C0:CA:96:3F:12",
    mode: "managed",
    supports_monitor: true,
    up: true,
  },
  {
    name: "wlan1",
    driver: "88XXau",
    chipset: "Realtek RTL8812AU",
    mac: "7C:DD:90:A1:4B:0E",
    mode: "managed",
    supports_monitor: true,
    up: false,
  },
];

const DEMO_NETWORKS: Network[] = [
  { id: "A4:2B:B0:5E:77:10", bssid: "A4:2B:B0:5E:77:10", essid: "HOME-5G", channel: 36, power: -42, encryption: "WPA2", wps: false, clients: 3, band: "5GHz" },
  { id: "F8:1A:67:2C:91:AA", bssid: "F8:1A:67:2C:91:AA", essid: "Linksys_Guest", channel: 6, power: -58, encryption: "WPA2", wps: true, clients: 1, band: "2.4GHz" },
  { id: "C8:3A:35:00:12:9F", bssid: "C8:3A:35:00:12:9F", essid: "TP-Link_Office", channel: 11, power: -63, encryption: "WPA3", wps: false, clients: 7, band: "2.4GHz" },
  { id: "00:14:22:01:23:45", bssid: "00:14:22:01:23:45", essid: "<hidden>", channel: 1, power: -71, encryption: "WPA2", wps: true, clients: 0, band: "2.4GHz" },
  { id: "DC:A6:32:AB:CD:EF", bssid: "DC:A6:32:AB:CD:EF", essid: "CoffeeShop", channel: 44, power: -49, encryption: "OPN", wps: false, clients: 12, band: "5GHz" },
  { id: "B0:BE:76:11:22:33", bssid: "B0:BE:76:11:22:33", essid: "Enterprise-Corp", channel: 149, power: -66, encryption: "WPA2-EAP", wps: false, clients: 24, band: "5GHz" },
  { id: "E4:95:6E:44:55:66", bssid: "E4:95:6E:44:55:66", essid: "OldRouter", channel: 3, power: -78, encryption: "WEP", wps: false, clients: 1, band: "2.4GHz" },
  { id: "9C:B6:D0:77:88:99", bssid: "9C:B6:D0:77:88:99", essid: "Mesh6E", channel: 37, power: -51, encryption: "WPA3", wps: false, clients: 5, band: "6GHz" },
];

const ESSENTIAL = ["iw", "ip", "awk", "airmon-ng", "airodump-ng", "aircrack-ng", "aireplay-ng", "iwconfig", "ifconfig"];
const OPTIONAL = ["hashcat", "hcxdumptool", "hcxpcapngtool", "reaver", "bully", "mdk4", "hostapd", "dnsmasq", "lighttpd", "bettercap", "beef", "crunch", "wash", "macchanger", "besside-ng", "pyrit", "openssl", "tshark", "hostapd-wpe"];

function demoTools(): ToolStatus[] {
  return [
    ...ESSENTIAL.map((n) => ({ name: n, installed: false, category: "essential" as const, path: null })),
    ...OPTIONAL.map((n) => ({ name: n, installed: false, category: "optional" as const, path: null })),
  ];
}

/* ------------------------------- API calls ------------------------------- */

export function getSystemInfo(): Promise<SystemInfo> {
  return call<SystemInfo>("get_system_info", {
    platform: "browser",
    os_version: "unknown",
    arch: "unknown",
    attack_capable: false,
    airgeddon_path: null,
    airgeddon_version: null,
    hostname: "localhost",
  });
}

export function listInterfaces(): Promise<WifiInterface[]> {
  return call<WifiInterface[]>("list_interfaces", DEMO_INTERFACES);
}

export function checkTools(): Promise<ToolStatus[]> {
  return call<ToolStatus[]>("check_tools", demoTools());
}

/**
 * Real scan via the local Rust backend; any failure is thrown so the caller can
 * show the real reason. In a plain browser it returns demo data.
 */
export async function scanNetworks(iface: string): Promise<Network[]> {
  const invoke = await getInvoke();
  if (!invoke) return DEMO_NETWORKS;
  return invoke<Network[]>("scan_networks", { iface });
}

export function setMonitorMode(iface: string, enable: boolean): Promise<WifiInterface[]> {
  return call<WifiInterface[]>("set_monitor_mode", DEMO_INTERFACES, { iface, enable });
}

export async function detectUsbWifi(): Promise<UsbWifi[]> {
  const invoke = await getInvoke();
  if (!invoke) return [];
  return invoke<UsbWifi[]>("detect_usb_wifi");
}

export async function checkPrereqs(): Promise<Prereqs> {
  const invoke = await getInvoke();
  if (!invoke) return { os: "browser", pkg_manager: null, is_root: false };
  return invoke<Prereqs>("check_prereqs");
}

/** Install airgeddon tools on this Linux host. Streams `install-log` / `install-done`. */
export async function installTools(targets: string[]): Promise<void> {
  const invoke = await requireInvoke();
  await invoke("install_tools", { targets });
}

/* ------------------------------ live attacks ----------------------------- */

/** Launch a single-process attack by kind (DoS / WPS / WEP / PMKID). */
export async function runAttack(
  kind: string,
  iface: string,
  bssid: string,
  channel: number,
  essid: string,
): Promise<void> {
  const invoke = await requireInvoke();
  await invoke("run_attack", { kind, iface, bssid, channel, essid });
}

/** Returns the capture file path. */
export async function startCapture(
  iface: string,
  bssid: string,
  channel: number,
): Promise<string> {
  const invoke = await requireInvoke();
  return invoke<string>("start_capture", { iface, bssid, channel });
}

export async function stopAttack(job: string): Promise<void> {
  const invoke = await requireInvoke();
  await invoke("stop_attack", { job });
}

export async function attackStatus(): Promise<string[]> {
  const invoke = await getInvoke();
  if (!invoke) return [];
  return invoke<string[]>("attack_status");
}

/* -------------------------- captures + wordlists ------------------------- */

export interface CaptureFile {
  name: string;
  path: string;
  size: number;
  modified: number;
  has_handshake: boolean;
}

export async function listCaptures(): Promise<CaptureFile[]> {
  const invoke = await getInvoke();
  if (!invoke) return [];
  return invoke<CaptureFile[]>("list_captures");
}

export async function deleteCapture(path: string): Promise<void> {
  const invoke = await requireInvoke();
  await invoke("delete_capture", { path });
}

export interface WordlistOpts {
  charset: string;
  min: number;
  max: number;
  pattern: string;
  name: string;
}

/** Generate a wordlist with crunch (runs as the "wordlist" job). Returns path. */
export async function generateWordlist(opts: WordlistOpts): Promise<string> {
  const invoke = await requireInvoke();
  return invoke<string>("generate_wordlist", { ...opts });
}

export interface WordlistFile {
  name: string;
  path: string;
  size: number;
}

export async function listWordlists(): Promise<WordlistFile[]> {
  const invoke = await getInvoke();
  if (!invoke) return [];
  return invoke<WordlistFile[]>("list_wordlists");
}

/** Dictionary attack with aircrack-ng (runs as the "crack" job). */
export async function startCrack(cap: string, wordlist: string): Promise<void> {
  const invoke = await requireInvoke();
  await invoke("start_crack", { cap, wordlist });
}

/** Open a native file picker to choose a custom wordlist; returns its path. */
export async function pickWordlist(): Promise<string | null> {
  if (!isTauri()) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const res = await open({
    multiple: false,
    directory: false,
    title: "Choose a wordlist (.txt)",
    filters: [{ name: "Wordlist", extensions: ["txt", "lst", "dic", "gz"] }],
  });
  return typeof res === "string" ? res : null;
}
