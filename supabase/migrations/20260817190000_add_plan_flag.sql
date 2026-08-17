-- ---------------------------------------------------------------------------
-- Plan flag: objective-only vs full-service.
--
-- A client's plan is decided by the invite link they signed up through. The
-- value travels: invite_codes.plan -> the auth user's app_metadata.plan (set
-- server-side at registration) -> submissions.plan (stamped when the client
-- starts their assessment).
--
-- app_metadata is used deliberately rather than user_metadata: a signed-in user
-- can update their own user_metadata via the Supabase client, which would let a
-- client promote themselves from 'objective' to 'full' for free. app_metadata is
-- writable only with the service role.
--
-- Existing rows default to 'full' so nothing changes for anyone already in the
-- system.
-- ---------------------------------------------------------------------------

alter table public.invite_codes
  add column if not exists plan text not null default 'full';

alter table public.invite_codes
  drop constraint if exists invite_codes_plan_check;
alter table public.invite_codes
  add constraint invite_codes_plan_check check (plan in ('objective', 'full'));

alter table public.submissions
  add column if not exists plan text not null default 'full';

alter table public.submissions
  drop constraint if exists submissions_plan_check;
alter table public.submissions
  add constraint submissions_plan_check check (plan in ('objective', 'full'));

comment on column public.invite_codes.plan is
  'Plan granted to clients who sign up through this link: objective | full.';
comment on column public.submissions.plan is
  'Plan this submission is served under: objective | full. Stamped at creation from the owner''s app_metadata.plan.';

-- Seed an objective-only sign-up link alongside the existing full-service one.
insert into public.invite_codes (code, label, active, plan)
values ('KR-OBJ-4B18', 'Objective-only client sign-up link', true, 'objective')
on conflict (code) do nothing;

update public.invite_codes
   set label = 'Full-service client sign-up link'
 where code = 'KR-7F3A-9C21'
   and label = 'Default client sign-up link';

-- ---------------------------------------------------------------------------
-- start_my_client_submission: unchanged behaviour, except the new submission
-- now records the plan carried on the signed-in user's app_metadata.
-- Anything missing or unrecognised falls back to 'full', so an account created
-- before this migration keeps the behaviour it has today.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_my_client_submission(p_company_name text)
 RETURNS TABLE(submission_id text, client_token uuid, client_status text, company_name text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_sub_id text;
  v_found boolean;
  v_plan text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF NOT public.has_role(v_user, 'client'::app_role) THEN
    RAISE EXCEPTION 'only client accounts can use this';
  END IF;

  RETURN QUERY
    SELECT s.submission_id, s.client_token, s.client_status, s.company_name
    FROM public.submissions s
    WHERE s.owner_user_id = v_user
    ORDER BY s.created_at ASC NULLS LAST
    LIMIT 1;
  GET DIAGNOSTICS v_found = ROW_COUNT;
  IF v_found THEN RETURN; END IF;

  IF p_company_name IS NULL OR length(trim(p_company_name)) = 0 OR length(p_company_name) > 200 THEN
    RAISE EXCEPTION 'invalid company name';
  END IF;

  -- Plan comes from app_metadata (service-role writable only). Never trust
  -- user_metadata here.
  v_plan := coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'plan', ''),
    'full'
  );
  IF v_plan NOT IN ('objective', 'full') THEN
    v_plan := 'full';
  END IF;

  v_sub_id := upper(substring(md5(random()::text || clock_timestamp()::text) for 10));

  RETURN QUERY
    INSERT INTO public.submissions(submission_id, company_name, client_status, owner_user_id, plan)
    VALUES (v_sub_id, trim(p_company_name), 'inprogress', v_user, v_plan)
    RETURNING submissions.submission_id, submissions.client_token,
              submissions.client_status, submissions.company_name;
END $function$;
