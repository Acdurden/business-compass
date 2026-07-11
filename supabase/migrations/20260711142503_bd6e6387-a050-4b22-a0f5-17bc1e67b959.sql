CREATE OR REPLACE FUNCTION public.advisor_reset_advisor_responses(p_submission_id text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_role(v_user, 'advisor'::app_role) THEN
    RAISE EXCEPTION 'advisor role required';
  END IF;
  DELETE FROM public.responses
    WHERE submission_id = p_submission_id AND questionnaire_type = 'advisory';
  UPDATE public.submissions
    SET advisor_status = 'notstarted', updated_at = now()
    WHERE submission_id = p_submission_id;
END $function$;