
-- Phase 1: user_deriv_accounts
CREATE TABLE IF NOT EXISTS public.user_deriv_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deriv_loginid TEXT NOT NULL,
  encrypted_token TEXT NOT NULL,
  token_iv TEXT NOT NULL,
  token_tag TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('demo','real')),
  currency TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, deriv_loginid)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_deriv_accounts TO authenticated;
GRANT ALL ON public.user_deriv_accounts TO service_role;
ALTER TABLE public.user_deriv_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own deriv accounts read" ON public.user_deriv_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own deriv accounts insert" ON public.user_deriv_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own deriv accounts update" ON public.user_deriv_accounts FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own deriv accounts delete" ON public.user_deriv_accounts FOR DELETE USING (auth.uid() = user_id);

-- Role system
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('owner','admin','user');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role) $$;

-- Phase 3: idempotency
ALTER TABLE public.positions ADD COLUMN IF NOT EXISTS client_req_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS positions_client_req_id_uidx ON public.positions(client_req_id) WHERE client_req_id IS NOT NULL;
ALTER TABLE public.symbol_state ADD COLUMN IF NOT EXISTS last_buy_at TIMESTAMPTZ;

-- Phase 2: guardrails
ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS halt_engine BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_loss_limit NUMERIC,
  ADD COLUMN IF NOT EXISTS max_open_positions INT,
  ADD COLUMN IF NOT EXISTS max_stake_per_trade NUMERIC,
  ADD COLUMN IF NOT EXISTS max_stake_pct_equity NUMERIC;

CREATE OR REPLACE FUNCTION public.today_pnl()
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(pnl), 0)::NUMERIC
  FROM public.positions
  WHERE status = 'closed'
    AND closed_at >= date_trunc('day', (now() AT TIME ZONE 'UTC'))
$$;

-- Phase 5: live/paper + audit
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS is_live BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.live_trade_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID,
  contract_id TEXT,
  symbol TEXT NOT NULL,
  stake NUMERIC NOT NULL,
  entry NUMERIC,
  exit_price NUMERIC,
  pnl NUMERIC,
  settings_snapshot JSONB,
  event TEXT NOT NULL CHECK (event IN ('open','close')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.live_trade_audit TO authenticated;
GRANT SELECT, INSERT ON public.live_trade_audit TO service_role;
ALTER TABLE public.live_trade_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read audit" ON public.live_trade_audit FOR SELECT
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Phase 7: alert_log
CREATE TABLE IF NOT EXISTS public.alert_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alert_log_type_channel_sent_idx ON public.alert_log (alert_type, channel, sent_at DESC);
GRANT SELECT ON public.alert_log TO authenticated;
GRANT ALL ON public.alert_log TO service_role;
ALTER TABLE public.alert_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owners read alerts" ON public.alert_log FOR SELECT
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));
