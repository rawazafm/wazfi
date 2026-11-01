import {
  Radar,
  Wifi,
  ShieldAlert,
  KeyRound,
  Unlock,
  Users,
  Fingerprint,
  Lock,
  Building2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export type ModuleId =
  | "dashboard"
  | "interface"
  | "dos"
  | "handshake"
  | "decrypt"
  | "eviltwin"
  | "wps"
  | "wep"
  | "enterprise"
  | "wpa3";

export interface AttackAction {
  id: string;
  title: string;
  description: string;
  /** tools airgeddon needs for this action */
  requires: string[];
  /** risk/noise level shown as a badge */
  level: "passive" | "active" | "aggressive";
}

export interface AppModule {
  id: ModuleId;
  label: string;
  short: string;
  icon: LucideIcon;
  /** one-line summary for cards */
  tagline: string;
  description: string;
  /** accent group used for theming the module */
  accent: "cyan" | "violet" | "red" | "amber" | "green";
  /** whether this module needs an interface in monitor mode */
  needsMonitor: boolean;
  actions: AttackAction[];
}

/**
 * Mirrors the real airgeddon 12.02 menu tree so the GUI maps 1:1 to the
 * underlying tool. Each action corresponds to a concrete airgeddon routine.
 */
export const MODULES: AppModule[] = [
  {
    id: "interface",
    label: "Interface Control",
    short: "Interface",
    icon: Wifi,
    tagline: "Select adapter, toggle monitor mode, manage MAC",
    description:
      "Choose the wireless adapter to work with and switch it between managed and monitor mode. This is the starting point for every attack module.",
    accent: "cyan",
    needsMonitor: false,
    actions: [
      {
        id: "select",
        title: "Select interface",
        description: "Pick the wireless card to use for this session.",
        requires: ["iw", "ip"],
        level: "passive",
      },
      {
        id: "monitor",
        title: "Enable monitor mode",
        description: "Put the adapter into monitor mode (airmon-ng).",
        requires: ["airmon-ng"],
        level: "passive",
      },
      {
        id: "managed",
        title: "Return to managed mode",
        description: "Restore normal managed mode for the adapter.",
        requires: ["airmon-ng"],
        level: "passive",
      },
      {
        id: "mac",
        title: "Change MAC (spoof)",
        description: "Randomize or set the adapter's MAC address.",
        requires: ["macchanger"],
        level: "active",
      },
    ],
  },
  {
    id: "dos",
    label: "DoS Attacks",
    short: "DoS",
    icon: ShieldAlert,
    tagline: "Deauth, beacon flood, WIDS confusion",
    description:
      "Denial-of-service techniques against a target AP or clients. Used to force reconnections for handshake capture or to validate resilience.",
    accent: "red",
    needsMonitor: true,
    actions: [
      {
        id: "deauth_aireplay",
        title: "Deauth / disassoc (aireplay)",
        description: "Classic 802.11 deauthentication flood via aireplay-ng.",
        requires: ["aireplay-ng"],
        level: "aggressive",
      },
      {
        id: "deauth_mdk4",
        title: "Deauth (mdk4)",
        description: "Deauthentication amplification attack using mdk4.",
        requires: ["mdk4"],
        level: "aggressive",
      },
      {
        id: "wids",
        title: "WIDS / WIPS / WDS confusion",
        description: "Confuse wireless intrusion detection systems (mdk4).",
        requires: ["mdk4"],
        level: "aggressive",
      },
      {
        id: "beacon",
        title: "Beacon flood",
        description: "Flood the air with fake beacon frames (mdk4).",
        requires: ["mdk4"],
        level: "aggressive",
      },
      {
        id: "michael",
        title: "Michael shutdown exploitation (TKIP)",
        description: "TKIP countermeasure exploitation (mdk4).",
        requires: ["mdk4"],
        level: "aggressive",
      },
    ],
  },
  {
    id: "handshake",
    label: "Handshake / PMKID Tools",
    short: "Handshake",
    icon: KeyRound,
    tagline: "Capture, clean and decloak captures",
    description:
      "Capture WPA/WPA2 4-way handshakes and PMKID hashes, then clean and verify capture files for offline cracking.",
    accent: "cyan",
    needsMonitor: true,
    actions: [
      {
        id: "capture_handshake",
        title: "Capture handshake",
        description: "Scan targets, deauth and capture a 4-way handshake.",
        requires: ["airodump-ng", "aireplay-ng"],
        level: "active",
      },
      {
        id: "capture_pmkid",
        title: "Capture PMKID",
        description: "Grab the PMKID from the first EAPOL frame (hcxdumptool).",
        requires: ["hcxdumptool"],
        level: "active",
      },
      {
        id: "clean",
        title: "Clean / optimize capture",
        description: "Strip and validate a capture file for cracking.",
        requires: ["pyrit", "tshark"],
        level: "passive",
      },
      {
        id: "decloak",
        title: "Decloak hidden ESSID",
        description: "Reveal a cloaked network name via capture analysis.",
        requires: ["airodump-ng"],
        level: "active",
      },
    ],
  },
  {
    id: "decrypt",
    label: "Offline Decrypt",
    short: "Decrypt",
    icon: Unlock,
    tagline: "Dictionary, brute-force & hashcat cracking",
    description:
      "Offline password recovery against captured handshakes/PMKID using aircrack-ng, hashcat (GPU) and crunch-generated wordlists.",
    accent: "violet",
    needsMonitor: false,
    actions: [
      {
        id: "dict_aircrack",
        title: "Dictionary attack (aircrack)",
        description: "Run a wordlist against a handshake/PMKID with aircrack-ng.",
        requires: ["aircrack-ng"],
        level: "passive",
      },
      {
        id: "bruteforce_aircrack",
        title: "Brute-force (aircrack + crunch)",
        description: "Mask-based brute force using crunch piped to aircrack-ng.",
        requires: ["aircrack-ng", "crunch"],
        level: "passive",
      },
      {
        id: "dict_hashcat",
        title: "Dictionary attack (hashcat)",
        description: "GPU-accelerated wordlist attack (mode 22000).",
        requires: ["hashcat"],
        level: "passive",
      },
      {
        id: "rule_hashcat",
        title: "Rule-based attack (hashcat)",
        description: "Apply hashcat rules on top of a wordlist.",
        requires: ["hashcat"],
        level: "passive",
      },
      {
        id: "bruteforce_hashcat",
        title: "Brute-force (hashcat)",
        description: "Mask brute force on the GPU.",
        requires: ["hashcat"],
        level: "passive",
      },
    ],
  },
  {
    id: "eviltwin",
    label: "Evil Twin",
    short: "Evil Twin",
    icon: Users,
    tagline: "Rogue AP, captive portal, sniffing, BeEF",
    description:
      "Stand up a rogue access point to capture credentials via a captive portal, sniff traffic, inject with sslstrip, or hook browsers with BeEF.",
    accent: "amber",
    needsMonitor: true,
    actions: [
      {
        id: "ap_only",
        title: "Rogue AP only (open)",
        description: "Bare rogue AP with no extra tooling.",
        requires: ["hostapd", "dnsmasq"],
        level: "aggressive",
      },
      {
        id: "sniff",
        title: "AP + sniffing",
        description: "Rogue AP with traffic sniffing (bettercap).",
        requires: ["hostapd", "dnsmasq", "bettercap"],
        level: "aggressive",
      },
      {
        id: "sslstrip",
        title: "AP + sniffing + sslstrip2",
        description: "Rogue AP, sniffing and HTTPS downgrade.",
        requires: ["hostapd", "dnsmasq", "bettercap"],
        level: "aggressive",
      },
      {
        id: "captive",
        title: "Captive portal (credential phishing)",
        description: "Rogue AP with a captive portal to harvest the WPA key.",
        requires: ["hostapd", "dnsmasq", "lighttpd"],
        level: "aggressive",
      },
      {
        id: "beef",
        title: "AP + BeEF browser hooking",
        description: "Rogue AP that injects the BeEF hook into pages.",
        requires: ["hostapd", "dnsmasq", "beef"],
        level: "aggressive",
      },
    ],
  },
  {
    id: "wps",
    label: "WPS Attacks",
    short: "WPS",
    icon: Fingerprint,
    tagline: "Pixie-dust, PIN brute force, PIN database",
    description:
      "Attack the WiFi Protected Setup feature: scan for WPS-enabled APs, run Pixie-Dust, brute force PINs, or try known-PIN databases.",
    accent: "violet",
    needsMonitor: true,
    actions: [
      {
        id: "scan",
        title: "Scan for WPS targets",
        description: "Enumerate WPS-enabled access points (wash).",
        requires: ["wash"],
        level: "passive",
      },
      {
        id: "pixie",
        title: "Pixie-Dust attack",
        description: "Offline PIN recovery via Pixie-Dust (reaver/bully).",
        requires: ["reaver"],
        level: "active",
      },
      {
        id: "bruteforce",
        title: "PIN brute force",
        description: "Online WPS PIN brute force (reaver/bully).",
        requires: ["reaver"],
        level: "aggressive",
      },
      {
        id: "custompin",
        title: "Custom PIN association",
        description: "Attempt a specific PIN against the AP.",
        requires: ["reaver"],
        level: "active",
      },
      {
        id: "pindb",
        title: "Known PIN database",
        description: "Try PINs from algorithm/known databases.",
        requires: ["reaver"],
        level: "active",
      },
      {
        id: "nullpin",
        title: "Null PIN attack",
        description: "Exploit APs that accept an empty PIN (reaver).",
        requires: ["reaver"],
        level: "active",
      },
    ],
  },
  {
    id: "wep",
    label: "WEP Attacks",
    short: "WEP",
    icon: Lock,
    tagline: "All-in-one & Besside automated WEP crack",
    description:
      "Legacy WEP cracking. The all-in-one flow chains fake auth, ARP replay and aircrack; Besside automates the whole capture-and-crack cycle.",
    accent: "amber",
    needsMonitor: true,
    actions: [
      {
        id: "allinone",
        title: "All-in-one WEP attack",
        description: "Fake auth + ARP replay + chopchop + aircrack-ng.",
        requires: ["aireplay-ng", "aircrack-ng"],
        level: "aggressive",
      },
      {
        id: "besside",
        title: "Besside-ng automated",
        description: "Fully automated WEP cracking with besside-ng.",
        requires: ["besside-ng"],
        level: "aggressive",
      },
    ],
  },
  {
    id: "enterprise",
    label: "Enterprise Attacks",
    short: "Enterprise",
    icon: Building2,
    tagline: "WPA-Enterprise rogue AP & credential capture",
    description:
      "Target WPA/WPA2-Enterprise (802.1X) networks with a rogue RADIUS/AP to capture challenge-response hashes and analyze identities and certificates.",
    accent: "violet",
    needsMonitor: true,
    actions: [
      {
        id: "smooth",
        title: "Smooth mode rogue AP",
        description: "Rogue enterprise AP with auto certificates.",
        requires: ["hostapd-wpe"],
        level: "aggressive",
      },
      {
        id: "hard",
        title: "Hard mode rogue AP",
        description: "Rogue enterprise AP with custom certificates.",
        requires: ["hostapd-wpe"],
        level: "aggressive",
      },
      {
        id: "identities",
        title: "Identities analysis",
        description: "Capture and analyze 802.1X identities.",
        requires: ["hostapd-wpe"],
        level: "active",
      },
      {
        id: "certs",
        title: "Certificates analysis",
        description: "Inspect the certificates presented by the network.",
        requires: ["openssl"],
        level: "passive",
      },
    ],
  },
  {
    id: "wpa3",
    label: "WPA3 Attacks",
    short: "WPA3",
    icon: ShieldCheck,
    tagline: "Downgrade & management-frame analysis",
    description:
      "Analysis of WPA3 transition networks: attempt WPA2 downgrade capture and inspect management frame protection (MFP/802.11w) posture.",
    accent: "cyan",
    needsMonitor: true,
    actions: [
      {
        id: "downgrade",
        title: "WPA3 downgrade capture",
        description: "Force WPA2 fallback to capture a crackable handshake.",
        requires: ["hcxdumptool"],
        level: "aggressive",
      },
      {
        id: "mfp",
        title: "MFP (802.11w) analysis",
        description: "Assess management frame protection configuration.",
        requires: ["airodump-ng"],
        level: "passive",
      },
    ],
  },
];

export const ACCENT_CLASSES: Record<
  AppModule["accent"],
  { text: string; bg: string; border: string; glow: string; dot: string }
> = {
  cyan: {
    text: "text-cyan-300",
    bg: "bg-cyan-500/10",
    border: "border-cyan-500/30",
    glow: "shadow-[0_0_30px_-10px_rgba(34,211,238,0.6)]",
    dot: "bg-cyan-400",
  },
  violet: {
    text: "text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    glow: "shadow-[0_0_30px_-10px_rgba(167,139,250,0.6)]",
    dot: "bg-violet-400",
  },
  red: {
    text: "text-rose-300",
    bg: "bg-rose-500/10",
    border: "border-rose-500/30",
    glow: "shadow-[0_0_30px_-10px_rgba(251,113,133,0.6)]",
    dot: "bg-rose-400",
  },
  amber: {
    text: "text-amber-300",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    glow: "shadow-[0_0_30px_-10px_rgba(251,191,36,0.6)]",
    dot: "bg-amber-400",
  },
  green: {
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    glow: "shadow-[0_0_30px_-10px_rgba(52,211,153,0.6)]",
    dot: "bg-emerald-400",
  },
};

export const LEVEL_META: Record<
  AttackAction["level"],
  { label: string; className: string }
> = {
  passive: {
    label: "Passive",
    className: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  },
  active: {
    label: "Active",
    className: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  },
  aggressive: {
    label: "Aggressive",
    className: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  },
};

export const DASHBOARD: Pick<AppModule, "id" | "label" | "short" | "icon"> = {
  id: "dashboard",
  label: "Dashboard",
  short: "Dashboard",
  icon: Radar,
};
