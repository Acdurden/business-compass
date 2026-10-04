-- ---------------------------------------------------------------------------
-- Research desk market tables (step 1). Empty until step 2 loads the seed
-- files in docs/research-desk/seed.
--
-- Three properties hold for every table here:
--
-- 1. Service-role only. RLS enabled with no policies, and no grants to anon
--    or authenticated, the same pattern as email_templates and invite_codes.
--    They are read and written only inside admin-gated server functions; the
--    browser never queries them.
-- 2. Append-only history. A new SBA quarter, a new wage survey or a new
--    published figure adds rows. Nothing is updated in place, pages read the
--    latest snapshot, and a correction is a new row with a note.
-- 3. Every row says where it came from and when it was loaded.
-- ---------------------------------------------------------------------------

-- SBA 7(a) "Change of Ownership" loans in the eight tracked industry groups,
-- one row per acquisition (same-day loans to one buyer collapsed).
-- Source: SBA 7(a) and 504 FOIA files. Seed: seed/sba_acquisitions.csv.
create table if not exists public.market_acquisitions (
  id bigint generated always as identity primary key,
  source_as_of date not null,
  industry_group text not null,
  naics_code text not null,
  naics_description text,
  borrower_name text not null,
  borrower_city text,
  borrower_state text,
  approval_date date not null,
  approval_fy int not null,
  loan_amount numeric not null,
  loan_count int not null default 1,
  lender text,
  initial_rate numeric,
  term_months int,
  jobs_supported int,
  status text not null,
  sba_express boolean not null default false,
  has_revolver boolean not null default false,
  loaded_at timestamptz not null default now()
);
create index if not exists market_acquisitions_snapshot_idx
  on public.market_acquisitions (source_as_of, industry_group);

comment on table public.market_acquisitions is
  'SBA-financed acquisitions (Change of Ownership 7(a) loans), one row per acquisition. Append-only by source_as_of snapshot. Service-role access only.';
comment on column public.market_acquisitions.source_as_of is
  'The SBA file''s AsOfDate. One snapshot per quarter; pages read the latest.';
comment on column public.market_acquisitions.approval_fy is
  'SBA fiscal year, October to September.';
comment on column public.market_acquisitions.loan_amount is
  'Sum of the loans collapsed into this acquisition. A loan, not a purchase price.';
comment on column public.market_acquisitions.status is
  'Active | Paid in full | Charged off | Not yet disbursed';

-- The all-industry trend the agency median is compared against.
-- Seed: seed/sba_all_industry_by_fy.csv.
create table if not exists public.market_acquisitions_all_industry (
  source_as_of date not null,
  approval_fy int not null,
  acquisitions int not null,
  median_loan numeric not null,
  loaded_at timestamptz not null default now(),
  primary key (source_as_of, approval_fy)
);

comment on table public.market_acquisitions_all_industry is
  'SBA Change of Ownership loans across all industries, by fiscal year. Append-only by snapshot. Service-role access only.';

-- What the owner's job pays on the open market.
-- Source: BLS Occupational Employment and Wage Statistics. Seed: seed/bls_owner_pay.csv.
create table if not exists public.market_owner_pay (
  survey_year int not null,
  area_type text not null,
  area_code text not null,
  area_name text not null,
  state_code text,
  industry_code text not null,
  industry_name text,
  occupation_code text not null,
  occupation_name text not null,
  p10 numeric,
  p25 numeric,
  p50 numeric,
  p75 numeric,
  p90 numeric,
  mean numeric,
  employment numeric,
  loaded_at timestamptz not null default now(),
  primary key (survey_year, area_type, area_code, industry_code, occupation_code)
);

comment on table public.market_owner_pay is
  'BLS OEWS annual wages by occupation and area. Append-only by survey_year. Service-role access only.';
comment on column public.market_owner_pay.area_type is
  'N national, S state, M metro or nonmetro area';
comment on column public.market_owner_pay.industry_code is
  '000000 = all industries. Other industry codes are national only.';

-- Interest rate series. Prime from FRED. Seed: seed/prime_rate_history.csv.
create table if not exists public.market_rates (
  series text not null,
  effective_date date not null,
  value numeric not null,
  source text,
  loaded_at timestamptz not null default now(),
  primary key (series, effective_date)
);

comment on table public.market_rates is
  'Rate history, one row per change. series = ''prime''. Service-role access only.';

-- Published market figures, hand-entered through the Insights "Add figures"
-- form. Append-only.
create table if not exists public.market_figures (
  id bigint generated always as identity primary key,
  metric_key text not null,
  metric_name text not null,
  unit text not null,
  period_label text not null,
  period_end date not null,
  value numeric not null,
  source_name text not null,
  source_url text,
  note text,
  entered_by uuid,
  entered_at timestamptz not null default now()
);
create index if not exists market_figures_metric_idx
  on public.market_figures (metric_key, period_end);

comment on table public.market_figures is
  'Published market figures entered by an admin. Append-only. Service-role access only.';
comment on column public.market_figures.unit is
  'x | $ | % | count';

-- Published sale multiple bands by size. Seed: seed/published_multiples.json.
create table if not exists public.market_multiple_bands (
  id bigint generated always as identity primary key,
  source_key text not null,
  source_name text not null,
  source_url text,
  published date,
  segment text not null,
  size_basis text not null default 'EBITDA',
  size_min numeric not null,
  size_max numeric,
  multiple_low numeric,
  multiple_high numeric,
  multiple_mid numeric,
  note text,
  entered_by uuid,
  entered_at timestamptz not null default now()
);

comment on table public.market_multiple_bands is
  'Published sale multiple ranges by size band. Market reference only; never feeds a client valuation. Append-only. Service-role access only.';
comment on column public.market_multiple_bands.size_max is
  'Null means "and up".';
comment on column public.market_multiple_bands.multiple_mid is
  'For sources that publish a single median rather than a range.';

alter table public.market_acquisitions enable row level security;
alter table public.market_acquisitions_all_industry enable row level security;
alter table public.market_owner_pay enable row level security;
alter table public.market_rates enable row level security;
alter table public.market_figures enable row level security;
alter table public.market_multiple_bands enable row level security;

revoke all on
  public.market_acquisitions,
  public.market_acquisitions_all_industry,
  public.market_owner_pay,
  public.market_rates,
  public.market_figures,
  public.market_multiple_bands
from anon, authenticated;
