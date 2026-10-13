-- One optional line of explanation shown beneath a question in the
-- questionnaire (for example, what counts as recurring revenue).
alter table public.questions add column if not exists help_text text;
comment on column public.questions.help_text is
  'Optional explanatory line shown beneath the question.';
