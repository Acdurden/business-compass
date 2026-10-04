-- ---------------------------------------------------------------------------
-- Test switch on assessments (research desk, step 1).
--
-- A test assessment stays in the app but drops out of every Insights metric,
-- so the pilot numbers start clean with the first real client.
--
-- Only an admin may set it, through the admin-gated server function in
-- src/lib/research-desk.functions.ts, which writes with the service role.
-- The browser cannot be trusted with it: the existing row policies let a
-- client update their own submission and an advisor update any submission,
-- and both hold a table-wide UPDATE grant. A column grant cannot narrow that
-- without re-granting every other column, so a trigger does it instead: for
-- anyone other than the service role (or the migration owner), an insert
-- always starts false and an update always keeps the stored value.
-- ---------------------------------------------------------------------------

alter table public.submissions add column if not exists is_test boolean not null default false;

comment on column public.submissions.is_test is
  'True for internal test assessments. Excluded from every Insights metric. Admin-only switch, written by the service role.';

create or replace function public.guard_submissions_is_test()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_test := false;
  else
    new.is_test := old.is_test;
  end if;
  return new;
end
$function$;

drop trigger if exists guard_submissions_is_test on public.submissions;
create trigger guard_submissions_is_test
  before insert or update on public.submissions
  for each row execute function public.guard_submissions_is_test();

-- Every assessment that exists on 2026-10-03 is a test (Andrew, 2026-10-03).
-- The latest of them was started on 2026-09-25; the cutoff sits clear of both
-- that and anything a real client starts from here on.
update public.submissions
   set is_test = true
 where created_at < '2026-10-01T00:00:00Z'
    or created_at is null;
