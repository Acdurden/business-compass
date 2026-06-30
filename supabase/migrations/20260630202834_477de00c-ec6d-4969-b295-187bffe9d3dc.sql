-- Extend advisor_status state model: add 'submitted' and 'final', migrate old 'complete' → 'submitted'.
ALTER TABLE public.submissions DROP CONSTRAINT IF EXISTS submissions_advisor_status_check;
UPDATE public.submissions SET advisor_status = 'submitted' WHERE advisor_status = 'complete';
ALTER TABLE public.submissions
  ADD CONSTRAINT submissions_advisor_status_check
  CHECK (advisor_status = ANY (ARRAY['notstarted'::text,'inprogress'::text,'submitted'::text,'final'::text]));