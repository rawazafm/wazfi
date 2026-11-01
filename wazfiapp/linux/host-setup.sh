#!/usr/bin/env bash
#
# wazfi host setup — installs USB Wi-Fi drivers on the LINUX HOST running wazfi
# so pentest adapters get a real, monitor-mode-capable interface.
#
# Run this on the machine the adapter is PLUGGED INTO — the same Linux host you
# run the wazfi app on (a Linux laptop, a Raspberry Pi, or a Linux VM with USB
# passthrough). Drivers load into this kernel and the app then lists the adapter.
#
#   sudo ./host-setup.sh
#
# Covered chipsets:
#   RTL8812AU / RTL8814AU / RTL8821AU  -> out-of-tree dkms driver (Realtek)
#   AR9271 (ath9k_htc)                 -> in kernel, needs firmware only
#   Ralink RT3070/RT5370 (rt2800usb)   -> in kernel, needs firmware only
#   MediaTek MT7601U/MT7612U (mt76)    -> in kernel, needs firmware only

set -uo pipefail

RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; CYN=$'\e[36m'; RST=$'\e[0m'
say()  { printf "%s[*]%s %s\n" "$CYN" "$RST" "$*"; }
ok()   { printf "%s[+]%s %s\n" "$GRN" "$RST" "$*"; }
warn() { printf "%s[!]%s %s\n" "$YEL" "$RST" "$*"; }
die()  { printf "%s[x]%s %s\n" "$RED" "$RST" "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "run as root:  sudo $0"
[ "$(uname -s)" = "Linux" ] || die "this script is for Linux hosts only (the adapter can't work on $(uname -s))."

# ----- detect package manager --------------------------------------------- #
if   command -v apt-get >/dev/null 2>&1; then PM=apt
elif command -v pacman  >/dev/null 2>&1; then PM=pacman
elif command -v dnf     >/dev/null 2>&1; then PM=dnf
else die "no supported package manager (apt/pacman/dnf) found."
fi
say "package manager: $PM   kernel: $(uname -r)"

# ----- detect attached Wi-Fi adapters ------------------------------------- #
LSUSB="$(lsusb 2>/dev/null || true)"
echo "$LSUSB" | grep -iE "realtek|ralink|atheros|mediatek|802\.11|wlan|wireless" \
  && NEEDS_RTL=$(echo "$LSUSB" | grep -qiE "0bda:(8812|8813|881a|a81a|8814|0811|0820)" && echo 1 || echo 0) \
  || { warn "no obvious USB Wi-Fi adapter in lsusb — continuing anyway"; NEEDS_RTL=0; }

install_pkgs() {
  case "$PM" in
    apt)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update
      apt-get install -y --no-install-recommends "$@"
      ;;
    pacman) pacman -Sy --noconfirm "$@" ;;
    dnf)    dnf install -y "$@" ;;
  esac
}

# ----- common tools + firmware (covers in-kernel chipsets) ---------------- #
say "installing aircrack-ng, build tools and firmware…"
case "$PM" in
  apt)
    install_pkgs aircrack-ng iw wireless-tools build-essential bc \
      "linux-headers-$(uname -r)" dkms git \
      wireless-regdb firmware-atheros firmware-realtek firmware-misc-nonfree \
      || warn "some packages failed; continuing"
    ;;
  pacman)
    install_pkgs aircrack-ng iw base-devel bc dkms git linux-headers \
      wireless-regdb linux-firmware || warn "some packages failed; continuing"
    ;;
  dnf)
    install_pkgs aircrack-ng iw @development-tools bc dkms git \
      "kernel-devel-$(uname -r)" wireless-regdb linux-firmware \
      || warn "some packages failed; continuing"
    ;;
esac

# ----- Realtek RTL88xxAU out-of-tree driver ------------------------------- #
if [ "${NEEDS_RTL}" = "1" ]; then
  say "Realtek RTL88xxAU adapter detected — installing the out-of-tree driver…"
  INSTALLED=0
  if [ "$PM" = "apt" ]; then
    if apt-get install -y realtek-rtl88xxau-dkms; then INSTALLED=1; fi
  elif [ "$PM" = "dnf" ]; then
    if dnf install -y rtl8812au || dnf install -y dkms-rtl88xxau; then INSTALLED=1; fi
  fi

  if [ "$INSTALLED" != "1" ]; then
    warn "distro package unavailable — building from source (aircrack-ng/rtl8812au)…"
    SRC=/usr/src/rtl8812au-wazfi
    rm -rf "$SRC"
    if git clone --depth 1 https://github.com/aircrack-ng/rtl8812au.git "$SRC"; then
      ( cd "$SRC" && make dkms_install ) && INSTALLED=1 \
        || ( cd "$SRC" && make && make install ) && INSTALLED=1
    fi
  fi

  if [ "$INSTALLED" = "1" ]; then
    ok "RTL88xxAU driver installed"
    modprobe 88XXau 2>/dev/null || modprobe 8812au 2>/dev/null || true
  else
    warn "could not install the RTL88xxAU driver automatically."
    warn "Build manually:  git clone https://github.com/aircrack-ng/rtl8812au && cd rtl8812au && sudo make dkms_install"
  fi
fi

# ----- load in-kernel modules for the other chipsets ---------------------- #
for mod in ath9k_htc rt2800usb mt76x2u mt7601u; do
  modprobe "$mod" 2>/dev/null || true
done
command -v rfkill >/dev/null 2>&1 && rfkill unblock wifi 2>/dev/null || true

# ----- result ------------------------------------------------------------- #
echo
say "wireless interfaces now present:"
if command -v iw >/dev/null 2>&1; then
  iw dev 2>/dev/null | awk '/Interface/{print "    "$2}' || true
fi
echo
if iw dev 2>/dev/null | grep -q Interface; then
  ok "done. Launch the wazfi app on this host and the adapter will appear under Interface Control."
  ok "(airmon-ng start <iface> enables monitor mode, or use the app's toggle)."
else
  warn "no wireless interface yet — replug the adapter, or reboot if a dkms driver was just built."
fi
