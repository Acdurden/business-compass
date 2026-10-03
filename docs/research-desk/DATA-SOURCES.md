# Research desk: data sources, method and known limits

Everything the previews show comes from the sources below. Andrew's standing rule: **if a number's source cannot be named, it does not go in.** Keep the source and date next to every figure in the UI, as the previews do.

## 1. SBA 7(a) loan records (Acquisitions tab)

- **Where:** https://data.sba.gov/dataset/7a-504-foia. The address changed once already (it used to be `/7-a-504-foia`, which now returns 404), so the refresh job must find the files by scraping that page for links, not by a hard-coded file name.
- **Files:** `FOIA_7a_FY2020_Present_asof_YYMMDD.csv` (181 MB on 2026-06-30) and `FOIA_7a_FY2010_FY2019_asof_YYMMDD.csv` (255 MB). The date in the name changes every quarter. Data dictionary: `7a_504_foia_data_dictionary.xlsx` in the same folder.
- **Cadence:** quarterly, usually within a month of quarter end. Seed data is as of 2026-06-30.
- **Acquisition flag:** `BusinessAge == "Change of Ownership"`. The label is only used from fiscal year 2018. All industries: 50,942 such loans, FY2018 to FY2026 Q3.
- **Method:** `scripts/build_sba_extract.py` is the exact code that produced `seed/sba_acquisitions.csv`. Drop cancelled loans, map NAICS to eight groups, collapse same borrower + state + approval date into one acquisition (296 two-loan acquisitions and 1 three-loan acquisition in the seed).
- **Result:** 3,277 acquisitions. Accounting, tax & bookkeeping 902. Insurance agencies 776. Architecture & engineering 395. IT & software services 364. Advertising & marketing agencies 344. Management consulting 217. Financial advisors 163. Law firms 116.
- **Check figures for agencies (all years, all states):** 344 acquisitions; median loan $763K; middle half $350K to $1.73M; median starting rate 8.00%; median term 10 years; 4.0% charged off (5 of 126 loans made FY2018 to FY2021 and disbursed); busiest year FY2025 with 63; top lender Live Oak Banking Company with 31. The built page must reproduce these.
- **All industries by year:** `seed/sba_all_industry_by_fy.csv`. Median loan per acquisition rose from $500,000 (FY2018) to $891,000 (FY2026 to June).
- **Limits, which the page states in plain words:**
  - The loan is not the purchase price. Buyers put in at least 10% cash and sellers often carry a note.
  - Only SBA-financed deals appear. Cash and private-equity deals do not.
  - The lender chooses the label, so partner buyouts coded differently are missing and counts run low.
  - The borrower is usually the buyer's company, often formed for the purchase.
  - Charge-off rates for 2020 and 2021 loans may be held down by pandemic payment relief (CARES Act section 1112). This caveat is in the notes but not yet on the preview page; add it under the tiles.
  - `JobsSupported` is lender-reported and unaudited.

## 2. BLS wage survey (Owner pay tab)

- **Where:** https://download.bls.gov/pub/time.series/oe/ files `oe.data.0.Current` (331 MB), `oe.area`, `oe.occupation`, `oe.industry`. BLS requires a User-Agent header that identifies the requester.
- **What:** Occupational Employment and Wage Statistics, May 2025. Released once a year.
- **Method:** `scripts/build_bls_extract.py` produced `seed/bls_owner_pay.csv` (7,407 rows). Fifteen owner-type occupations, for the nation, every state and about 530 metro and nonmetro areas, all industries. Plus the same occupations nationally for seven industries (5242, 5411, 5412, 5413, 5415, 5416, 5418). Industry detail exists at national level only.
- **Check figures:** General and Operations Managers (11-1021): national mean $134,940; Florida median $101,580, 10th percentile $48,670, 90th percentile $226,080, 236,290 employed.
- **Use:** adjust the owner's own pay to market when working out EBITDA. Adjustment = owner's pay minus the median for the role and place. Negative means reported EBITDA overstates what a buyer gets.
- **Limits:** wages only, no benefits or payroll taxes. Empty cells mean BLS did not publish that value.

## 3. Prime rate and the SBA buyer ceiling (Financing tab)

- **Prime:** FRED series PRIME, https://fred.stlouisfed.org/series/PRIME. CSV without a key: `https://fred.stlouisfed.org/graph/fredgraph.csv?id=PRIME`. Seed: `seed/prime_rate_history.csv`. 6.75% since 2025-12-11.
- **SBA rate cap:** prime plus 3% variable on larger loans (Lendio, September 2026, https://www.lendio.com/blog/sba-loan-interest-rates).
- **SBA rules:** SOP 50 10 8.1, effective 2026-10-01, raises minimum debt service coverage on initial acquisitions and owner buyouts from 1.15 to 1.25; 10% equity injection (FRANdata, https://frandata.com/sba-sop-50-10-8-1-franchise-lending-changes/). SBA 7(a) loans cap at $5 million.
- **Ceiling formula (Kriterion's own arithmetic, label it as such):**
  - monthly rate `r = (prime + 3) / 100 / 12`, `n = 120` months
  - yearly debt service per $1 borrowed `ads = 12 * r / (1 - (1 + r) ** -n)`
  - coverage `dscr = 1.15` before 2026-10-01, `1.25` from that date
  - most a buyer can pay, as a multiple of EBITDA `= (1 / dscr) / ads / 0.9`
  - check values: prime 6.75% gives 6.16 at 1.15 and 5.66 at 1.25; prime 3.25% at 1.15 gives 7.17
  - EBITDA here must already deduct a market salary for whoever runs the business. Many banks require more than the SBA minimum, which lowers the ceiling.
- **Rates actually charged:** median `initial_rate` by fiscal year from the acquisitions table, shown only where a year has at least three loans.

## 4. Published multiples (Multiples tab)

All in `seed/published_multiples.json`, each with its source, date and link. None is a record of closed sales.

- **FE International, May 2026** (agencies, by EBITDA): under $500K 2.5x to 4x; $500K to $1M 3x to 5x; $1M to $2.5M 4x to 6.5x; $2.5M to $5M 5.5x to 8.5x; $5M and up 7x to 12x. Also the three margin levels used as presets: 15%, 20%, 25%.
- **Palmer M&A via Axial, November 2025** (agencies): under $1M 2.5x to 3.9x; $1M plus 3.5x to 5x; $2M plus 4x to 7x; over $5M 8x to 10x.
- **TobinLeff via Axial:** 3.33x average at about $500K of adjusted EBITDA; 6.46x at about $2.4M.
- **Pepperdine Private Capital Markets Report**, business services median by EBITDA size. 2026 (Table 31, p. 65): 4.8x, 6.2x, 6.5x, 7.5x, 7.0x. 2025 (Table 27, p. 62): 4.5x, 6.2x, 7.5x, 7.0x, 6.5x. Bands: under $1M, $1M to $4.99M, $5M to $9.99M, $10M to $24.99M, $25M and up.
- **First Page Sage, January 2025:** ten agency types at $1M to $3M, $3M to $5M and $5M to $10M of EBITDA.
- **BizBuySell industry multiples**, businesses sold Q3 2021 to Q2 2026: price to revenue and price to seller's discretionary earnings for six industry groups. No separate row for marketing agencies.
- **Revenue conversion:** every source bands by EBITDA. The Multiples tab converts to revenue as `revenue = EBITDA / margin`. At 15% the first two step-ups sit at $3.33M and $6.67M of revenue; at 20%, $2.5M and $5M.
- **Do not use:** IBBA Market Pulse figures read by machine from the PDF. Two reports covering the same quarter gave different values, and ibba.org refused a direct download. The IBBA card stays empty until a person types the numbers in. Breakwater M&A's page was read and discarded; its table did not describe agencies.

## 5. BizBuySell quarterly figures (Insights, Market figures tab)

From BizBuySell's own Insight Report releases: Q2 2026: 2,117 sold, median price $349,250, median cash flow $155,921, cash flow multiple 2.7. Q1 2026: 2,345, $350,000, $165,256, 2.7. Q3 2025: 2,599, $320,044. Full year 2025: median price $350,000, median cash flow $158,950. BizBuySell's own tooling refused to reproduce its full data tables, so quote headline figures with attribution and nothing more.

## 6. Kriterion's own data (Insights, Our assessments tab)

Read from the live database, nothing new stored except `is_test`. On 2026-10-03 there are nine submissions and all are tests. Check figures with tests included: 9 started, 8 submitted, 4 advisor reviews done, 2 waiting for an advisor, average Objective Score 52 (display scale, the eight submitted), median EBITDA entered $750K. Average points lost per assessment on the owner questionnaire: Financial Quality 9.6, Client Concentration 5.9, Leadership 4.1, Growth 2.6, Documentation 2.3, Operational Maturity 1.9, Strategic Positioning 1.8, AI Readiness 1.4.

## Not yet available

- **Census benchmarks** (revenue and payroll per employee by industry and state): api.census.gov needs a free key.
- **SEC filings** for public-company acquisitions: prices are rarely disclosed.
- **Paid deal databases** (DealStats, GF Data, BizComps) hold closed-sale prices. Nothing free replaces them.
