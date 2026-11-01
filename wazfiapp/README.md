# wazfi — Wireless Audit Suite

A modern desktop GUI for [airgeddon](https://github.com/v1s1t0r1sh3r3/airgeddon),
built with **Tauri 2 + React 19 + Tailwind v4** and a hand-built, shadcn-style
component system. It turns airgeddon's text menus into a visual control surface:
pick an adapter, scan the air, and drive each attack module with live feedback.

> **Legal:** only test networks you own or are explicitly authorized to assess.
> Unauthorized wireless attacks are illegal in most jurisdictions.

## Stack

| Layer      | Tech                                                        |
| ---------- | ----------------------------------------------------------- |
| Shell      | Tauri 2 (Rust)                                              |
| UI         | React 19, Vite 8, TypeScript                                |
| Styling    | Tailwind CSS v4, custom "cyber" design system              |
| Components | hand-built shadcn-style primitives (`src/components/ui`)    |
| Motion     | framer-motion                                               |
| Icons      | lucide-react                                                |

## Architecture

```
src/
  lib/
    menu.ts        ← airgeddon 12.02 menu tree as typed data (drives the UI)
    tauri.ts       ← typed bridge to Rust commands, with demo fallback
    utils.ts       ← cn() + helpers
  store.tsx        ← app state (interface, monitor mode, scan, logs) via context
  components/
    ui/            ← Button, Card, Badge, Input, Progress, Switch, Separator
    layout/        ← Sidebar, StatusBar
    panels/        ← Dashboard, InterfacePanel, ModulePanel
    Console.tsx    ← live log view
    NetworkTable.tsx ← animated scan results + target selection
  App.tsx          ← shell: sidebar + topbar + routed panels + status bar

src-tauri/src/lib.rs
    get_system_info   ← OS, arch, hostname, airgeddon detection
    list_interfaces   ← real Wi-Fi adapters (Linux: iw; macOS dev: networksetup)
    check_tools       ← which() probe of the aircrack-ng suite + optional tools
    set_monitor_mode  ← airmon-ng start/stop
    scan_networks     ← real scan (Linux: nmcli / iw)
    detect_usb_wifi   ← identify attached USB adapters + their Linux driver
    check_prereqs     ← host package manager + root status
    install_tools     ← install missing tools via apt/pacman/dnf (streamed)

linux/
    host-setup.sh     ← install USB Wi-Fi drivers (e.g. RTL8812AU) on the host
    PARROT-UTM.md     ← run wazfi in a Parrot VM on Apple Silicon
```

The UI is **data-driven**: every module and action in `src/lib/menu.ts` maps 1:1
to a real airgeddon routine (DoS, Handshake/PMKID, Offline decrypt, Evil Twin,
WPS, WEP, Enterprise, WPA3), including the tools each one needs.

## A native Linux app

wazfi runs **on the Linux host** that has the wireless adapter — a Linux laptop,
a Raspberry Pi, or a Linux VM (see [`linux/PARROT-UTM.md`](./linux/PARROT-UTM.md)
for Parrot in UTM on Apple Silicon). It talks straight to the local system
(`iw`, `airmon-ng`, `nmcli`, the host package manager). There is no Docker and no
remote agent.

- **On Linux:** real interfaces, real tool status, real monitor-mode toggling,
  real scans, and local tool installation.
- **On macOS/Windows (dev only):** the UI runs in preview mode against sample
  data so you can work on it; live attacks need Linux.

The badge in the top-right and the status bar show which mode is active.

### Installing tools

The Dashboard's **Install tools** button installs any missing airgeddon tools on
the local host via its package manager (`apt`/`pacman`/`dnf`), streaming output
to the console. Run wazfi as root (or it uses `sudo -n`) so the installer can
write.

### USB Wi-Fi adapters

The Interface panel identifies attached USB adapters and their Linux driver. Most
chipsets (Atheros AR9271, Ralink, MediaTek) are in-kernel; Realtek RTL8812AU/8814AU
need an out-of-tree driver. Build it with:

```bash
sudo ./linux/host-setup.sh
```

## Develop

```bash
npm install
npm run tauri dev      # launches the desktop app (Rust + web)
npm run dev            # web only, in a browser (preview mode)
```

## Build

```bash
npm run tauri build    # produces a native bundle in src-tauri/target/release
```

## Network scanning (real)

The **Scan** button performs a real scan of nearby Wi-Fi:

- **macOS** — `system_profiler SPAirPortDataType`. Returns real channel, band,
  security and signal for every nearby AP. macOS **redacts SSIDs and omits
  BSSIDs** unless the app holds Location Services permission, so those show as
  `<hidden>` / `n/a (macOS)` — this is an OS restriction, not a bug.
- **Linux** — `nmcli device wifi list` (no root; real SSID/BSSID/signal/security),
  falling back to `iw dev <iface> scan`.

Parsing is covered by unit tests (`cargo test`), plus a live smoke test against
the real adapter (`cargo test live_scan_smoke -- --ignored --nocapture`).

## Roadmap

- Stream real `airodump-ng` captures into `NetworkTable` via Tauri events (needs
  monitor mode + root on Linux) for BSSID-level detail and client counts
- Wire each action to an interactive airgeddon subprocess with live stdout
- Capture-file manager (handshakes / PMKID / hashes)
- Wordlist & hashcat job manager
```
