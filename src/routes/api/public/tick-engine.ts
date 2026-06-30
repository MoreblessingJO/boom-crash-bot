// Cron endpoint — invoked every 30s by pg_cron.
// Verifies caller via the Supabase anon key in the `apikey` header.
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/tick-engine")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!apikey || !expected || apikey !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const startedAt = new Date().toISOString();
        const t0 = Date.now();

        const { runEngine } = await import("@/lib/engine.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        let result;
        let errText: string | null = null;
        try {
          result = await runEngine();
        } catch (err) {
          errText = err instanceof Error ? err.message : String(err);
          result = { symbols_scanned: 0, trades_opened: 0, trades_closed: 0, errors: [errText] };
        }

        const finishedAt = new Date().toISOString();
        await supabaseAdmin.from("engine_runs").insert({
          started_at: startedAt,
          finished_at: finishedAt,
          duration_ms: Date.now() - t0,
          symbols_scanned: result.symbols_scanned,
          trades_opened: result.trades_opened,
          trades_closed: result.trades_closed,
          error: result.errors.length ? result.errors.join(" | ") : null,
        });

        return Response.json({ ok: true, ...result });
      },
      GET: async () =>
        new Response(JSON.stringify({ status: "alive" }), {
          headers: { "Content-Type": "application/json" },
        }),
    },
  },
});
