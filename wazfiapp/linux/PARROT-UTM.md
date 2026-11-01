# Parrot OS in UTM (Apple Silicon) — run wazfi with a USB Wi-Fi adapter

wazfi runs **natively on a Linux host**. On an Apple Silicon Mac the practical
way to get a real monitor-mode adapter is a Linux VM in UTM with USB
passthrough: you run the **wazfi app inside the VM**, and the RTL8812AU is
passed through to it.

> **Decisive rule:** use UTM's **QEMU backend**. USB passthrough is supported
> only by QEMU, not Apple Virtualization
> ([UTM docs](https://docs.getutm.app/guest-support/sharing/usb/)).

## 1. Install UTM
From [getutm.app](https://getutm.app) or the Mac App Store.

## 2. Get Parrot — ARM64, not AMD64
On Apple Silicon use the **ARM64** build (AMD64 = slow emulation). From the
[Parrot download page](https://parrotsec.org/download/):
- **Easiest:** Security Edition → **ARM64** → **UTM (Apple Silicon)** prebuilt
  image → open it in UTM (it's already a QEMU VM).
- **Or:** the ARM64 **ISO** and build the VM yourself (step 3).

## 3. Building from the ISO: create the VM with QEMU
1. UTM → New VM → **Virtualize → Linux**.
2. **Turn OFF "Use Apple Virtualization."** Only QEMU exposes USB passthrough
   (it still HVF-accelerates an ARM64 guest, so it's fast).
3. Pick the Parrot **ARM64 ISO**; 4+ CPU, 4–8 GB RAM, 40 GB+ disk; install.

## 4. Pass the adapter into the VM
1. Plug the RTL8812AU into the Mac.
2. With the VM running, click the **USB icon** in UTM's toolbar → select
   **"Realtek 802.11n NIC" (0bda:8812)**.
3. In Parrot: `lsusb | grep -i realtek`

## 5. Install the driver + run wazfi (inside Parrot)
Copy this project into the VM (shared dir / `scp` / `git clone`), then:
```bash
cd wazfiapp/linux
sudo ./host-setup.sh        # builds the 88XXau driver, brings up wlanX
iw dev                       # confirm the interface appeared
```
Then build & launch the wazfi app inside Parrot:
```bash
cd ..                        # wazfiapp/
npm install
npm run tauri build          # or: npm run tauri dev
```
The RTL8812AU now appears under **Interface Control** with monitor mode — flip
it on and run the modules. Install any missing tools with the Dashboard's
**Install tools** button (uses apt on Parrot).

## Driver support

| Chipset | Driver | Works out of the box on Linux? |
| ------- | ------ | ------------------------------ |
| Atheros AR9271 | `ath9k_htc` | ✅ in-kernel (firmware only) |
| Ralink RT3070/RT5370 | `rt2800usb` | ✅ in-kernel |
| MediaTek MT7601U/MT7612U | `mt76` | ✅ in-kernel |
| Realtek RTL8812AU/8814AU | `88XXau` (dkms) | ⚠️ `host-setup.sh` builds it |

---

### Notes
- ARM64 is fine: aircrack-ng, reaver, bully, hostapd, hcxdumptool and the
  RTL8812AU driver all build/run on it.
- ISO installs on Apple Silicon can be finicky — the prebuilt Parrot `.utm`
  image avoids the installer.
- Running wazfi inside the VM keeps the GUI, tools and adapter on the same Linux
  kernel, which is exactly what airgeddon needs.

_Sources: UTM docs (USB sharing is QEMU-only), Parrot OS download & UTM docs.
Content was rephrased for compliance with licensing restrictions._
