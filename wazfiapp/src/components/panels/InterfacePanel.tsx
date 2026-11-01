import { motion } from "framer-motion";
import { Check, Radio, Wifi, Shuffle, Usb, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "@/store";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";

export function InterfacePanel() {
  const {
    interfaces,
    selectedIface,
    selectIface,
    toggleMonitor,
    log,
    usbWifi,
    system,
  } = useApp();

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Interface Control</h2>
        <p className="text-sm text-muted-foreground">
          Select the wireless adapter and toggle monitor mode before launching
          any attack module.
        </p>
      </div>

      {usbWifi.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Card className="border-amber-500/30">
            <CardContent className="p-5">
              <div className="mb-3 flex items-center gap-2">
                <Usb className="h-4 w-4 text-amber-300" />
                <span className="text-sm font-semibold">
                  External USB Wi-Fi detected
                </span>
              </div>
              <div className="space-y-3">
                {usbWifi.map((d, i) => (
                  <div
                    key={`${d.vendor_id}:${d.product_id}:${i}`}
                    className="rounded-lg border border-border/60 bg-muted/20 p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{d.chipset}</span>
                      <Badge className="border-border bg-muted/40 font-mono text-[10px] text-muted-foreground">
                        {d.vendor_id}:{d.product_id}
                      </Badge>
                      {d.usable_here ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                          <Check className="h-3 w-3" /> usable here
                        </Badge>
                      ) : (
                        <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-300">
                          no driver on {system?.platform ?? "this OS"}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {d.name}
                      {d.vendor ? ` · ${d.vendor}` : ""} · Linux driver:{" "}
                      <span className="font-mono">{d.linux_driver}</span>
                    </div>
                    <p className="mt-2 text-xs text-amber-200/90">{d.note}</p>
                  </div>
                ))}
              </div>

              {!usbWifi.some((d) => d.usable_here) && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
                  <Server className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="space-y-1.5">
                    <p>
                      {system?.platform === "Linux"
                        ? "The adapter is attached but no interface exists yet — its driver isn't loaded."
                        : `This adapter works on Linux, not ${system?.platform ?? "this OS"}. Run wazfi on a Linux host (see agent/PARROT-UTM.md).`}
                    </p>
                    <p>On the Linux host, load the driver:</p>
                    <code className="block rounded bg-muted/50 px-2 py-1 font-mono text-[11px] text-foreground">
                      sudo ./linux/host-setup.sh
                    </code>
                    <p className="text-[11px] opacity-80">
                      Atheros AR9271, Ralink and MediaTek adapters work in-kernel
                      (firmware only); Realtek RTL8812AU/8814AU need the
                      out-of-tree driver the script builds.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {interfaces.map((iface, idx) => {
          const selected = iface.name === selectedIface;
          const monitor = iface.mode === "monitor";
          return (
            <motion.div
              key={iface.name}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.06 }}
            >
              <Card
                className={cn(
                  "glass-hover cursor-pointer",
                  selected && "neon-ring border-primary/50",
                )}
                onClick={() => selectIface(iface.name)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "grid h-11 w-11 place-items-center rounded-xl border",
                          monitor
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                            : "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
                        )}
                      >
                        {monitor ? (
                          <Radio className="h-5 w-5" />
                        ) : (
                          <Wifi className="h-5 w-5" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-base font-semibold">
                            {iface.name}
                          </span>
                          {selected && (
                            <Badge className="border-primary/30 bg-primary/10 text-primary">
                              <Check className="h-3 w-3" /> active
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {iface.chipset}
                        </div>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        monitor
                          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/30 bg-amber-500/10 text-amber-300",
                      )}
                    >
                      {iface.mode}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                    <Field label="Driver" value={iface.driver} />
                    <Field label="MAC" value={iface.mac} mono />
                    <Field
                      label="Monitor support"
                      value={iface.supports_monitor ? "yes" : "no"}
                    />
                    <Field label="Link" value={iface.up ? "up" : "down"} />
                  </div>

                  <div
                    className="mt-4 flex items-center justify-between border-t border-border/50 pt-4"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={monitor}
                        disabled={!iface.supports_monitor}
                        onCheckedChange={() => toggleMonitor(iface.name)}
                      />
                      <span className="text-muted-foreground">Monitor mode</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        log("cmd", `macchanger -r ${iface.name}`)
                      }
                    >
                      <Shuffle className="h-3.5 w-3.5" /> Spoof MAC
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className={cn("truncate text-foreground", mono && "font-mono")}>
        {value}
      </div>
    </div>
  );
}
