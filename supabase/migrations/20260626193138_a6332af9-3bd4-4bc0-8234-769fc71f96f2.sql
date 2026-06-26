
-- 1) Grant advisor role to existing advisor account(s) that currently have no role.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'advisor'::public.app_role
FROM auth.users u
LEFT JOIN public.user_roles ur
  ON ur.user_id = u.id AND ur.role = 'advisor'::public.app_role
LEFT JOIN public.user_roles urc
  ON urc.user_id = u.id AND urc.role = 'client'::public.app_role
WHERE u.email = 'adurden@thedurdencompany.com'
  AND ur.user_id IS NULL
  AND urc.user_id IS NULL;

-- 2) Lock advisor RPCs to users who explicitly hold the advisor role.
CREATE OR REPLACE FUNCTION public.advisor_unlock_submission(p_submission_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_role(v_user, 'advisor'::app_role) THEN
    RAISE EXCEPTION 'advisor role required';
  END IF;
  UPDATE public.submissions
    SET client_status = 'inprogress', updated_at = now()
    WHERE submission_id = p_submission_id;
END $function$;

CREATE OR REPLACE FUNCTION public.advisor_reset_client_responses(p_submission_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_role(v_user, 'advisor'::app_role) THEN
    RAISE EXCEPTION 'advisor role required';
  END IF;
  DELETE FROM public.responses
    WHERE submission_id = p_submission_id AND questionnaire_type = 'objective';
  UPDATE public.submissions
    SET client_status = 'notstarted', updated_at = now()
    WHERE submission_id = p_submission_id;
END $function$;
