
-- ============================================================
-- profiles table + auto-create on signup
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "admin reads profiles" ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'owner') OR public.has_role(auth.uid(), 'admin'));

-- Generic updated_at trigger fn
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_profiles_updated ON public.profiles;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_deriv_updated ON public.user_deriv_accounts;
CREATE TRIGGER trg_user_deriv_updated BEFORE UPDATE ON public.user_deriv_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Handle new signup: create profile + optionally grant owner role to first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing_count INT;
BEGIN
  INSERT INTO public.profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO NOTHING;

  SELECT COUNT(*) INTO existing_count FROM public.user_roles WHERE role = 'owner';
  IF existing_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
      ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- Lock down trading tables: revoke anon, add owner/admin read policies
-- ============================================================
REVOKE SELECT ON public.positions FROM anon;
REVOKE SELECT ON public.settings FROM anon;
REVOKE SELECT ON public.signals FROM anon;
REVOKE SELECT ON public.symbol_state FROM anon;
REVOKE SELECT ON public.learning_buckets FROM anon;
REVOKE SELECT ON public.engine_runs FROM anon;
REVOKE SELECT ON public.engine_heartbeat FROM anon;

-- Drop existing broad policies and re-add owner/admin-only read
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE schemaname='public'
      AND tablename IN ('positions','settings','signals','symbol_state','learning_buckets','engine_runs','engine_heartbeat')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Owner/admin can read all trading state
CREATE POLICY "admin read positions" ON public.positions FOR SELECT
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write positions" ON public.positions FOR ALL
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read settings" ON public.settings FOR SELECT
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin write settings" ON public.settings FOR ALL
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read signals" ON public.signals FOR SELECT
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read symbol_state" ON public.symbol_state FOR SELECT
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read learning_buckets" ON public.learning_buckets FOR SELECT
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

CREATE POLICY "admin read engine_runs" ON public.engine_runs FOR SELECT
  USING (public.has_role(auth.uid(),'owner') OR public.has_role(auth.uid(),'admin'));

-- engine_heartbeat: authenticated users can see status widget (no sensitive numbers),
-- but only admin can read all columns via app. Simplest: authenticated read all.
GRANT SELECT ON public.engine_heartbeat TO authenticated;
CREATE POLICY "authenticated read heartbeat" ON public.engine_heartbeat FOR SELECT TO authenticated USING (true);
