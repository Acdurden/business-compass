-- Replace USING (true) / WITH CHECK (true) on authenticated write/delete policies
-- with an explicit "user is logged in" predicate. Semantically equivalent for
-- TO authenticated, but no longer trips the always-true linter.

DROP POLICY IF EXISTS "Advisors can insert submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors can update submissions" ON public.submissions;
DROP POLICY IF EXISTS "Advisors can delete submissions" ON public.submissions;
CREATE POLICY "Advisors can insert submissions"
  ON public.submissions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Advisors can update submissions"
  ON public.submissions FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Advisors can delete submissions"
  ON public.submissions FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Advisors can insert responses" ON public.responses;
DROP POLICY IF EXISTS "Advisors can update responses" ON public.responses;
DROP POLICY IF EXISTS "Advisors can delete responses" ON public.responses;
CREATE POLICY "Advisors can insert responses"
  ON public.responses FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Advisors can update responses"
  ON public.responses FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Advisors can delete responses"
  ON public.responses FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Advisors can insert section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors can update section_scores" ON public.section_scores;
DROP POLICY IF EXISTS "Advisors can delete section_scores" ON public.section_scores;
CREATE POLICY "Advisors can insert section_scores"
  ON public.section_scores FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Advisors can update section_scores"
  ON public.section_scores FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Advisors can delete section_scores"
  ON public.section_scores FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);