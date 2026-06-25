
-- =========================================================
-- Reference / content tables: public read, no writes
-- =========================================================
DROP POLICY IF EXISTS "ref read sections" ON public.sections;
DROP POLICY IF EXISTS "ref read questions" ON public.questions;
DROP POLICY IF EXISTS "ref read answer_options" ON public.answer_options;
DROP POLICY IF EXISTS "ref read score_bands" ON public.score_bands;
DROP POLICY IF EXISTS "ref read multiple_schedule" ON public.multiple_schedule;

CREATE POLICY "Anyone can read sections"
  ON public.sections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can read questions"
  ON public.questions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can read answer_options"
  ON public.answer_options FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can read score_bands"
  ON public.score_bands FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can read multiple_schedule"
  ON public.multiple_schedule FOR SELECT TO anon, authenticated USING (true);

-- =========================================================
-- submissions: anon can create / read / update; advisors full
-- =========================================================
DROP POLICY IF EXISTS "submissions read"   ON public.submissions;
DROP POLICY IF EXISTS "submissions insert" ON public.submissions;
DROP POLICY IF EXISTS "submissions update" ON public.submissions;

CREATE POLICY "Anyone can read submissions"
  ON public.submissions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create submissions"
  ON public.submissions FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update submissions"
  ON public.submissions FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Advisors can delete submissions"
  ON public.submissions FOR DELETE TO authenticated USING (true);

-- =========================================================
-- responses: anon can create / read / update; advisors full
-- =========================================================
DROP POLICY IF EXISTS "responses read"   ON public.responses;
DROP POLICY IF EXISTS "responses insert" ON public.responses;
DROP POLICY IF EXISTS "responses update" ON public.responses;
DROP POLICY IF EXISTS "responses delete" ON public.responses;

CREATE POLICY "Anyone can read responses"
  ON public.responses FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create responses"
  ON public.responses FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update responses"
  ON public.responses FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Advisors can delete responses"
  ON public.responses FOR DELETE TO authenticated USING (true);

-- =========================================================
-- section_scores: anon can create / read / update; advisors full
-- =========================================================
DROP POLICY IF EXISTS "section_scores read"   ON public.section_scores;
DROP POLICY IF EXISTS "section_scores insert" ON public.section_scores;
DROP POLICY IF EXISTS "section_scores update" ON public.section_scores;
DROP POLICY IF EXISTS "section_scores delete" ON public.section_scores;

CREATE POLICY "Anyone can read section_scores"
  ON public.section_scores FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can create section_scores"
  ON public.section_scores FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update section_scores"
  ON public.section_scores FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Advisors can delete section_scores"
  ON public.section_scores FOR DELETE TO authenticated USING (true);
