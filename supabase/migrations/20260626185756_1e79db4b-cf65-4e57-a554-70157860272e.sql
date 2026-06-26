
-- Config/content tables: authenticated-only reads (remove anonymous access)
DROP POLICY IF EXISTS "Anyone can read sections" ON public.sections;
DROP POLICY IF EXISTS "Anyone can read questions" ON public.questions;
DROP POLICY IF EXISTS "Anyone can read answer_options" ON public.answer_options;
DROP POLICY IF EXISTS "Anyone can read score_bands" ON public.score_bands;

CREATE POLICY "Authenticated can read sections" ON public.sections
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read questions" ON public.questions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read answer_options" ON public.answer_options
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read score_bands" ON public.score_bands
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can read multiple_schedule" ON public.multiple_schedule
  FOR SELECT TO authenticated USING (true);

-- Submissions: replace advisor-own policies with role-based "any advisor" policies,
-- and add client ownership policies.
DROP POLICY IF EXISTS "Advisors read their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors insert their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors update their own submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors delete their own submissions" ON public.submissions;

CREATE POLICY "Advisors read all submissions" ON public.submissions
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors insert submissions" ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors update all submissions" ON public.submissions
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors delete all submissions" ON public.submissions
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Clients read own submission" ON public.submissions
  FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());
CREATE POLICY "Clients insert own submission" ON public.submissions
  FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() AND public.has_role(auth.uid(), 'client'::app_role));
CREATE POLICY "Clients update own submission" ON public.submissions
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- Responses: replace advisor-own policies with role-based, add client ownership.
DROP POLICY IF EXISTS "Advisors read responses for their submissions" ON public.responses;
DROP POLICY IF EXISTS "Advisors insert responses for their submissions" ON public.responses;
DROP POLICY IF EXISTS "Advisors update responses for their submissions" ON public.responses;
DROP POLICY IF EXISTS "Advisors delete responses for their submissions" ON public.responses;

CREATE POLICY "Advisors read all responses" ON public.responses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors insert responses" ON public.responses
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors update all responses" ON public.responses
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors delete all responses" ON public.responses
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Clients read own responses" ON public.responses
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.submission_id = responses.submission_id
      AND s.owner_user_id = auth.uid()
  ));
CREATE POLICY "Clients insert own responses" ON public.responses
  FOR INSERT TO authenticated
  WITH CHECK (
    questionnaire_type = 'objective'
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.submission_id = responses.submission_id
        AND s.owner_user_id = auth.uid()
        AND s.client_status <> 'submitted'
    )
  );
CREATE POLICY "Clients update own responses" ON public.responses
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.submission_id = responses.submission_id
      AND s.owner_user_id = auth.uid()
      AND s.client_status <> 'submitted'
  ))
  WITH CHECK (
    questionnaire_type = 'objective'
    AND EXISTS (
      SELECT 1 FROM public.submissions s
      WHERE s.submission_id = responses.submission_id
        AND s.owner_user_id = auth.uid()
        AND s.client_status <> 'submitted'
    )
  );

-- Section scores: broaden advisor policies to all advisors.
DROP POLICY IF EXISTS "Advisors read section_scores for their submissions" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors insert section_scores for their submissions" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors update section_scores for their submissions" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors delete section_scores for their submissions" ON public.section_scores;

CREATE POLICY "Advisors read all section_scores" ON public.section_scores
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors insert section_scores" ON public.section_scores
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors update section_scores" ON public.section_scores
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'advisor'::app_role));
CREATE POLICY "Advisors delete section_scores" ON public.section_scores
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'advisor'::app_role));

CREATE POLICY "Clients read own section_scores" ON public.section_scores
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.submissions s
    WHERE s.submission_id = section_scores.submission_id
      AND s.owner_user_id = auth.uid()
  ));
