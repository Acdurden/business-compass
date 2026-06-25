-- Remove permissive anonymous policies on user-data tables
DROP POLICY IF EXISTS "Anyone can read submissions" ON public.submissions;
DROP POLICY IF EXISTS "Anyone can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Anyone can create submissions" ON public.submissions;

DROP POLICY IF EXISTS "Anyone can read responses" ON public.responses;
DROP POLICY IF EXISTS "Anyone can update responses" ON public.responses;
DROP POLICY IF EXISTS "Anyone can create responses" ON public.responses;

DROP POLICY IF EXISTS "Anyone can read section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Anyone can update section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Anyone can create section_scores" ON public.section_scores;

-- Restrict pricing schedule to authenticated advisors
DROP POLICY IF EXISTS "Anyone can read multiple_schedule" ON public.multiple_schedule;
CREATE POLICY "Advisors can read multiple_schedule"
  ON public.multiple_schedule FOR SELECT TO authenticated USING (true);

-- Re-create user-data table policies for authenticated advisors only
CREATE POLICY "Advisors can read submissions"
  ON public.submissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Advisors can insert submissions"
  ON public.submissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Advisors can update submissions"
  ON public.submissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Advisors can read responses"
  ON public.responses FOR SELECT TO authenticated USING (true);
CREATE POLICY "Advisors can insert responses"
  ON public.responses FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Advisors can update responses"
  ON public.responses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Advisors can read section_scores"
  ON public.section_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "Advisors can insert section_scores"
  ON public.section_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Advisors can update section_scores"
  ON public.section_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Token-gated SECURITY DEFINER functions for the anonymous client flow

CREATE OR REPLACE FUNCTION public.start_client_submission(
  p_submission_id text,
  p_company_name text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_token uuid;
BEGIN
  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 OR length(p_company_name) > 200 THEN
    RAISE EXCEPTION 'invalid company name';
  END IF;
  IF p_submission_id IS NULL OR length(p_submission_id) = 0 OR length(p_submission_id) > 32 THEN
    RAISE EXCEPTION 'invalid submission id';
  END IF;
  INSERT INTO public.submissions(submission_id, company_name, client_status)
  VALUES (p_submission_id, p_company_name, 'inprogress')
  RETURNING client_token INTO v_token;
  RETURN v_token;
END $$;

CREATE OR REPLACE FUNCTION public.get_client_submission(p_token uuid)
RETURNS TABLE(
  company_name text,
  client_status text,
  advisor_status text,
  valuation_input_type text,
  valuation_input_amount numeric,
  target_valuation numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT company_name, client_status, advisor_status,
         valuation_input_type, valuation_input_amount, target_valuation
  FROM public.submissions WHERE client_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.get_client_responses(p_token uuid)
RETURNS TABLE(
  question_id text,
  section_id text,
  questionnaire_type text,
  answer_option_id text,
  points_awarded numeric
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT r.question_id, r.section_id, r.questionnaire_type, r.answer_option_id, r.points_awarded
  FROM public.responses r
  JOIN public.submissions s ON s.submission_id = r.submission_id
  WHERE s.client_token = p_token;
$$;

CREATE OR REPLACE FUNCTION public.save_client_response(
  p_token uuid,
  p_question_id text,
  p_answer_option_id text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_submission_id text;
  v_q_section text;
  v_q_type text;
  v_opt_id text;
  v_opt_text text;
  v_opt_points numeric;
  v_opt_uid text;
BEGIN
  SELECT submission_id INTO v_submission_id
  FROM public.submissions WHERE client_token = p_token;
  IF v_submission_id IS NULL THEN
    RAISE EXCEPTION 'invalid token';
  END IF;

  SELECT q.section_id, q.questionnaire_type INTO v_q_section, v_q_type
  FROM public.questions q
  WHERE q.question_id = p_question_id AND q.active = true;
  IF v_q_section IS NULL THEN
    RAISE EXCEPTION 'invalid question';
  END IF;
  IF v_q_type <> 'objective' THEN
    RAISE EXCEPTION 'client can only answer objective questions';
  END IF;

  SELECT id, answer_text, points, unique_id_responses
    INTO v_opt_id, v_opt_text, v_opt_points, v_opt_uid
  FROM public.answer_options
  WHERE id = p_answer_option_id AND question_id = p_question_id AND active = true;
  IF v_opt_id IS NULL THEN
    RAISE EXCEPTION 'invalid answer option';
  END IF;

  INSERT INTO public.responses(
    response_id, submission_id, question_id, answer_option_id, section_id,
    questionnaire_type, unique_id_response, selected_answer_text, points_awarded,
    answered_at, updated_at
  ) VALUES (
    v_submission_id || '_' || p_question_id, v_submission_id, p_question_id, v_opt_id, v_q_section,
    v_q_type, v_opt_uid, v_opt_text, coalesce(v_opt_points, 0),
    now(), now()
  )
  ON CONFLICT (submission_id, question_id) DO UPDATE SET
    answer_option_id = EXCLUDED.answer_option_id,
    section_id = EXCLUDED.section_id,
    questionnaire_type = EXCLUDED.questionnaire_type,
    unique_id_response = EXCLUDED.unique_id_response,
    selected_answer_text = EXCLUDED.selected_answer_text,
    points_awarded = EXCLUDED.points_awarded,
    updated_at = now();
END $$;

CREATE OR REPLACE FUNCTION public.set_client_submission_status(
  p_token uuid,
  p_status text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('notstarted','inprogress','complete') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.submissions
    SET client_status = p_status, updated_at = now()
    WHERE client_token = p_token
      AND (p_status <> 'inprogress' OR client_status <> 'complete');
END $$;

CREATE OR REPLACE FUNCTION public.update_client_valuation_inputs(
  p_token uuid,
  p_input_type text,
  p_input_amount numeric,
  p_target numeric
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_input_type IS NOT NULL AND p_input_type NOT IN ('netfeeincome','ebitda') THEN
    RAISE EXCEPTION 'invalid input type';
  END IF;
  UPDATE public.submissions
    SET valuation_input_type = p_input_type,
        valuation_input_amount = p_input_amount,
        target_valuation = p_target,
        updated_at = now()
    WHERE client_token = p_token;
END $$;

-- Lock down EXECUTE: revoke from PUBLIC, grant to anon + authenticated explicitly
REVOKE ALL ON FUNCTION public.start_client_submission(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_submission(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_client_responses(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_client_response(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_client_submission_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_client_submission(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_submission(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_responses(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_client_response(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_client_submission_status(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_client_valuation_inputs(uuid, text, numeric, numeric) TO anon, authenticated;