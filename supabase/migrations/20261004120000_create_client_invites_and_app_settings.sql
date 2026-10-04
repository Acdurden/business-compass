-- ---------------------------------------------------------------------------
-- Per-person client invites, and one small table for app-wide settings.
--
-- CLIENT INVITES. Until now a client signed up through one of two reusable
-- codes in invite_codes, one per plan. Everyone on a plan held the same link,
-- it never expired, and nothing recorded who had been invited or whether the
-- invite had gone out. The invite email also tells its reader the link is
-- theirs, which was not true.
--
-- Each row here is one invitation to one person. The token is the link. It
-- carries the address it was issued to and the plan, works once, and can be
-- revoked. The row also records when the invite email last went out and how
-- many times, which is the first record of any send that Kriterion keeps.
--
-- invite_codes is left exactly as it is. The reusable links keep working for
-- the cases where someone cannot be invited by name.
--
-- APP SETTINGS. A key and a JSON value. The first thing in it is how the
-- emails look (plain or branded invite, band or logo header), set from the
-- Emails screen.
--
-- Both tables follow invite_codes and email_templates: RLS enabled with no
-- policies, and no grants to anon or authenticated, so the browser cannot read
-- or write them at all. They are reached
-- only through server functions that check the caller's role and then use the
-- service role.
-- ---------------------------------------------------------------------------

create table if not exists public.client_invites (
  token text primary key,
  email text not null,
  first_name text,
  plan text not null default 'full' check (plan in ('objective', 'full')),
  created_by uuid,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  send_count integer not null default 0,
  accepted_at timestamptz,
  accepted_user_id uuid,
  revoked_at timestamptz
);

create index if not exists client_invites_email_idx on public.client_invites (lower(email));

alter table public.client_invites enable row level security;
revoke all on public.client_invites from anon, authenticated;

comment on table public.client_invites is
  'One row per person invited. The token is their sign-up link: single use, tied to the email it was issued to, and it sets their plan. Service-role access only.';

comment on column public.client_invites.sent_at is
  'When the invite email last went out through Kriterion. Null when the link was only copied.';

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

comment on table public.app_settings is
  'App-wide settings as key and JSON value. A missing key means the default in code. Service-role access only.';
