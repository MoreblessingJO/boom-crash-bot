// Path B: HTTP-signed proxy to the Lovable app instead of direct Supabase access.
// Mimics the small subset of the supabase-js chainable API that engine.ts uses.
import { createHmac } from "crypto";

type Filter = { col: string; op: "eq" | "gte" | "lte" | "gt" | "lt"; val: unknown };
type Action = "select" | "insert" | "update" | "upsert" | "delete";

interface OpDescriptor {
  table: string;
  action: Action;
  values?: unknown;
  filters: Filter[];
  select?: string;
  maybeSingle?: boolean;
  onConflict?: string;
}

interface OpResult<T = unknown> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

function endpoint(): string {
  const base = process.env.LOVABLE_APP_URL;
  if (!base) throw new Error("Missing LOVABLE_APP_URL in .env");
  return base.replace(/\/$/, "") + "/api/public/worker-sync";
}
function secret(): string {
  const s = process.env.WORKER_SHARED_SECRET;
  if (!s) throw new Error("Missing WORKER_SHARED_SECRET in .env");
  return s;
}

async function sendOps(ops: OpDescriptor[]): Promise<OpResult[]> {
  const raw = JSON.stringify({ ops });
  const sig = createHmac("sha256", secret()).update(raw).digest("hex");
  const url = endpoint();
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-worker-signature": sig },
    body: raw,
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`worker-sync ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = (await res.json()) as { results: OpResult[] };
  return json.results;
}

class QueryBuilder<T = unknown> implements PromiseLike<OpResult<T>> {
  private op: OpDescriptor;
  constructor(table: string) {
    this.op = { table, action: "select", filters: [] };
  }
  select(cols = "*"): this {
    this.op.select = cols;
    if (!["insert", "update", "upsert"].includes(this.op.action)) this.op.action = "select";
    return this;
  }
  insert(values: unknown): this { this.op.action = "insert"; this.op.values = values; return this; }
  update(values: unknown): this { this.op.action = "update"; this.op.values = values; return this; }
  upsert(values: unknown, opts?: { onConflict?: string }): this {
    this.op.action = "upsert"; this.op.values = values;
    if (opts?.onConflict) this.op.onConflict = opts.onConflict;
    return this;
  }
  delete(): this { this.op.action = "delete"; return this; }
  eq(col: string, val: unknown): this { this.op.filters.push({ col, op: "eq", val }); return this; }
  gte(col: string, val: unknown): this { this.op.filters.push({ col, op: "gte", val }); return this; }
  lte(col: string, val: unknown): this { this.op.filters.push({ col, op: "lte", val }); return this; }
  gt(col: string, val: unknown): this { this.op.filters.push({ col, op: "gt", val }); return this; }
  lt(col: string, val: unknown): this { this.op.filters.push({ col, op: "lt", val }); return this; }
  maybeSingle(): this { this.op.maybeSingle = true; return this; }

  async exec(): Promise<OpResult<T>> {
    const [r] = await sendOps([this.op]);
    return r as OpResult<T>;
  }
  then<TR1 = OpResult<T>, TR2 = never>(
    onfulfilled?: ((value: OpResult<T>) => TR1 | PromiseLike<TR1>) | null,
    onrejected?: ((reason: unknown) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return this.exec().then(onfulfilled ?? undefined, onrejected ?? undefined);
  }
}

class DbClient {
  from(table: string) { return new QueryBuilder(table); }
}

let _client: DbClient | null = null;
export function db(): DbClient {
  if (!_client) _client = new DbClient();
  return _client;
}
