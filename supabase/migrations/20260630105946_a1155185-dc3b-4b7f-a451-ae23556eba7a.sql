
-- Settings (single global row, id=1)
CREATE TABLE public.settings (
  id INT PRIMARY KEY DEFAULT 1,
  mode TEXT NOT NULL DEFAULT 'paper',           -- paper | signals | live
  stake NUMERIC NOT NULL DEFAULT 10,
  tp_r NUMERIC NOT NULL DEFAULT 3,
  sl_r NUMERIC NOT NULL DEFAULT 1,
  pre_spike_ratio NUMERIC NOT NULL DEFAULT 0.8,
  late_entry_ratio NUMERIC NOT NULL DEFAULT 0.9,
  max_hold_ratio NUMERIC NOT NULL DEFAULT 1.2,
  max_daily_loss NUMERIC NOT NULL DEFAULT 100,
  kill_switch BOOLEAN NOT NULL DEFAULT FALSE,
  learning_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  enabled_symbols TEXT[] NOT NULL DEFAULT ARRAY['BOOM1000','CRASH1000','BOOM500','CRASH500','BOOM300N','CRASH300N'],
  paper_balance NUMERIC NOT NULL DEFAULT 1000,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_single_row CHECK (id = 1)
);
GRANT SELECT ON public.settings TO anon, authenticated;
GRANT ALL ON public.settings TO service_role;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings public read" ON public.settings FOR SELECT USING (true);
INSERT INTO public.settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Symbol state
CREATE TABLE public.symbol_state (
  symbol TEXT PRIMARY KEY,
  last_epoch BIGINT,
  last_price NUMERIC,
  ticks_since_spike INT NOT NULL DEFAULT 0,
  last_spike_epoch BIGINT,
  median_abs_change NUMERIC NOT NULL DEFAULT 0,
  rsi NUMERIC NOT NULL DEFAULT 50,
  ema_fast NUMERIC NOT NULL DEFAULT 0,
  ema_slow NUMERIC NOT NULL DEFAULT 0,
  recent_ticks JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.symbol_state TO anon, authenticated;
GRANT ALL ON public.symbol_state TO service_role;
ALTER TABLE public.symbol_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "symbol_state public read" ON public.symbol_state FOR SELECT USING (true);

-- Positions
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,                       -- BUY | SELL
  regime TEXT NOT NULL,                     -- spike-anticipation | trend-following
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  stake NUMERIC NOT NULL,
  tp_r NUMERIC NOT NULL,
  sl_r NUMERIC NOT NULL,
  unit NUMERIC NOT NULL,                    -- price-distance for 1R
  pnl NUMERIC,
  realized_r NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',      -- open | closed
  reason TEXT,
  exit_reason TEXT,
  confidence NUMERIC,
  opened_epoch BIGINT NOT NULL,
  closed_epoch BIGINT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);
CREATE INDEX positions_status_idx ON public.positions(status);
CREATE INDEX positions_symbol_idx ON public.positions(symbol);
CREATE INDEX positions_opened_at_idx ON public.positions(opened_at DESC);
GRANT SELECT ON public.positions TO anon, authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "positions public read" ON public.positions FOR SELECT USING (true);

-- Signals (audit log)
CREATE TABLE public.signals (
  id BIGSERIAL PRIMARY KEY,
  symbol TEXT NOT NULL,
  regime TEXT NOT NULL,
  direction TEXT,
  confidence NUMERIC NOT NULL DEFAULT 0,
  reason TEXT,
  acted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX signals_created_at_idx ON public.signals(created_at DESC);
GRANT SELECT ON public.signals TO anon, authenticated;
GRANT ALL ON public.signals TO service_role;
ALTER TABLE public.signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "signals public read" ON public.signals FOR SELECT USING (true);

-- Learning buckets
CREATE TABLE public.learning_buckets (
  bucket_key TEXT PRIMARY KEY,              -- symbol|regime|direction
  symbol TEXT NOT NULL,
  regime TEXT NOT NULL,
  direction TEXT NOT NULL,
  trades INT NOT NULL DEFAULT 0,
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  ewma_r NUMERIC NOT NULL DEFAULT 0,
  disabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.learning_buckets TO anon, authenticated;
GRANT ALL ON public.learning_buckets TO service_role;
ALTER TABLE public.learning_buckets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "learning_buckets public read" ON public.learning_buckets FOR SELECT USING (true);

-- Engine runs heartbeat
CREATE TABLE public.engine_runs (
  id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INT,
  symbols_scanned INT NOT NULL DEFAULT 0,
  trades_opened INT NOT NULL DEFAULT 0,
  trades_closed INT NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX engine_runs_started_at_idx ON public.engine_runs(started_at DESC);
GRANT SELECT ON public.engine_runs TO anon, authenticated;
GRANT ALL ON public.engine_runs TO service_role;
ALTER TABLE public.engine_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_runs public read" ON public.engine_runs FOR SELECT USING (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.positions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.symbol_state;
ALTER PUBLICATION supabase_realtime ADD TABLE public.learning_buckets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.signals;
ALTER PUBLICATION supabase_realtime ADD TABLE public.engine_runs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.settings;
