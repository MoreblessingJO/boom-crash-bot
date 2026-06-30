SELECT cron.unschedule('trading-agent-tick-engine');
SELECT cron.schedule(
  'trading-agent-tick-engine',
  '30 seconds',
  $$
  SELECT net.http_post(
    url := 'https://project--21180bdb-f66a-4589-836b-52ca425a0cd6-dev.lovable.app/api/public/tick-engine',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imxpemxyam95dnNna3hhZHh1dGh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI4MDkxNzQsImV4cCI6MjA5ODM4NTE3NH0.ilfuxjinW7-1nc7tdGVRFZKJAWJmZG24IPC9nhmam88"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);