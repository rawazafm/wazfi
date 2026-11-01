# Build & install wazfi on Linux

wazfi is a native Linux desktop app. Build it **on Linux** (bare metal, or the
Parrot/Kali VM from [PARROT-UTM.md](./PARROT-UTM.md)). You can't build the Linux
package from macOS — Tauri links against Linux system libraries.

## Quick way (one command)

From the project root (`wazfiapp/`):

```bash
./linux/build.sh
```

It installs the build prerequisites for your distro (apt/pacman/dnf), checks
Rust + Node, builds, and prints where the packages are.

## Manual build

### 1. Prerequisites

**Debian / Kali / Parrot / Ubuntu:**
```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libfuse2
```

**Arch / BlackArch:**
```bash
sudo pacman -S --needed webkit2gtk-4.1 base-devel curl wget file openssl \
  libappindicator-gtk3 librsvg patchelf fuse2
```

**Fedora:**
```bash
sudo dnf install webkit2gtk4.1-devel openssl-devel curl wget file \
  libappindicator-gtk3-devel librsvg2-devel patchelf fuse
sudo dnf group install "C Development Tools and Libraries"
```

Plus **Rust** (`curl https://sh.rustup.rs -sSf | sh`) and **Node.js 20+**.

### 2. Build

```bash
cd wazfiapp
npm install
npm run tauri build
```

## Result

Packages are written to:

```
src-tauri/target/release/bundle/
  deb/wazfi_0.1.0_amd64.deb         (or _arm64 on ARM)
  rpm/wazfi-0.1.0-1.x86_64.rpm
  appimage/wazfi_0.1.0_amd64.AppImage
```

(The exact arch suffix matches the machine you build on — build on ARM64 Parrot
for an arm64 package.)

## Install

**Debian / Kali / Parrot / Ubuntu:**
```bash
sudo apt install ./src-tauri/target/release/bundle/deb/wazfi_*.deb
# launch:
wazfi
```

**Fedora / RHEL:**
```bash
sudo dnf install ./src-tauri/target/release/bundle/rpm/wazfi-*.rpm
```

**Portable AppImage (any distro, no install):**
```bash
chmod +x src-tauri/target/release/bundle/appimage/wazfi_*.AppImage
./src-tauri/target/release/bundle/appimage/wazfi_*.AppImage
```
(AppImage needs FUSE: `libfuse2` on apt, `fuse2` on pacman.)

## Running

Monitor mode (`airmon-ng`) and the in-app tool installer need root, so launch
with elevation:

```bash
sudo wazfi
```

On Kali/Parrot you're often root already. First run: use **Install tools** on the
Dashboard to pull anything missing, and `./linux/host-setup.sh` for USB adapter
drivers (e.g. RTL8812AU).
