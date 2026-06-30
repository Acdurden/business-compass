ALTER FUNCTION public.get_client_submission(uuid) SECURITY INVOKER;
ALTER FUNCTION public.set_client_submission_status(uuid, text) SECURITY INVOKER;
ALTER FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) SECURITY INVOKER;
ALTER FUNCTION public.get_client_responses(uuid) SECURITY INVOKER;
ALTER FUNCTION public.save_client_response(uuid, text, text) SECURITY INVOKER;

ALTER FUNCTION public.advisor_reset_client_responses(text) SECURITY INVOKER;
ALTER FUNCTION public.submit_my_client_submission() SECURITY INVOKER;
ALTER FUNCTION public.start_client_submission(text, text) SECURITY INVOKER;
ALTER FUNCTION public.get_my_client_submission() SECURITY INVOKER;
ALTER FUNCTION public.advisor_unlock_submission(text) SECURITY INVOKER;
ALTER FUNCTION public.start_my_client_submission(text) SECURITY INVOKER;
ALTER FUNCTION public.set_my_client_valuation(text, numeric) SECURITY INVOKER;

ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;