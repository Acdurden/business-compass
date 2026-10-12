-- Q8A / Q8B: one combined score from two questions (agreed 10 October 2026).
--
-- Q8A (the existing question Q8) sets a baseline from average operating margin.
-- Q8B adjusts it by +1, 0 or -1 for the trend. The pair is worth at most Q8A's
-- max_score (4), never less than 0, and is counted once.
--
-- How it is stored, so that every existing place that adds up points_awarded
-- by section gets the right total without changing:
--   * Q8A's response keeps its own points (the baseline).
--   * Q8B's answer options carry the raw modifier as their points.
--   * Q8B's response stores the EFFECTIVE adjustment:
--       clamp(baseline + modifier, 0, Q8A max) - baseline
--     so baseline + Q8B points = the final Q8 score.
--   * Q8B's max_score is 0, so the section maximum does not grow.
-- Baseline, raw modifier (via answer_option_id) and final score are all
-- recoverable from the stored rows.
--
-- The rule is generic: any question whose modifies_question_id is set behaves
-- this way against the question it names.

alter table public.questions add column if not exists modifies_question_id text
  references public.questions(question_id);
comment on column public.questions.modifies_question_id is
  'Set on a modifier question (Q8B). Its answer points adjust the named base question, capped between 0 and the base question''s max_score. A modifier question has max_score 0.';

alter table public.questions add column if not exists help_text text;
comment on column public.questions.help_text is
  'Optional explanatory line shown beneath the question.';

create or replace function public.apply_score_modifier()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub text;
  v_qid text;
  v_base text;
  v_mod text;
  v_base_max numeric;
  v_base_pts numeric;
  v_raw numeric;
  v_effective numeric;
begin
  -- The update below fires this trigger again; ignore that inner call.
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  if tg_op = 'DELETE' then
    v_sub := old.submission_id;
    v_qid := old.question_id;
  else
    v_sub := new.submission_id;
    v_qid := new.question_id;
  end if;

  select q.modifies_question_id into v_base from public.questions q where q.question_id = v_qid;
  if v_base is not null then
    v_mod := v_qid;
  else
    select q.question_id, q.modifies_question_id into v_mod, v_base
    from public.questions q where q.modifies_question_id = v_qid limit 1;
  end if;
  if v_mod is null then
    return null;
  end if;

  select coalesce(q.max_score, 0) into v_base_max from public.questions q where q.question_id = v_base;
  select r.points_awarded into v_base_pts
  from public.responses r where r.submission_id = v_sub and r.question_id = v_base;
  select o.points into v_raw
  from public.responses r join public.answer_options o on o.id = r.answer_option_id
  where r.submission_id = v_sub and r.question_id = v_mod;

  -- No baseline yet: the pair is incomplete and contributes nothing until it is
  -- answered. The questionnaire cannot be submitted with either one missing.
  if v_base_pts is null then
    v_effective := 0;
  else
    v_effective := greatest(0, least(v_base_max, v_base_pts + coalesce(v_raw, 0))) - v_base_pts;
  end if;

  update public.responses
  set points_awarded = v_effective, updated_at = now()
  where submission_id = v_sub and question_id = v_mod
    and points_awarded is distinct from v_effective;

  return null;
end
$$;

drop trigger if exists responses_apply_score_modifier on public.responses;
create trigger responses_apply_score_modifier
after insert or update of answer_option_id, points_awarded or delete on public.responses
for each row execute function public.apply_score_modifier();
