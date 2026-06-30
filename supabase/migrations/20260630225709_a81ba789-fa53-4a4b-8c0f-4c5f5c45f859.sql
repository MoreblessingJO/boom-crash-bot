CREATE TABLE public.engine_heartbeat (
  id integer PRIMARY KEY DEFAULT 1,
  status text NOT NULL DEFAULT 'starting',
  last_tick_epoch bigint,
  symbols_connected integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT engine_heartbeat_singleton CHECK (id = 1)
);
GRANT SELECT ON public.engine_heartbeat TO anon, authenticated;
GRANT ALL ON public.engine_heartbeat TO service_role;
ALTER TABLE public.engine_heartbeat ENABLE ROW LEVEL SECURITY;
CREATE POLICY "engine_heartbeat public read" ON public.engine_heartbeat FOR SELECT USING (true);
INSERT INTO public.engine_heartbeat (id, status) VALUES (1, 'never_started') ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS external_worker_enabled boolean NOT NULL DEFAULT false;