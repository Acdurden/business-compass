CREATE OR REPLACE FUNCTION public.set_my_client_valuation(
  p_input_type text,
  p_input_amount numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_input_type NOT IN ('netfeeincome','ebitda') THEN
    RAISE EXCEPTION 'invalid input type';
  END IF;
  IF p_input_amount IS NULL OR p_input_amount <= 0 THEN
    RAISE EXCEPTION 'amount required';
  END IF;
  UPDATE public.submissions
    SET valuation_input_type = p_input_type,
        valuation_input_amount = p_input_amount,
        updated_at = now()
    WHERE owner_user_id = v_user
      AND client_status <> 'submitted';
END $$;

REVOKE ALL ON FUNCTION public.set_my_client_valuation(text, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_my_client_valuation(text, numeric) TO authenticated;