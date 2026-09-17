-- One paragraph per problem, written once for the library and reused for every
-- client, so the result page's findings block costs an advisor nothing per review.
alter table public.action_problems add column if not exists buyer_consequence text;
comment on column public.action_problems.buyer_consequence is
  'What a buyer DOES about this problem. Rendered on the client result page beneath the flagged problem and the client''s own answer. Drafted 2026-08-27, loaded 2026-09-17, still awaiting Dan''s mark-up.';

-- The advisor's one-sentence read on the business, shown at the top of the
-- client result page above the score. Nullable: the page omits the block when
-- it is absent, and the completion gate warns rather than blocks.
alter table public.submissions add column if not exists advisor_verdict text;
comment on column public.submissions.advisor_verdict is
  'Advisor-written verdict sentence shown at the top of the client result page. Written in the plan workspace; null until the advisor writes one.';

-- The 24 paragraphs themselves are data, not schema, and were loaded separately.
-- See claude/buyer-consequences.md for the source text.
