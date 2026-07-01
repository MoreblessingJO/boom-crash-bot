
DROP POLICY IF EXISTS "engine_runs public read" ON public.engine_runs;
DROP POLICY IF EXISTS "learning_buckets public read" ON public.learning_buckets;
DROP POLICY IF EXISTS "positions public read" ON public.positions;
DROP POLICY IF EXISTS "settings public read" ON public.settings;
DROP POLICY IF EXISTS "signals public read" ON public.signals;
DROP POLICY IF EXISTS "symbol_state public read" ON public.symbol_state;

REVOKE SELECT ON public.engine_runs, public.learning_buckets, public.positions, public.settings, public.signals, public.symbol_state FROM anon;

GRANT SELECT ON public.engine_runs, public.learning_buckets, public.positions, public.settings, public.signals, public.symbol_state TO authenticated;

CREATE POLICY "engine_runs authenticated read" ON public.engine_runs FOR SELECT TO authenticated USING (true);
CREATE POLICY "learning_buckets authenticated read" ON public.learning_buckets FOR SELECT TO authenticated USING (true);
CREATE POLICY "positions authenticated read" ON public.positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings authenticated read" ON public.settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "signals authenticated read" ON public.signals FOR SELECT TO authenticated USING (true);
CREATE POLICY "symbol_state authenticated read" ON public.symbol_state FOR SELECT TO authenticated USING (true);
