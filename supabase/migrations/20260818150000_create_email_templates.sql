-- The wording of the emails Kriterion sends, editable by an admin at
-- /admin/emails.
--
-- Deliberately NOT seeded. The shipped Kriterion default for each template
-- lives in src/lib/email-templates.ts, and a key absent from this table means
-- "still on the default". That keeps one source of truth for the default
-- wording, lets a later release improve it for anyone who has not overridden
-- it, and makes "revert to the Kriterion default" a plain write rather than a
-- delete that leaves a hole.
--
-- Like invite_codes, this table is read and written only by the service-role
-- client inside admin-gated server functions. RLS is enabled with no policies
-- granted to anon or authenticated, so it is invisible to the browser bundle.

create table if not exists public.email_templates (
  key text primary key,
  from_name text not null default 'Kriterion',
  from_email text,
  subject text not null,
  body text not null,
  cta_label text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.email_templates enable row level security;

comment on table public.email_templates is
  'Admin-edited email wording. A missing key falls back to the default in src/lib/email-templates.ts. Service-role access only.';

comment on column public.email_templates.from_email is
  'Null until a mailbox exists that the sending provider is verified to send from. Nothing can be sent while this is null.';
