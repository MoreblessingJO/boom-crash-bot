CREATE TABLE public.user_risk_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  risk_appetite SMALLINT NOT NULL DEFAULT 5 CHECK (risk_appetite BETWEEN 1 AND 10),
  trading_goal TEXT NOT NULL DEFAULT 'capital_growth',
  experience TEXT NOT NULL DEFAULT 'intermediate',
  monthly_target NUMERIC NOT NULL DEFAULT 2000,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_risk_profiles TO authenticated;
GRANT ALL ON public.user_risk_profiles TO service_role;

ALTER TABLE public.user_risk_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own risk profile"
  ON public.user_risk_profiles FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);