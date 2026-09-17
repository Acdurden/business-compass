-- Freeze the question wording onto the answer, the way selected_answer_text
-- already freezes the answer wording. Without this, reopening an old submission
-- renders the CURRENT question text beside an answer given to different wording.
--
-- Deliberately nullable and deliberately not backfilled: rows written before
-- this column existed genuinely do not know what the respondent read, and
-- inventing it from today's text would be worse than admitting the gap. Null
-- means "not captured, fall back to the live question".
alter table public.responses add column if not exists question_text text;

comment on column public.responses.question_text is
  'The question wording as the respondent saw it, captured at answer time. Null on rows written before 2026-09-17.';
