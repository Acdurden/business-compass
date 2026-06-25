
-- Drop my old tables (replaces them with the canonical schema)
drop table if exists public.section_scores cascade;
drop table if exists public.responses cascade;
drop table if exists public.submissions cascade;
drop table if exists public.answer_options cascade;
drop table if exists public.questions cascade;
drop table if exists public.sections cascade;
drop table if exists public.score_bands cascade;
drop table if exists public.multiple_schedule cascade;

-- ===== SEED / CONFIG =====
create table public.sections (
  section_id          text primary key,
  section_name        text not null,
  questionnaire_type  text not null,
  sort_order          integer not null,
  max_score           numeric not null
);

create table public.questions (
  question_id         text primary key,
  section_id          text not null references public.sections(section_id),
  questionnaire_type  text not null,
  question_number     integer not null,
  max_score           numeric,
  question_text       text not null,
  response_type       text not null default 'SingleSelect',
  sort_order          integer not null,
  active              boolean not null default true
);

create table public.answer_options (
  id                   text primary key,
  question_id          text not null references public.questions(question_id),
  unique_id_responses  text,
  section_id           text,
  option_order         integer not null,
  answer_text          text not null,
  points               numeric,
  value_min            numeric,
  value_max            numeric,
  value_type           text,
  active               boolean not null default true
);

create table public.score_bands (
  id                  text primary key,
  band_type           text not null,
  questionnaire_type  text,
  min_score           numeric not null,
  max_score           numeric not null,
  label               text not null,
  extra_value         text,
  objective_band      numeric,
  adjusted_band       numeric
);

create table public.multiple_schedule (
  net_fee_income_multiple            numeric,
  ebitda_multiple                    numeric,
  multiple                           numeric,
  objective_score                    numeric,
  objective_multiple_band_id         numeric,
  objective_score_range              numeric,
  objective_point_increments         numeric,
  objective_points_available         numeric,
  objective_multiple                 numeric,
  objective_target_multiple          numeric,
  objective_target_multiple_id       numeric,
  objective_target_multiple_band     numeric,
  objective_target_score             numeric,
  adjusted_score                     numeric,
  adjusted_multiple_band_id          numeric,
  adjusted_score_range               numeric,
  adjusted_score_points_increments   numeric,
  adjusted_points_available          numeric,
  adjusted_multiple                  numeric,
  adjusted_target_multiple           numeric,
  adjusted_target_multiple_id        numeric,
  adjusted_target_multiple_band      numeric,
  adjusted_target_score              numeric
);

-- ===== LIVE / APP =====
create table public.submissions (
  submission_id           text primary key,
  company_name            text not null,
  client_status           text not null default 'notstarted'
                          check (client_status in ('notstarted','inprogress','complete')),
  advisor_status          text not null default 'notstarted'
                          check (advisor_status in ('notstarted','inprogress','complete')),
  valuation_input_type    text check (valuation_input_type in ('netfeeincome','ebitda')),
  valuation_input_amount  numeric,
  target_valuation        numeric,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create table public.responses (
  response_id          text primary key,
  submission_id        text not null references public.submissions(submission_id) on delete cascade,
  questionnaire_type   text,
  section_id           text,
  question_id          text not null references public.questions(question_id),
  unique_id_response   text,
  answer_option_id     text not null references public.answer_options(id),
  selected_answer_text text,
  points_awarded       numeric,
  answered_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (submission_id, question_id)
);

create table public.section_scores (
  section_score_id      text primary key,
  submission_id         text not null references public.submissions(submission_id) on delete cascade,
  questionnaire_type    text,
  section_id            text,
  section_name          text,
  actual_score          numeric,
  max_score             numeric,
  potential_improvement numeric
);

create index idx_questions_section_id       on public.questions(section_id);
create index idx_questions_qtype            on public.questions(questionnaire_type);
create index idx_answer_options_question_id on public.answer_options(question_id);
create index idx_responses_submission_id    on public.responses(submission_id);
create index idx_responses_question_id      on public.responses(question_id);
create index idx_section_scores_submission  on public.section_scores(submission_id);

-- ===== GRANTS + RLS (public anonymous questionnaire) =====
grant select on public.sections, public.questions, public.answer_options,
                public.score_bands, public.multiple_schedule to anon, authenticated;
grant select, insert, update on public.submissions to anon, authenticated;
grant select, insert, update, delete on public.responses to anon, authenticated;
grant select, insert, update, delete on public.section_scores to anon, authenticated;
grant all on public.sections, public.questions, public.answer_options,
             public.score_bands, public.multiple_schedule,
             public.submissions, public.responses, public.section_scores to service_role;

alter table public.sections          enable row level security;
alter table public.questions         enable row level security;
alter table public.answer_options    enable row level security;
alter table public.score_bands       enable row level security;
alter table public.multiple_schedule enable row level security;
alter table public.submissions       enable row level security;
alter table public.responses         enable row level security;
alter table public.section_scores    enable row level security;

create policy "ref read sections"          on public.sections          for select using (true);
create policy "ref read questions"         on public.questions         for select using (true);
create policy "ref read answer_options"    on public.answer_options    for select using (true);
create policy "ref read score_bands"       on public.score_bands       for select using (true);
create policy "ref read multiple_schedule" on public.multiple_schedule for select using (true);

create policy "submissions read"   on public.submissions for select using (true);
create policy "submissions insert" on public.submissions for insert with check (true);
create policy "submissions update" on public.submissions for update using (true) with check (true);

create policy "responses read"   on public.responses for select using (true);
create policy "responses insert" on public.responses for insert with check (true);
create policy "responses update" on public.responses for update using (true) with check (true);
create policy "responses delete" on public.responses for delete using (true);

create policy "section_scores read"   on public.section_scores for select using (true);
create policy "section_scores insert" on public.section_scores for insert with check (true);
create policy "section_scores update" on public.section_scores for update using (true) with check (true);
create policy "section_scores delete" on public.section_scores for delete using (true);
