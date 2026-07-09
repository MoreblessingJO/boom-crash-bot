
-- 1. strategy_params on agents
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS strategy_params JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. per-agent paper ledger
CREATE TABLE IF NOT EXISTS public.agent_paper_ledgers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public.agents(id) ON DELETE CASCADE,
  starting_balance NUMERIC NOT NULL DEFAULT 1000,
  paper_balance NUMERIC NOT NULL DEFAULT 1000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.agent_paper_ledgers TO authenticated;
GRANT ALL ON public.agent_paper_ledgers TO service_role;

ALTER TABLE public.agent_paper_ledgers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read ledgers"
  ON public.agent_paper_ledgers FOR SELECT TO authenticated USING (true);

CREATE TRIGGER trg_ledgers_updated_at
  BEFORE UPDATE ON public.agent_paper_ledgers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. agent_id on positions + signals
ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_positions_agent_id ON public.positions(agent_id);

ALTER TABLE public.signals
  ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_signals_agent_id ON public.signals(agent_id);

-- 4. Activate agents + set params (idempotent updates)
UPDATE public.agents SET
  status = 'live',
  strategy_params = '{"mode":"spike_anticipation","dueRatio":0.6,"confFloor":0.5}'::jsonb
WHERE slug = 'nicco';

UPDATE public.agents SET
  status = 'live',
  strategy_params = '{"mode":"trend_following","rsiHi":55,"rsiLo":45,"confFloor":0.55}'::jsonb
WHERE slug = 'nexx';

UPDATE public.agents SET
  status = 'live',
  strategy_params = '{"mode":"spike_anticipation_aggressive","dueRatio":0.75,"confFloor":0.65,"stakeMult":1.5}'::jsonb
WHERE slug = '007';

UPDATE public.agents SET
  status = 'live',
  strategy_params = '{"mode":"ai_gated","minConfidence":0.75,"requireAiAgreement":true}'::jsonb
WHERE slug = 'sniper';

-- 5. Seed ledgers for all live boom_crash agents at $1000
INSERT INTO public.agent_paper_ledgers (agent_id, starting_balance, paper_balance, is_active)
SELECT id, 1000, 1000, true
FROM public.agents
WHERE market = 'boom_crash' AND status = 'live'
ON CONFLICT (agent_id) DO NOTHING;

-- 6. Backfill existing positions/signals to Nicco
UPDATE public.positions p SET agent_id = a.id
FROM public.agents a
WHERE p.agent_id IS NULL AND a.slug = 'nicco';

UPDATE public.signals s SET agent_id = a.id
FROM public.agents a
WHERE s.agent_id IS NULL AND a.slug = 'nicco';

-- 7. Replace paper-balance trigger to route into per-agent ledgers
CREATE OR REPLACE FUNCTION public.apply_position_pnl_to_paper_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'closed'
     AND COALESCE(OLD.status, '') <> 'closed'
     AND NEW.pnl IS NOT NULL
     AND NEW.agent_id IS NOT NULL THEN
    UPDATE public.agent_paper_ledgers
    SET paper_balance = paper_balance + NEW.pnl,
        updated_at = now()
    WHERE agent_id = NEW.agent_id;
  END IF;
  RETURN NEW;
END;
$$;

-- 8. Performance view
CREATE OR REPLACE VIEW public.agent_performance AS
SELECT
  a.id AS agent_id,
  a.slug,
  a.name,
  a.status,
  a.market,
  COALESCE(l.starting_balance, 1000) AS starting_balance,
  COALESCE(l.paper_balance, 1000) AS current_balance,
  CASE WHEN COALESCE(l.starting_balance,0) > 0
       THEN ROUND(((COALESCE(l.paper_balance,1000) - COALESCE(l.starting_balance,1000)) / l.starting_balance * 100)::numeric, 2)
       ELSE 0 END AS return_pct,
  COUNT(p.id) FILTER (WHERE p.status = 'closed') AS trades,
  COUNT(p.id) FILTER (WHERE p.status = 'closed' AND p.pnl > 0) AS wins,
  COUNT(p.id) FILTER (WHERE p.status = 'closed' AND p.pnl <= 0) AS losses,
  CASE WHEN COUNT(p.id) FILTER (WHERE p.status = 'closed') > 0
       THEN ROUND((COUNT(p.id) FILTER (WHERE p.status = 'closed' AND p.pnl > 0)::numeric
                   / COUNT(p.id) FILTER (WHERE p.status = 'closed') * 100), 1)
       ELSE 0 END AS win_rate,
  COALESCE(SUM(p.pnl) FILTER (WHERE p.status = 'closed'), 0)::numeric AS net_pnl,
  COALESCE(AVG(p.pnl) FILTER (WHERE p.status = 'closed' AND p.pnl > 0), 0)::numeric AS avg_win,
  COALESCE(AVG(p.pnl) FILTER (WHERE p.status = 'closed' AND p.pnl <= 0), 0)::numeric AS avg_loss,
  COALESCE(MAX(p.pnl) FILTER (WHERE p.status = 'closed'), 0)::numeric AS best_trade,
  COALESCE(MIN(p.pnl) FILTER (WHERE p.status = 'closed'), 0)::numeric AS worst_trade,
  MAX(p.closed_at) AS last_trade_at
FROM public.agents a
LEFT JOIN public.agent_paper_ledgers l ON l.agent_id = a.id
LEFT JOIN public.positions p ON p.agent_id = a.id
GROUP BY a.id, a.slug, a.name, a.status, a.market, l.starting_balance, l.paper_balance;

GRANT SELECT ON public.agent_performance TO authenticated, anon;
