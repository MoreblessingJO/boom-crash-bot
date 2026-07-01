CREATE OR REPLACE FUNCTION public.apply_position_pnl_to_paper_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'closed'
     AND COALESCE(OLD.status, '') <> 'closed'
     AND NEW.pnl IS NOT NULL THEN
    UPDATE public.settings
    SET paper_balance = paper_balance + NEW.pnl,
        updated_at = now()
    WHERE id = 1;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_position_pnl_to_paper_balance ON public.positions;

CREATE TRIGGER trg_apply_position_pnl_to_paper_balance
AFTER UPDATE OF status, pnl ON public.positions
FOR EACH ROW
WHEN (NEW.status = 'closed' AND COALESCE(OLD.status, '') <> 'closed')
EXECUTE FUNCTION public.apply_position_pnl_to_paper_balance();