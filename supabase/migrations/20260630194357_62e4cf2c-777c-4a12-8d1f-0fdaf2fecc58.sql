GRANT EXECUTE ON FUNCTION public.get_client_submission(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_responses(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_response(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_submission_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) TO authenticated;