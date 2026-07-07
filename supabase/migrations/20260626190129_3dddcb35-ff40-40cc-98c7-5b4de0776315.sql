
-- Revoke execute from anon/public on all app SECURITY DEFINER RPCs;
-- grant only to authenticated. has_role stays available to authenticated
-- (used by RLS policies executed under the caller's role).

DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'public.get_client_submission(uuid)',
    'public.get_client_responses(uuid)',
    'public.save_client_response(uuid, text, text)',
    'public.set_client_submission_status(uuid, text)',
    'public.update_client_valuation_inputs(uuid, text, numeric, numeric)',
    'public.start_client_submission(text, text)',
    'public.start_my_client_submission(text)',
    'public.get_my_client_submission()',
    'public.submit_my_client_submission()',
    'public.advisor_reset_client_responses(text)',
    'public.advisor_unlock_submission(text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;
