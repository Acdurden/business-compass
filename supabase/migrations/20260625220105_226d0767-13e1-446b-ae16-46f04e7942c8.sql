
-- 1. Add advisor ownership to submissions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS advisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_advisor_id ON public.submissions(advisor_id);

-- 2. Replace overly permissive policies on submissions
DROP POLICY IF EXISTS "Advisors can read submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors can insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors can delete submissions" ON public.submissions;

CREATE POLICY "Advisors read their own submissions" ON public.submissions
  FOR SELECT TO authenticated USING (advisor_id = auth.uid());
CREATE POLICY "Advisors insert their own submissions" ON public.submissions
  FOR INSERT TO authenticated WITH CHECK (advisor_id = auth.uid());
CREATE POLICY "Advisors update their own submissions" ON public.submissions
  FOR UPDATE TO authenticated USING (advisor_id = auth.uid()) WITH CHECK (advisor_id = auth.uid());
CREATE POLICY "Advisors delete their own submissions" ON public.submissions
  FOR DELETE TO authenticated USING (advisor_id = auth.uid());

-- 3. Replace policies on responses to scope by owning submission
DROP POLICY IF EXISTS "Advisors can read responses" ON public.responses;
DROP POLICY IF EXISTS "Advisors can insert responses" ON public.responses;
DROP POLICY IF EXISTS "Advisors can update responses" ON public.responses;
DROP POLICY IF EXISTS "Advisors can delete responses" ON public.responses;

CREATE POLICY "Advisors read responses for their submissions" ON public.responses
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = responses.submission_id AND s.advisor_id = auth.uid())
  );
CREATE POLICY "Advisors insert responses for their submissions" ON public.responses
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = responses.submission_id AND s.advisor_id = auth.uid())
  );
CREATE POLICY "Advisors update responses for their submissions" ON public.responses
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = responses.submission_id AND s.advisor_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = responses.submission_id AND s.advisor_id = auth.uid())
  );
CREATE POLICY "Advisors delete responses for their submissions" ON public.responses
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = responses.submission_id AND s.advisor_id = auth.uid())
  );

-- 4. Replace policies on section_scores to scope by owning submission
DROP POLICY IF EXISTS "Advisors can read section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors can insert section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors can update section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors can delete section_scores" ON public.section_scores;

CREATE POLICY "Advisors read section_scores for their submissions" ON public.section_scores
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = section_scores.submission_id AND s.advisor_id = auth.uid())
  );
CREATE POLICY "Advisors insert section_scores for their submissions" ON public.section_scores
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = section_scores.submission_id AND s.advisor_id = auth.uid())
  );
CREATE POLICY "Advisors update section_scores for their submissions" ON public.section_scores
  FOR UPDATE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = section_scores.submission_id AND s.advisor_id = auth.uid())
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = section_scores.submission_id AND s.advisor_id = auth.uid())
  );
CREATE POLICY "Advisors delete section_scores for their submissions" ON public.section_scores
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.submissions s WHERE s.submission_id = section_scores.submission_id AND s.advisor_id = auth.uid())
  );

-- 5. multiple_schedule: remove broad authenticated SELECT; this is reference data
-- accessed only through SECURITY DEFINER server logic. Revoke direct table access.
DROP POLICY IF EXISTS "Advisors can read multiple_schedule" ON public.multiple_schedule;
REVOKE SELECT ON public.multiple_schedule FROM authenticated, anon;
GRANT ALL ON public.multiple_schedule TO service_role;

-- 6. Update start_client_submission to require auth and stamp advisor_id
CREATE OR REPLACE FUNCTION public.start_client_submission(p_submission_id text, p_company_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_token uuid;
  v_advisor uuid := auth.uid();
BEGIN
  IF v_advisor IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 OR length(p_company_name) > 200 THEN
    RAISE EXCEPTION 'invalid company name';
  END IF;
  IF p_submission_id IS NULL OR length(p_submission_id) = 0 OR length(p_submission_id) > 32 THEN
    RAISE EXCEPTION 'invalid submission id';
  END IF;
  INSERT INTO public.submissions(submission_id, company_name, client_status, advisor_id)
  VALUES (p_submission_id, p_company_name, 'inprogress', v_advisor)
  RETURNING client_token INTO v_token;
  RETURN v_token;
END $function$;

-- 7. Lock down EXECUTE on SECURITY DEFINER functions: revoke from PUBLIC, grant only to roles that need them
REVOKE EXECUTE ON FUNCTION public.get_client_submission(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_client_submission(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_client_submission_status(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_responses(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_client_response(uuid, text, text) FROM PUBLIC;

-- Client token functions: callable by anon and authenticated (token is the credential)
GRANT EXECUTE ON FUNCTION public.get_client_submission(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_submission_status(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_responses(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_response(uuid, text, text) TO anon, authenticated;

-- Advisor-only function: authenticated users only
GRANT EXECUTE ON FUNCTION public.start_client_submission(text, text) TO authenticated;
