
-- 1. Add owner field on submissions
ALTER TABLE public.submissions
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submissions_owner_user_id
  ON public.submissions(owner_user_id);

-- 2. Allow 'submitted' status for client_status
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_client_status_check;
ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_client_status_check
  CHECK (client_status IN ('notstarted','inprogress','submitted','complete'));

-- 3. Client gets/creates their own submission
CREATE OR REPLACE FUNCTION public.start_my_client_submission(p_company_name text)
RETURNS TABLE(submission_id text, client_token uuid, client_status text, company_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_sub_id text;
  v_found boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_role(v_user, 'client'::app_role) THEN
    RAISE EXCEPTION 'only client accounts can use this';
  END IF;

  RETURN QUERY
    SELECT s.submission_id, s.client_token, s.client_status, s.company_name
    FROM public.submissions s
    WHERE s.owner_user_id = v_user
    ORDER BY s.created_at ASC NULLS LAST
    LIMIT 1;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found THEN RETURN; END IF;

  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 OR length(p_company_name) > 200 THEN
    RAISE EXCEPTION 'invalid company name';
  END IF;

  v_sub_id := upper(substring(md5(random()::text || clock_timestamp()::text) for 10));

  RETURN QUERY
    INSERT INTO public.submissions(submission_id, company_name, client_status, owner_user_id)
    VALUES (v_sub_id, trim(p_company_name), 'inprogress', v_user)
    RETURNING submissions.submission_id, submissions.client_token,
              submissions.client_status, submissions.company_name;
END $$;

-- 4. Get my submission
CREATE OR REPLACE FUNCTION public.get_my_client_submission()
RETURNS TABLE(submission_id text, client_token uuid, client_status text, company_name text)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT s.submission_id, s.client_token, s.client_status, s.company_name
  FROM public.submissions s
  WHERE s.owner_user_id = auth.uid()
  ORDER BY s.created_at ASC NULLS LAST
  LIMIT 1;
$$;

-- 5. Submit/lock my submission
CREATE OR REPLACE FUNCTION public.submit_my_client_submission()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  UPDATE public.submissions
    SET client_status = 'submitted', updated_at = now()
    WHERE owner_user_id = v_user;
END $$;

-- 6. Block edits once submitted (rewrite save_client_response)
CREATE OR REPLACE FUNCTION public.save_client_response(
  p_token uuid, p_question_id text, p_answer_option_id text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_submission_id text;
  v_status text;
  v_q_section text;
  v_q_type text;
  v_opt_id text;
  v_opt_text text;
  v_opt_points numeric;
  v_opt_uid text;
BEGIN
  SELECT submission_id, client_status INTO v_submission_id, v_status
  FROM public.submissions WHERE client_token = p_token;
  IF v_submission_id IS NULL THEN RAISE EXCEPTION 'invalid token'; END IF;
  IF v_status = 'submitted' THEN RAISE EXCEPTION 'submission is locked'; END IF;

  SELECT q.section_id, q.questionnaire_type INTO v_q_section, v_q_type
  FROM public.questions q
  WHERE q.question_id = p_question_id AND q.active = true;
  IF v_q_section IS NULL THEN RAISE EXCEPTION 'invalid question'; END IF;
  IF v_q_type <> 'objective' THEN
    RAISE EXCEPTION 'client can only answer objective questions';
  END IF;

  SELECT id, answer_text, points, unique_id_responses
    INTO v_opt_id, v_opt_text, v_opt_points, v_opt_uid
  FROM public.answer_options
  WHERE id = p_answer_option_id AND question_id = p_question_id AND active = true;
  IF v_opt_id IS NULL THEN RAISE EXCEPTION 'invalid answer option'; END IF;

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

-- 7. Accept 'submitted' in set_client_submission_status; don't downgrade from submitted via the in-progress auto-mark
CREATE OR REPLACE FUNCTION public.set_client_submission_status(p_token uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('notstarted','inprogress','submitted','complete') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  UPDATE public.submissions
    SET client_status = p_status, updated_at = now()
    WHERE client_token = p_token
      AND NOT (p_status = 'inprogress' AND client_status IN ('complete','submitted'));
END $$;

-- 8. Advisor unlock (revert submitted -> inprogress)
CREATE OR REPLACE FUNCTION public.advisor_unlock_submission(p_submission_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.has_role(v_user, 'client'::app_role) THEN
    RAISE EXCEPTION 'only advisors can unlock submissions';
  END IF;
  UPDATE public.submissions
    SET client_status = 'inprogress', updated_at = now()
    WHERE submission_id = p_submission_id;
END $$;

-- 9. Advisor reset (clear client's objective responses)
CREATE OR REPLACE FUNCTION public.advisor_reset_client_responses(p_submission_id text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF public.has_role(v_user, 'client'::app_role) THEN
    RAISE EXCEPTION 'only advisors can reset submissions';
  END IF;
  DELETE FROM public.responses
    WHERE submission_id = p_submission_id AND questionnaire_type = 'objective';
  UPDATE public.submissions
    SET client_status = 'notstarted', updated_at = now()
    WHERE submission_id = p_submission_id;
END $$;
