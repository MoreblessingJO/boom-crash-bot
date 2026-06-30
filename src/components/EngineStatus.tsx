import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface Heartbeat {
  status: string;
  last_tick_epoch: number | null;
  symbols_connected: number;
  updated_at: string;
}

export function EngineStatus() {
  const [hb, setHb] = useState<Heartbeat | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data } = await supabase
        .from("engine_heartbeat")
        .select("status,last_tick_epoch,symbols_connected,updated_at")
        .eq("id", 1)
        .maybeSingle();
      if (mounted && data) setHb(data as Heartbeat);
    }
    load();
    const ch = supabase
      .channel("engine_heartbeat")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "engine_heartbeat" },
        (p) => {
          if (mounted) setHb(p.new as Heartbeat);
        },
      )
      .subscribe();
    const tick = setInterval(() => setNow(Date.now()), 2000);
    return () => {
      mounted = false;
      clearInterval(tick);
      supabase.removeChannel(ch);
    };
  }, []);

  const ageSec = hb?.updated_at
    ? Math.round((now - new Date(hb.updated_at).getTime()) / 1000)
    : null;

  let kind: "live" | "stale" | "down" | "off" = "off";
  if (hb && ageSec !== null) {
    if (ageSec < 15) kind = "live";
    else if (ageSec < 60) kind = "stale";
    else kind = "down";
  }

  const label =
    kind === "live"
      ? `Engine live · ${hb?.symbols_connected ?? 0}/6`
      : kind === "stale"
        ? `Engine lagging · ${ageSec}s`
        : kind === "down"
          ? `Engine down · ${ageSec}s`
          : "Engine: cron";

  return (
    <span
      title={hb ? `status=${hb.status} updated_at=${hb.updated_at}` : "No worker heartbeat yet"}
      className={cn(
        "flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
        kind === "live" && "border-boom/40 bg-boom/10 text-boom",
        kind === "stale" && "border-warn/40 bg-warn/10 text-warn",
        kind === "down" && "border-crash/40 bg-crash/10 text-crash",
        kind === "off" && "border-border bg-surface text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          kind === "live" && "bg-boom animate-pulse",
          kind === "stale" && "bg-warn",
          kind === "down" && "bg-crash",
          kind === "off" && "bg-muted-foreground",
        )}
      />
      {label}
    </span>
  );
}
