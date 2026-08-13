-- Client self-sign-up invite codes.
-- A single reusable code gates the public /invite sign-up page: a visitor can
-- only create a client account if they present an active code from this table.
-- The table is read/written only by the service-role client (supabaseAdmin)
-- inside trusted server functions; no RLS policies are granted to anon or
-- authenticated roles, so it is invisible to the browser bundle.

create table if not exists public.invite_codes (
  code text primary key,
  label text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

-- Seed the default reusable client sign-up link code.
insert into public.invite_codes (code, label, active)
values ('KR-7F3A-9C21', 'Default client sign-up link', true)
on conflict (code) do nothing;
