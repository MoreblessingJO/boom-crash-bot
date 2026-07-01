// Signed RPC endpoint for the external DigitalOcean worker.
// Auth: HMAC-SHA256 over the raw body with WORKER_SHARED_SECRET.
// Body: { ops: Op[] } — each op is one Supabase query serialized to JSON.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

type Filter = { col: string; op: "eq" | "gte" | "lte" | "gt" | "lt"; val: unknown };
type Op = {
  table: string;
  action: "select" | "insert" | "update" | "upsert" | "delete";
  values?: unknown;
  filters?: Filter[];
  select?: string;
  maybeSingle?: boolean;
  onConflict?: string;
};

const ALLOWED_TABLES = new Set([
  "positions",
  "settings",
  "learning_buckets",
  "symbol_state",
  "signals",
  "engine_heartbeat",
]);

function verifySig(rawBody: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    const a = Buffer.from(header, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function runOp(op: Op) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (!ALLOWED_TABLES.has(op.table)) throw new Error(`table not allowed: ${op.table}`);
  let q: any = supabaseAdmin.from(op.table);

  switch (op.action) {
    case "select":
      q = q.select(op.select ?? "*");
      break;
    case "insert":
      q = q.insert(op.values as any);
      if (op.select) q = q.select(op.select);
      break;
    case "update":
      q = q.update(op.values as any);
      if (op.select) q = q.select(op.select);
      break;
    case "upsert":
      q = q.upsert(op.values as any, op.onConflict ? { onConflict: op.onConflict } : undefined);
      if (op.select) q = q.select(op.select);
      break;
    case "delete":
      q = q.delete();
      break;
  }

  for (const f of op.filters ?? []) {
    if (!["eq", "gte", "lte", "gt", "lt"].includes(f.op)) continue;
    q = (q as any)[f.op](f.col, f.val);
  }

  if (op.maybeSingle) q = q.maybeSingle();

  const { data, error } = await q;
  return { data: data ?? null, error: error ? { message: error.message, code: (error as any).code } : null };
}

export const Route = createFileRoute("/api/public/worker-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.WORKER_SHARED_SECRET;
        if (!secret) return new Response("server not configured", { status: 500 });

        const raw = await request.text();
        const sig = request.headers.get("x-worker-signature");
        if (!verifySig(raw, sig, secret)) {
          return new Response("invalid signature", { status: 401 });
        }

        let body: { ops?: Op[] };
        try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }
        const ops = body.ops ?? [];
        if (!Array.isArray(ops) || ops.length === 0 || ops.length > 25) {
          return new Response("bad ops", { status: 400 });
        }

        const results = [];
        for (const op of ops) {
          try {
            results.push(await runOp(op));
          } catch (e) {
            results.push({ data: null, error: { message: (e as Error).message } });
          }
        }
        return Response.json({ results });
      },
    },
  },
});
