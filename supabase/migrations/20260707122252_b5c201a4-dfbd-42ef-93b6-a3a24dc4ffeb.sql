CREATE TABLE public.agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  tagline text NOT NULL,
  description text NOT NULL,
  strategy_key text NOT NULL,
  market text NOT NULL CHECK (market IN ('boom_crash','crypto','forex')),
  status text NOT NULL DEFAULT 'coming_soon' CHECK (status IN ('live','beta','coming_soon')),
  risk_level text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
  avg_trades_per_day int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agents TO anon, authenticated;
GRANT ALL ON public.agents TO service_role;

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agents readable by everyone"
  ON public.agents FOR SELECT
  TO anon, authenticated
  USING (true);


CREATE TABLE public.user_agent_selections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_agent_selections TO authenticated;
GRANT ALL ON public.user_agent_selections TO service_role;

ALTER TABLE public.user_agent_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own selection"
  ON public.user_agent_selections FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "users upsert own selection"
  ON public.user_agent_selections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own selection"
  ON public.user_agent_selections FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users delete own selection"
  ON public.user_agent_selections FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER user_agent_selections_updated_at
  BEFORE UPDATE ON public.user_agent_selections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.agents (slug, name, tagline, description, strategy_key, market, status, risk_level, avg_trades_per_day, sort_order) VALUES
(
  'nicco',
  'Nicco',
  'Spike anticipation on Boom & Crash',
  'The original NexxTrade agent. Reads every tick across 6 Boom/Crash symbols, anticipates spikes from tick pressure and regime state, and executes 5-tick Rise/Fall contracts with server-enforced guardrails. Idempotent orders, adaptive per-regime learning.',
  'spike_anticipation',
  'boom_crash',
  'live',
  'medium',
  40,
  10
),
(
  'nexx',
  'Agent Nexx',
  '4-Green-Light Compression',
  'Four independent indicators must align simultaneously — Compression Ratio, Tick Pressure State, H1 Price Position, and TSSL score. Only enters when the market is statistically compressed and ready to spike. 30s brain cycle across 4 symbols.',
  'four_green_light',
  'boom_crash',
  'beta',
  'low',
  8,
  20
),
(
  'agent-007',
  'Agent 007',
  'H4 RSI Divergence Kingpin',
  'Advanced two-lot architecture. H4 RSI divergence near multi-day price extremes triggers dual positions: a fast scalper for the initial move and a kingpin runner with a wide trailing stop for continuation. H4 boundary detection with RSI divergence scan.',
  'h4_rsi_divergence',
  'boom_crash',
  'beta',
  'high',
  4,
  30
),
(
  'sniper',
  'Sniper',
  'M5 Zone Sniper — Exhaustion Entry',
  'Monitors H4 RSI context, H1 streak patterns, and M5 RSI exhaustion simultaneously. Fires only when all three timeframes confirm terminal exhaustion. 60s cycle · H4 + H1 + M5 alignment check, refined with live tick feedback.',
  'm5_zone_sniper',
  'boom_crash',
  'beta',
  'medium',
  6,
  40
),
(
  'crypto-momentum',
  'Crypto Momentum',
  'Trend + funding momentum on BTC/ETH',
  'Momentum + funding-rate strategy for major crypto pairs. Ships once the Deriv crypto contract adapter is live.',
  'crypto_momentum',
  'crypto',
  'coming_soon',
  'high',
  0,
  100
),
(
  'fx-scalper',
  'FX Scalper',
  'Session-open scalping on major FX pairs',
  'Micro-scalp strategy that trades London/NY session opens on EUR/USD, GBP/USD, USD/JPY. Ships alongside the forex market.',
  'fx_scalper',
  'forex',
  'coming_soon',
  'medium',
  0,
  110
);