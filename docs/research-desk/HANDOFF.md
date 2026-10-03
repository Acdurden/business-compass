# Research desk: build handoff

Written 3 October 2026 for a new Claude Code session working in this repo. Read this file first, then `context/conventions.md`, then open the two previews in a browser.

## What you are building

Two new admin-only sections in the Kriterion advisor app, plus three cards on the advisor's client page. Together Andrew calls this the research desk: public market data and Kriterion's own history, in one place, for whoever is reviewing a client.

| Section | Route | Tabs |
|---|---|---|
| Market data | `/admin/market-data` | Acquisitions, Multiples, Owner pay, Financing |
| Insights | `/admin/insights` | Our assessments, Market figures |
| Client-page cards | on `advisor.plan.$submissionId` | Market context, Comparable acquisitions, Owner pay check |

The approved designs are the two HTML previews in `previews/`. **They are the specification.** Open them:

- `previews/market-data-preview.html` (needs `sba_data.js` and `bls_data.js` beside it, which are there)
- `previews/insights-preview.html`
- `previews/multiples-tab.png` is a still of the Multiples tab

Each preview has a "What gets built" tab. Those tabs are notes for Andrew and are not part of the app.

## Decisions already made (Andrew, 3 October 2026)

1. **The previews are approved as they are.** Build what they show. Andrew will ask for edits after it is set up. Do not redesign.
2. **Admin only for now.** Every route, nav item, server function and card is visible to the `admin` role only. Advisors who are not admins see none of it. This is temporary, so keep the gate in one place per layer and easy to widen later.
3. **All nine existing assessments are tests.** Mark them so. The first real pilot client is the first one that counts.
4. **Track all eight industry groups** in the preview. Agencies are the default selection.
5. **Buyer (borrower) names are shown.** They are public records, and the audience is admins.
6. **The proposed grade column stays** in the Insights table, labelled "Proposed grade", as in the preview. It is internal. The letter-grade rating is not approved for clients; nothing about it may reach a client surface.

## Rules that are easy to break

Full list in `context/conventions.md`. The ones this build touches:

- **Andrew is not technical.** Do the technical work for him. Never ask him to run SQL or commands. Explain outcomes in plain language.
- **Never run git commands in this repo, and never commit or push.** Andrew commits in GitHub Desktop. Leave every change uncommitted and give him a summary and a commit message in copy-ready code blocks. To see what is committed, read `.git/logs/HEAD` as a text file.
- **Run the whole pre-push checklist before handing anything over:** `bunx tsc --noEmit`, `bun run build` (regenerates `src/routeTree.gen.ts`, which must ship), `bunx eslint .` on the whole repo, then check real numbers against the preview. Report the results.
- **LF line endings only.**
- **No em dashes** in anything a person reads in the app.
- **All money through `formatCurrency` / `formatValuationRange` in `src/lib/score-display.ts`.** Do not format money inline. The previews use their own formatter; the app must not.
- **Do not re-implement scoring or valuation.** Use `computeValuation` from `src/lib/valscore_calc` and the same "is this genuinely reviewed" rule as `src/lib/client-report.ts` (around line 187). A review on 18 September found nine places computing valuations with different defaults; do not add a tenth.
- **Two products.** The Objective Score and the ValScore are separate. Never show them side by side or as a change from one to the other. The Insights table shows one "result shown" per assessment: the ValScore if an advisor has genuinely reviewed it, otherwise the Objective Score.
- **Nothing in this build changes a score, a section total, a multiple, a valuation or anything a client sees.**
- **Every figure names its source and date on screen.** No number without a source.
- **The band and the proposed grade are internal.** Never on a client route.

## How the app is put together

- TanStack Start with file-based routes in `src/routes`. React 19, Tailwind 4, shadcn components in `src/components/ui`. `recharts` is already a dependency. The previews draw charts as plain SVG; either approach is fine if the result matches.
- Deployed as a Cloudflare Worker named `kriterion`. Pushing the `cloudflare-migration` branch deploys it.
- Database: Supabase project **Kriterion**, id `lbopzuffyprpbhxdsknv`. Types in `src/integrations/supabase/types.ts` (generated; regenerate after schema changes).
- **Admin route pattern:** copy `src/routes/admin.emails.tsx`: `ssr: false`, `beforeLoad: ({ location }) => requireAdminAuth(location.href)`, `<BackOfficeNav active="..."/>`.
- **Nav:** `src/components/back-office-nav.tsx`. Add `"market-data"` and `"insights"` to `BackOfficeSection` and to `items` with `show: admin === true`.
- **Server functions:** copy `src/lib/questionnaire-admin.functions.ts`: `createServerFn` with `requireSupabaseAuth`, then `ensureAdmin(context)`, then the service-role client from `src/integrations/supabase/client.server.ts`. The route guard is only a courtesy; `ensureAdmin` is the real boundary.
- **New tables are service-role only:** RLS enabled, no policies. Same as `email_templates` (`supabase/migrations/20260818150000_create_email_templates.sql`). The browser never queries them directly.
- Roles: `app_role` is `advisor | client | admin`, checked with the `has_role` RPC.

## Build order

One step at a time. After each step: run the checklist, hand over, wait for Andrew to commit and push, then confirm the live page before starting the next.

### Step 1. Foundations
- Migration files in `supabase/migrations/` based on `schema-proposal.sql`: `submissions.is_test`, and the market tables.
- Set `is_test = true` on the nine existing submissions.
- An admin-only "Test" switch on each row of `/admin/submissions`.
- Regenerate `types.ts`.
- **Applying migrations to the live database:** if this session has Supabase tools, apply them and say so. If it does not, stop and tell Andrew plainly: "The database change is written but not applied. Go back to the Kriterion project chat in Cowork and say: apply the research desk migrations." That chat has database access. Do not hand him SQL.

### Step 2. Load the data
- Load `seed/sba_acquisitions.csv`, `seed/sba_all_industry_by_fy.csv`, `seed/bls_owner_pay.csv`, `seed/prime_rate_history.csv` and `seed/published_multiples.json` into the new tables. Same rule as above if this session cannot reach the database.
- Verify row counts: 3,277 acquisitions, 9 all-industry rows, 7,407 owner pay rows, 18 prime rows.
- Then the scheduled refresh: `.github/workflows/research-desk-refresh.yml`.
  - SBA quarterly. Find the current file links on https://data.sba.gov/dataset/7a-504-foia (the file names carry a date that changes). Run the same method as `scripts/build_sba_extract.py`. Insert a new snapshot only when `source_as_of` is newer than the latest loaded.
  - BLS yearly, same method as `scripts/build_bls_extract.py`.
  - Prime weekly from `https://fred.stlouisfed.org/graph/fredgraph.csv?id=PRIME`.
  - It must **fail loudly** (a failed run Andrew gets an email about) when a file is missing or the row count drops sharply. A silent empty load is the failure to avoid.
  - Scheduled workflows only run on the repository's default branch. Check which branch is the default before relying on the schedule.
  - It needs two repository secrets: the Supabase URL and the service-role key. Andrew adds them in GitHub. Write the click-by-click for him.
  - The Python scripts are the reference implementation. Keep them, or port them to TypeScript and run with bun; either way the output must match the seed files for the 2026-06-30 snapshot.

### Step 3. Market data page (`/admin/market-data`)
Four tabs exactly as in `previews/market-data-preview.html`.
- **Acquisitions:** filters (industry, type of firm, state, years), six tiles, acquisitions per fiscal year, median loan against all industries, loan size histogram, lenders table, states table, searchable sortable paged deal list, the "Read these records carefully" note, the "How to use it with a client" line. Always read the latest snapshot. 3,277 rows is small enough to send to the browser for the selected industry group and filter there.
- **Multiples:** margin presets and custom margin, client revenue, optional Palmer range and First Page Sage type; the chart on a log revenue axis from $500K to $50M with the $2M to $10M target range shaded; "Where size starts to change the multiple"; "What it means for this client"; the two tables; both notes.
- **Owner pay:** role, place (national, states, metro areas), owner's pay; the range chart; the EBITDA adjustment; the national-by-industry table.
- **Financing:** four tiles, prime chart, buyer ceiling chart (formula in `DATA-SOURCES.md`, computed in code from the prime table), median rate charged by fiscal year for the industry selected on Acquisitions.
- Add one line the preview lacks, under the Acquisitions tiles: charge-off rates for loans made in 2020 and 2021 may be held down by pandemic payment relief.
- The Financing tiles in the preview were written before 1 October 2026. Today the 1.25 coverage rule is in force, so "most a financed buyer can pay" is 5.7x now, and 6.2x is the figure before 1 October 2026. Word the tiles accordingly.

### Step 4. Insights page (`/admin/insights`)
Two tabs from `previews/insights-preview.html`.
- **Our assessments:** tiles, new assessments by week, points lost by category (owner questionnaire, average points not earned), the table of every assessment. "Include test assessments" toggle, default off once a real assessment exists. With no real assessments, show an honest empty state, not zeros dressed as data.
- **Market figures:** one card per figure with history, a status chip, source and cadence, and the admin "Add figures" form that appends a row. The published multiples bands from step 2 also live here for editing.
- Proposed grade thresholds on the 0 to 100 display scale: B under 40, BB 40 to 49, BBB 50 to 59, A 60 to 69, AA 70 to 84, AAA 85 and up. For an Objective Score the grade is capped at A and shown with "(p)".

### Step 5. Client-page cards
On `src/routes/advisor.plan.$submissionId.tsx`, rendered only for admins:
- **Market context:** the "In a client file" tab of the Insights preview. Only when the client entered EBITDA. Includes the "below the agency range" notice exactly as previewed.
- **Comparable acquisitions:** same industry group and same state, last three fiscal years, from the latest snapshot: count, median loan, top lenders, and a link into the Market data page with those filters set. Not in the preview; keep it in the same visual language.
- **Owner pay check:** market median for the closest role in the client's state. Not in the preview either.
- The app does not yet record a client's industry group or state in a form these cards can use. Check what the questionnaire captures before building; if it is not there, build the Market context card only and tell Andrew what is missing.

## Checks that prove it is right

- Agencies, all years, all states: 344 acquisitions, median loan $763K, middle half $350K to $1.73M, median rate 8.00%, 10-year median term, 4.0% charged off (5 of 126), 63 in FY2025, Live Oak Banking Company first with 31.
- Multiples at a 15% margin: step-ups at $3.33M, $6.67M, $16.67M, $33.33M and $66.67M of revenue. A $5,000,000 client: EBITDA $750K, agency range 3x to 5x, $2.25M to $3.75M; next step at $6.67M of revenue (33% more), $4.00M to $6.50M.
- Owner pay: General and Operations Managers, Florida, median $101,580. Owner paid $90,000 gives an adjustment of minus $11,580.
- Buyer ceiling: 6.16 at prime 6.75% and 1.15 coverage; 5.66 at 1.25.
- Insights with tests included: 9 started, 8 submitted, 4 reviewed, 2 waiting, average Objective Score 52, median EBITDA $750K; Financial Quality loses 9.6 points on average. Durden Test 2 (`6E5C855517`): ValScore 75, 2.67x, $1.73M.

## What is in this folder

| Path | What |
|---|---|
| `HANDOFF.md` | This file |
| `DATA-SOURCES.md` | Every source, the method, check figures, limits |
| `schema-proposal.sql` | Proposed tables. Not applied |
| `context/conventions.md` | Andrew's standing rules for this project |
| `previews/` | The approved designs, with their data files |
| `seed/` | The data to load: acquisitions, all-industry trend, owner pay, prime history, published multiples |
| `scripts/` | The Python that produced the seed files from the raw SBA and BLS downloads |

## Outside this build

- Showing letter grades to clients. Waits on Andrew and Adam.
- The size-based valuation model. Changes valuations; needs Dan.
- Census benchmarks and SEC deal prices.
- Opening these pages to non-admin advisors.

## When you finish a step

Tell Andrew, in plain language: what now exists, what he will see, the checklist results, and what to click in GitHub Desktop. Give the commit summary and message in code blocks. Then ask him to say when it is pushed so you can check the live page.
