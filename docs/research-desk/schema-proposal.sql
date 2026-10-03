-- Research desk: PROPOSED schema. Nothing here has been applied.
-- Live database: Supabase project "Kriterion", id lbopzuffyprpbhxdsknv.
-- Turn this into dated files under supabase/migrations/ and apply them to the
-- live project. Adjust names and types if the codebase suggests better ones,
-- but keep the three properties stated below.
--
-- 1. Service-role only. RLS enabled, no policies for anon or authenticated,
--    read and written only inside admin-gated server functions. This is the
--    same pattern as email_templates and invite_codes.
-- 2. Append-only history. A new SBA quarter, a new wage survey or a new
--    published figure adds rows. Nothing is updated in place. Pages read the
--    latest snapshot. A correction is a new row with a note.
-- 3. Every row says where it came from and when it was loaded.

-- ---------------------------------------------------------------------------
-- 1. Test switch on assessments
-- ---------------------------------------------------------------------------
alter table public.submissions add column if not exists is_test boolean not null default false;
comment on column public.submissions.is_test is
  'True for internal test assessments. Excluded from every Insights metric. Admin-only switch.';
-- All nine submissions that exist on 2026-10-03 are tests (Andrew, 2026-10-03):
-- update public.submissions set is_test = true where created_at < '2026-10-04';

-- ---------------------------------------------------------------------------
-- 2. SBA-financed acquisitions (seed/sba_acquisitions.csv, 3,277 rows)
-- ---------------------------------------------------------------------------
create table if not exists public.market_acquisitions (
  id bigint generated always as identity primary key,
  source_as_of date not null,          -- the SBA file's AsOfDate; one snapshot per quarter
  industry_group text not null,
  naics_code text not null,
  naics_description text,
  borrower_name text not null,
  borrower_city text,
  borrower_state text,
  approval_date date not null,
  approval_fy int not null,            -- SBA fiscal year, October to September
  loan_amount numeric not null,        -- sum of the loans collapsed into this acquisition
  loan_count int not null default 1,
  lender text,
  initial_rate numeric,
  term_months int,
  jobs_supported int,
  status text not null,                -- Active | Paid in full | Charged off | Not yet disbursed
  sba_express boolean not null default false,
  has_revolver boolean not null default false,
  loaded_at timestamptz not null default now()
);
create index if not exists market_acquisitions_snapshot_idx
  on public.market_acquisitions (source_as_of, industry_group);
alter table public.market_acquisitions enable row level security;

create table if not exists public.market_acquisitions_all_industry (
  source_as_of date not null,
  approval_fy int not null,
  acquisitions int not null,
  median_loan numeric not null,
  loaded_at timestamptz not null default now(),
  primary key (source_as_of, approval_fy)
);
alter table public.market_acquisitions_all_industry enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Owner pay (seed/bls_owner_pay.csv, 7,407 rows, BLS OEWS May 2025)
-- ---------------------------------------------------------------------------
create table if not exists public.market_owner_pay (
  survey_year int not null,
  area_type text not null,             -- N national, S state, M metro or nonmetro area
  area_code text not null,
  area_name text not null,
  state_code text,
  industry_code text not null,         -- 000000 = all industries; others are national only
  industry_name text,
  occupation_code text not null,
  occupation_name text not null,
  p10 numeric, p25 numeric, p50 numeric, p75 numeric, p90 numeric,
  mean numeric,
  employment numeric,
  loaded_at timestamptz not null default now(),
  primary key (survey_year, area_type, area_code, industry_code, occupation_code)
);
alter table public.market_owner_pay enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Rates (seed/prime_rate_history.csv)
-- ---------------------------------------------------------------------------
create table if not exists public.market_rates (
  series text not null,                -- 'prime'
  effective_date date not null,
  value numeric not null,
  source text,
  loaded_at timestamptz not null default now(),
  primary key (series, effective_date)
);
alter table public.market_rates enable row level security;

-- ---------------------------------------------------------------------------
-- 5. Published figures and multiples (seed/published_multiples.json)
--    Hand-entered through the "Add figures" form. Append-only.
-- ---------------------------------------------------------------------------
create table if not exists public.market_figures (
  id bigint generated always as identity primary key,
  metric_key text not null,            -- e.g. 'bbs_cash_flow_multiple'
  metric_name text not null,
  unit text not null,                  -- 'x' | '$' | '%' | 'count'
  period_label text not null,          -- 'Q2 2026', '2026 report'
  period_end date not null,
  value numeric not null,
  source_name text not null,
  source_url text,
  note text,
  entered_by uuid,
  entered_at timestamptz not null default now()
);
alter table public.market_figures enable row level security;

create table if not exists public.market_multiple_bands (
  id bigint generated always as identity primary key,
  source_key text not null,            -- 'fe_international_2026'
  source_name text not null,
  source_url text,
  published date,
  segment text not null,               -- 'Agencies', 'Business services (median)', an agency type
  size_basis text not null default 'EBITDA',
  size_min numeric not null,
  size_max numeric,                    -- null = and up
  multiple_low numeric,
  multiple_high numeric,
  multiple_mid numeric,                -- for sources that publish a single median
  note text,
  entered_by uuid,
  entered_at timestamptz not null default now()
);
alter table public.market_multiple_bands enable row level security;
