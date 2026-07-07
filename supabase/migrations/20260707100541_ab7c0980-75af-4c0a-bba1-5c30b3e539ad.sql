GRANT SELECT ON public.engine_heartbeat TO anon;
GRANT SELECT ON public.engine_heartbeat TO authenticated;
GRANT ALL ON public.engine_heartbeat TO service_role;

DROP POLICY IF EXISTS "engine_heartbeat public read" ON public.engine_heartbeat;
CREATE POLICY "engine_heartbeat public read"
ON public.engine_heartbeat
FOR SELECT
TO anon, authenticated
USING (true);