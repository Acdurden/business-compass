
-- sections
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sections TO anon, authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sections readable by all" ON public.sections FOR SELECT USING (true);

-- questions
CREATE TABLE public.questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  questionnaire_type text NOT NULL DEFAULT 'objective',
  response_type text NOT NULL DEFAULT 'SingleSelect',
  sort_order int NOT NULL DEFAULT 0,
  max_score numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.questions TO anon, authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions readable by all" ON public.questions FOR SELECT USING (true);
CREATE INDEX ON public.questions(section_id);
CREATE INDEX ON public.questions(questionnaire_type, active, sort_order);

-- answer_options
CREATE TABLE public.answer_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_text text NOT NULL,
  points numeric NOT NULL DEFAULT 0,
  option_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.answer_options TO anon, authenticated;
GRANT ALL ON public.answer_options TO service_role;
ALTER TABLE public.answer_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "answer_options readable by all" ON public.answer_options FOR SELECT USING (true);
CREATE INDEX ON public.answer_options(question_id, option_order);

-- submissions
CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id text NOT NULL UNIQUE,
  company_name text NOT NULL,
  client_status text NOT NULL DEFAULT 'inprogress',
  valuation_input_type text,
  valuation_input_amount numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.submissions TO anon, authenticated;
GRANT ALL ON public.submissions TO service_role;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "submissions insertable by all" ON public.submissions FOR INSERT WITH CHECK (true);
CREATE POLICY "submissions readable by all" ON public.submissions FOR SELECT USING (true);
CREATE POLICY "submissions updatable by all" ON public.submissions FOR UPDATE USING (true) WITH CHECK (true);

-- responses
CREATE TABLE public.responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id text NOT NULL REFERENCES public.submissions(submission_id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  answer_option_id uuid NOT NULL REFERENCES public.answer_options(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  questionnaire_type text NOT NULL DEFAULT 'objective',
  selected_answer_text text NOT NULL,
  points_awarded numeric NOT NULL DEFAULT 0,
  answered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (submission_id, question_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.responses TO anon, authenticated;
GRANT ALL ON public.responses TO service_role;
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responses insertable by all" ON public.responses FOR INSERT WITH CHECK (true);
CREATE POLICY "responses readable by all" ON public.responses FOR SELECT USING (true);
CREATE POLICY "responses updatable by all" ON public.responses FOR UPDATE USING (true) WITH CHECK (true);
CREATE INDEX ON public.responses(submission_id);
CREATE INDEX ON public.responses(section_id);
