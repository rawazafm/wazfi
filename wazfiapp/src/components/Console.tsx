import * as React from "react";
import { TerminalSquare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp, type LogLine } from "@/store";
import { Button } from "@/components/ui/button";

const LEVEL_STYLE: Record<LogLine["level"], string> = {
  info: "text-sky-300",
  ok: "text-emerald-300",
  warn: "text-amber-300",
  err: "text-rose-300",
  cmd: "text-violet-300",
};

const LEVEL_PREFIX: Record<LogLine["level"], string> = {
  info: "[*]",
  ok: "[+]",
  warn: "[!]",
  err: "[x]",
  cmd: " $ ",
};

export function Console({ className }: { className?: string }) {
  const { logs } = useApp();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const pinnedRef = React.useRef(true);

  // Auto-scroll ONLY this console's own box (never the page). Using
  // scrollIntoView would bubble up and scroll ancestor containers, yanking the
  // whole app to the bottom while output streams.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el && pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [logs]);

  // Only keep auto-scrolling while the user is near the bottom.
  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }

  return (
    <div className={cn("glass flex flex-col overflow-hidden rounded-xl", className)}>
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TerminalSquare className="h-4 w-4 text-primary" />
          Console
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {logs.length}
          </span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="logs auto-scroll">
          <Trash2 className="h-3.5 w-3.5 opacity-50" />
        </Button>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="relative flex-1 overflow-y-auto overscroll-contain p-3 font-mono text-[12px] leading-relaxed"
      >
        {logs.length === 0 && (
          <div className="text-muted-foreground">waiting for activity…</div>
        )}
        {logs.map((l) => (
          <div key={l.id} className="flex gap-2">
            <span className="shrink-0 text-muted-foreground/60">{l.ts}</span>
            <span className={cn("shrink-0", LEVEL_STYLE[l.level])}>
              {LEVEL_PREFIX[l.level]}
            </span>
            <span className="break-all text-foreground/90">{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
