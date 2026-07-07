
-- Apply least-privilege EXECUTE grants on SECURITY DEFINER functions.
-- Default Postgres grants EXECUTE to PUBLIC; revoke and grant only to the roles
-- that actually need to call each function.

-- Anonymous client-token flows (called from the client portal without sign-in)
REVOKE EXECUTE ON FUNCTION public.get_client_submission(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_submission(uuid) TO anon;

REVOKE EXECUTE ON FUNCTION public.set_client_submission_status(uuid, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_submission_status(uuid, text) TO anon;

REVOKE EXECUTE ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) TO anon;

REVOKE EXECUTE ON FUNCTION public.get_client_responses(uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_responses(uuid) TO anon;

REVOKE EXECUTE ON FUNCTION public.save_client_response(uuid, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_response(uuid, text, text) TO anon;

-- Authenticated-only flows
REVOKE EXECUTE ON FUNCTION public.advisor_reset_client_responses(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_reset_client_responses(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.submit_my_client_submission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_my_client_submission() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_client_submission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_client_submission(text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_my_client_submission() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_client_submission() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.advisor_unlock_submission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advisor_unlock_submission(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_my_client_submission(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_my_client_submission(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_my_client_valuation(text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_client_valuation(text, numeric) TO authenticated;

-- has_role is only used inside RLS policies / other SECURITY DEFINER functions.
-- Keep EXECUTE for authenticated (RLS policies evaluate as the caller),
-- but block anon and PUBLIC.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
