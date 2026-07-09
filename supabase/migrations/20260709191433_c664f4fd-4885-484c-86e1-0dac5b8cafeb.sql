
-- Add slot column for multi-lot strategies (007 dual-lot: scalp + runner)
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT 'main';
CREATE INDEX IF NOT EXISTS idx_positions_agent_slot ON public.positions(agent_id, slot) WHERE status IN ('open','pending');

-- Activate real strategy modes with sensible defaults
UPDATE public.agents SET strategy_params = jsonb_build_object(
  'mode', 'compression_alignment',
  'compressionMax', 0.5,
  'pressureMin', 0.4,
  'positionEdge', 0.33,
  'tsslMin', 0.5,
  'stakeMult', 1.0
), status = 'live' WHERE slug = 'nexx';

UPDATE public.agents SET strategy_params = jsonb_build_object(
  'mode', 'rsi_divergence_dual',
  'divergenceWindow', 600,
  'extremeBand', 0.08,
  'scalperTpR', 1.2,
  'scalperSlR', 0.8,
  'runnerTpR', 5.0,
  'runnerSlR', 2.0,
  'runnerStakeMult', 0.7,
  'stakeMult', 1.0
), status = 'live' WHERE slug = '007';

UPDATE public.agents SET strategy_params = jsonb_build_object(
  'mode', 'zone_exhaustion',
  'h4RsiHi', 68,
  'h4RsiLo', 32,
  'streakMin', 3,
  'm5RsiHi', 75,
  'm5RsiLo', 25,
  'stakeMult', 1.0
), status = 'live' WHERE slug = 'sniper';
