#!/usr/bin/env bash
#
# Build the wazfi Linux desktop packages (.deb / .rpm / .AppImage).
#
# Run this ON a Linux host (Debian/Kali/Parrot/Ubuntu, Arch, or Fedora) from the
# project — it installs Tauri's build prerequisites, then builds.
#
#   ./linux/build.sh
#
# Artifacts land in: src-tauri/target/release/bundle/{deb,rpm,appimage}/

set -uo pipefail
RED=$'\e[31m'; GRN=$'\e[32m'; YEL=$'\e[33m'; CYN=$'\e[36m'; RST=$'\e[0m'
say(){ printf "%s[*]%s %s\n" "$CYN" "$RST" "$*"; }
ok(){ printf "%s[+]%s %s\n" "$GRN" "$RST" "$*"; }
warn(){ printf "%s[!]%s %s\n" "$YEL" "$RST" "$*"; }
die(){ printf "%s[x]%s %s\n" "$RED" "$RST" "$*"; exit 1; }

[ "$(uname -s)" = "Linux" ] || die "build on Linux. From macOS use a Linux VM (see linux/PARROT-UTM.md)."

# project root = parent of this script's dir
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
say "project: $ROOT"

SUDO=""; [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

# ---- 1. system build prerequisites --------------------------------------- #
if command -v apt-get >/dev/null 2>&1; then
  say "installing build deps via apt…"
  $SUDO apt-get update
  $SUDO apt-get install -y \
    libwebkit2gtk-4.1-dev build-essential curl wget file \
    libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
    patchelf libfuse2 \
    || die "apt dependency install failed"
elif command -v pacman >/dev/null 2>&1; then
  say "installing build deps via pacman…"
  $SUDO pacman -Sy --noconfirm \
    webkit2gtk-4.1 base-devel curl wget file openssl \
    libappindicator-gtk3 librsvg patchelf fuse2 \
    || die "pacman dependency install failed"
elif command -v dnf >/dev/null 2>&1; then
  say "installing build deps via dnf…"
  $SUDO dnf install -y \
    webkit2gtk4.1-devel openssl-devel curl wget file \
    libappindicator-gtk3-devel librsvg2-devel patchelf fuse \
    && $SUDO dnf groupinstall -y "C Development Tools and Libraries" \
    || warn "dnf dependency install had issues; continuing"
else
  die "unsupported distro (need apt, pacman, or dnf)"
fi
ok "system dependencies ready"

# ---- 2. toolchains ------------------------------------------------------- #
if ! command -v cargo >/dev/null 2>&1; then
  say "installing Rust via rustup…"
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
  # shellcheck disable=SC1090
  . "$HOME/.cargo/env"
fi
ok "rust: $(rustc --version 2>/dev/null || echo 'NOT FOUND')"

command -v node >/dev/null 2>&1 || die "Node.js not found. Install Node 20+ (nodejs.org / nvm), then re-run."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] 2>/dev/null || warn "Node $(node -v) detected; the Vite build wants Node 20+."
ok "node: $(node -v)"

# ---- 3. frontend deps ---------------------------------------------------- #
say "installing npm dependencies…"
if [ -f package-lock.json ]; then npm ci || npm install; else npm install; fi

# tauri CLI comes from devDependencies (@tauri-apps/cli)

# ---- 4. build ------------------------------------------------------------ #
say "building release bundles (this takes a while the first time)…"
npm run tauri build || die "tauri build failed"

# ---- 5. report ----------------------------------------------------------- #
BUNDLE="src-tauri/target/release/bundle"
echo
ok "build complete. Artifacts:"
find "$BUNDLE" -type f \( -name '*.deb' -o -name '*.rpm' -o -name '*.AppImage' \) 2>/dev/null \
  | sed 's/^/    /' || true
echo
say "install (Debian/Kali/Parrot):  sudo apt install ./$BUNDLE/deb/*.deb"
say "or run the portable AppImage:   chmod +x $BUNDLE/appimage/*.AppImage && ./$BUNDLE/appimage/*.AppImage"
say "for live attacks, launch as root:  sudo wazfi   (monitor mode + tool install need root)"
