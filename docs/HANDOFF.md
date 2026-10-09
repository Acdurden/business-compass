# Kriterion handoff: moving the coding to Claude Code

Written 9 October 2026 in the Cowork project chat, for the next Claude Code session in this repo.

Read this file first, then `docs/research-desk/context/conventions.md` (the standing rules), then whichever of the work-stream files below you are picking up.

| File | What it covers |
|---|---|
| `docs/research-desk/context/conventions.md` | Andrew's standing rules: he is not technical, never run git, the pre-push checklist, money formatting, scoring immutability, no em dashes |
| `docs/research-desk/HANDOFF.md` | The admin-only research desk build (market data and insights). Step 1 is in the code; the rest is not built |
| `docs/scoring-and-rating/SCORING-AND-BADGE.md` | Score weighting, the letter-rating discussion and the public badge decision. Discussion and previews only; nothing approved for build |
| `docs/scoring-and-rating/previews/` | Three HTML previews of the badge seals. Open them in a browser |
| `docs/scoring-and-rating/scripts/` | The Python models behind every weighting and rating figure in that doc |

## The rules that matter most

The full list is in `conventions.md`. These are the ones a new session breaks first.

- **Andrew is not technical.** He comes from Excel and financial modelling. Do the technical work for him. Never hand him SQL, commands or code to run. Explain outcomes in plain language.
- **Never run git commands in this repo, and never commit or push.** Andrew commits and pushes in GitHub Desktop. Leave every change uncommitted. Hand over a short summary and a ready-to-paste commit message, each in its own code block. To check what is committed, read `.git/logs/HEAD` and compare `.git/refs/heads/cloudflare-migration` with `.git/refs/remotes/origin/cloudflare-migration` as plain text files.
- **Pushing `cloudflare-migration` deploys the live site.** It builds the Cloudflare Worker `kriterion`, served at kriterionbvi.com. Keep the branch in a working state, and never rewrite pushed history (see `AGENTS.md`).
- **Run the whole pre-push checklist before handing anything over**, and report the results: `bunx tsc --noEmit`, `bun run build` (which regenerates `src/routeTree.gen.ts`, and that file must ship), `bunx eslint .` on the whole repo, then real numbers checked against real data.
- **LF line endings only. No em dashes in anything a person reads.**
- **Build an HTML preview with real data before any new screen**, and get Andrew's sign-off on it before writing production code.
- **Two products, never compared.** The Objective Score comes from the client's own answers and never changes once submitted. The ValScore is a separate advisor assessment. Never side by side, never a delta.
- **The section point totals are locked** (founder 60, advisor 40). See the weighting item below before touching anything that changes how the two halves combine.

## Where things stand on 9 October

- **Branch:** `cloudflare-migration`. Last commit `f235c97`, 4 October, "Per-person invites, branded invite email, Founder Questionnaire header". Local and origin match, so everything committed is pushed and live.
- **Database:** Supabase project "Kriterion", id `lbopzuffyprpbhxdsknv`.
- **Live and working:** client and advisor portal; per-person invite links (`client_invites` table); the invite email with a Plain or Branded switch on `/admin/emails`; the Founder Questionnaire header; Objective Score and ValScore as two products; the score share card from 18 September.
- **Data:** every submission in the database is a test. No real client has submitted yet. That makes this the cheapest moment to change anything about scoring.

## Open work, in priority order

### 1. The research desk migrations are not applied to the live database (check first)

The commit "Research desk step 1" (`a0b0c7a`, 4 October) shipped code that reads and writes `submissions.is_test`. On 9 October that column did not exist in the live database, and neither did the market tables. The two migration files are in the repo but were never applied:

- `supabase/migrations/20261003120000_add_submissions_is_test.sql`
- `supabase/migrations/20261003120100_create_market_tables.sql`

**What this probably means live:** the admin "Test" switch on `/admin/submissions`, and anything else that touches `is_test`, fails. Confirm that in the browser before assuming it.

**What to do:** if this session has Supabase tools, apply both migrations and say so. If it does not, tell Andrew plainly: "The database change is written but not applied. Go back to the Kriterion project chat in Cowork and say: apply the research desk migrations." Do not hand him SQL. Then mark the existing test submissions `is_test = true` and carry on with Step 2 of `docs/research-desk/HANDOFF.md`.

The invite migrations of 4 October (`20261004120000`, `20261004120100`) **are** applied: `client_invites` and `app_settings` both exist.

### 2. The invite email is landing in junk (reported 9 October)

**What is known:**
- The test invite went to `adurden+2@thedurdencompany.com` at 12:39 UTC on 9 October. It was found in junk, and the account was created from it a minute later.
- The sender was "Kriterion" `<info@kriterionbvi.com>`, sent through Cloudflare Email Sending (`src/lib/email-delivery.server.ts`).
- The style was **Plain**: `app_settings` has no rows, so both switches are on their defaults (Plain invite, navy band header).
- On 18 September the older invite was confirmed in Gmail's **Primary** tab. That test went to a Gmail address. This one went to Andrew's company domain, which may use a different mail provider. **The change may be the inbox provider rather than the email.** Do not assume the 4 October changes caused it until the headers say so.

**The one piece of evidence needed is the message headers of the junked email.** They show whether SPF, DKIM and DMARC passed, plus the spam score the receiving server gave.
- Outlook on the web: open the message, the "..." menu, View, View message details, copy all of it.
- Gmail: open the message, the three-dot menu, Show original, Copy to clipboard.

**How to read the result:**
- **DMARC failed:** the domain's DMARC policy is `p=quarantine`, which tells receivers to put failing mail in junk. Junk is then working as designed, and the fix is DNS. Check `_dmarc`, the apex SPF record and the DKIM key at `cf-bounce._domainkey.kriterionbvi.com`. On Windows, `nslookup -type=txt _dmarc.kriterionbvi.com` works. The Cowork cloud sandbox cannot resolve DNS.
- **Everything passed:** the cause is sender reputation or content. The domain is new and has sent very little. Candidates are the link whose text ("Begin Your Founder Questionnaire") differs from its long token URL, and the From name changing from the advisor's first name to "Kriterion". Test one change at a time, each against a fresh address that has never had Kriterion mail.

**DNS facts that must not be undone** (from the 27 August email setup; mail for the domain is GoDaddy-resold Microsoft 365):
- There must be exactly **one** SPF record on the apex: `v=spf1 include:_spf.mx.cloudflare.net include:secureserver.net ~all`. GoDaddy's screen says to add a second record with `-all`. **Do not.** Two SPF records is a permanent failure, and `-all` hard-fails Cloudflare-sent mail.
- The three MX records on `cf-bounce.kriterionbvi.com` are Cloudflare's outbound bounce path. GoDaddy's "remove existing MX records" does not mean them. **Leave them.**
- **Never enable Cloudflare Email Routing on this zone.** It takes over the apex MX and breaks Microsoft delivery.
- Cloudflare signs outbound mail with the DKIM key at `cf-bounce._domainkey.kriterionbvi.com`. The live DMARC is `p=quarantine`; Cloudflare's panel *recommends* `p=reject`. Do not confuse the two.
- Cloudflare account `Adurden@thedurdencompany.com`, zone `kriterionbvi.com`, free plan, Email Sending quota 200 a day.

**Still owed from 4 October:** Andrew's inbox test of Plain against Branded, each to a fresh Gmail address that has never had Kriterion mail, reporting which tab each lands in.

### 3. Score weighting: Andrew is considering more weight on the advisor (not decided)

Andrew feels the founder half at 60% of the ValScore is too much and floated 30 founder / 70 advisor. Full analysis in `docs/scoring-and-rating/SCORING-AND-BADGE.md`. The short version:

- Apply any new weighting as a **multiplier when the two halves are combined**. Do not rewrite answer points: at 30/70, scaled advisory points rounded to whole numbers total 65 or 74, never 70.
- Advisor influence over the ranking grows with the square of the weight. A 30/70 split by points gives the advisor about 84% of the influence, and 40/60 gives about 68%. The recommendation on the table is 40/60.
- **This collides with a standing rule.** `conventions.md` says never change the eight category weights, and that a change needing a different denominator is a new questionnaire version, not an edit. A multiplier leaves the stored section totals alone but changes every ValScore. Treat it as a versioned change: stamp each submission with the weighting it was scored under. All submissions are tests today, so this is cheap now and expensive after the pilot.
- Every place that adds the two halves would need the multiplier: `valScore = objectiveScore + advisoryScore` in `src/lib/valscore_calc.js`, the area scaling in `src/lib/client-report.ts`, both PDFs and the action plan's "points available".
- **Do not build any of this until Andrew decides.** He wanted it considered alongside the badge (item 4).

### 4. The public badge replaces sharing a score or grade (direction set, design not final)

Decisions Andrew made on 4 October:
- **Grades and scores stay out of anything shared publicly.** Owners share a badge showing they went through the process.
- **Two tiers:** "Kriterion Assessed" for the founder questionnaire, "Kriterion Advisor Reviewed" after the advisor's review.
- **The strategy behind it:** the free questionnaire brings owners in, the advisor review rescores them, and over time Kriterion holds a pool of consistently scored businesses. Grades stay private, so access to them can later be sold to buyers (PE, family offices) as a pre-screening tool.
- **Seal design, current favourite:** Assessed is a round "K" monogram seal with a check on its lower right edge. Advisor Reviewed is either a solid starburst seal with the K (pairing 1, recommended) or a solid shield (pairing 2). Colours: oxblood `#7d1d2c` on bone `#f4f2ec`, or white on sapphire `#173a9e`. He liked both colourways. Open `docs/scoring-and-rating/previews/seal-pairings.html`.
- **Not approved for build.** The open question was whether to add the corner check to the starburst, so that the higher tier is not the one without a check.

What the badge implies, when it is built:
- The existing share card (`src/components/share-score-dialog.tsx`) shares the score number. It conflicts with the new direction and would be replaced.
- The cards carry a verify link (`kriterionbvi.com/verify`) and a registry ID (`KR-26-00417` is a made-up sample). Neither exists yet. A public verify page must confirm only that an assessment or review took place, never a score or grade.
- Wording should be "Assessed", never "Certified" or "Rated", so the badge does not read as an endorsement.
- Selling access to buyers needs owner opt-in in the terms from the first submission, and a legal review before launch.

### 5. Content questions waiting on Adam or Dan

- **AQ14** has two answers worth 1 point ("Some strategic value" and "Strong strategic narrative"). The duplicate cleanup reached Q10, Q18 and Q22 but not the advisory side.
- **Q2's top option** reads "Greater than $25,000,000" but its stored `value_max` is still 50,000,000; it should be null. This matters once a size-based valuation reads Q2.
- **Q2 and Q3** labels still share boundaries ($1M to $3M, $3M to $5M; 1 to 10, 10 to 25), against the standing rule. `value_min`/`value_max` must move with any label change.
- **The client dashboard's first-visit screen** promises "your ValScore and an estimated valuation range at the end". The invite says this is not a valuation calculator, and an objective-only client never gets a ValScore.
- **Company name:** Kriterion LLC, Kriterion BVI or plain Kriterion. The email logo reads "KRITERION | LLC".

### 6. Engineering backlog (from the 18 September and 4 October handoffs, still open)

- `set_my_client_target` writes to the client's oldest submission, and a zero-row update reports success. Needs a migration.
- `bandFor` falls back to the top band for a score in a gap between bands.
- `sendComposedEmail` still trusts the browser for address and link on the nudge and review-ready emails. It enforces none of the `blocked` reasons `getEmailDraft` computes, and `password_reset` is composable through it.
- Unresolved template tags reach clients as literal braces.
- `valscore_calc.js` is plain JS with a hand-written `.d.ts`, so the engine behind every number is the one file `tsc` never checks.
- Remaining em dashes: two `"—"` placeholder tiles in `client.index.tsx` (around lines 1015 and 1029), the compose title in `advisor.index.tsx`, and the advisor dashboard sub-labels.
- "assessment" still appears around 100 times on client surfaces; only the questionnaire, sign-up and dashboard start buttons were renamed to "Founder Questionnaire".
- Dead code: the `/login` orphan redirect, the unreachable sign-up branch in `auth.tsx`, `renderTargetBlock`, `inviteClient` / `createTestClient`, and the unused tables `section_scores` and `multiple_schedule`.
- The two reusable invite codes in `invite_codes` still work. Andrew has not asked for them to be switched off.

## Where the rest of the history lives

- **The Cowork project "Kriterion" on claude.ai** holds 47 working notes. They are not in this repo. The ones behind this handoff: `HANDOFF-2026-09-18-evening.md`, `invite-build-2026-10-04.md`, `email-live.md`, `two-products-2026-09-18.md`, `questionnaire-v5-revision.md`, `score-calibration.md`, `valuation-model-v2.md`, `rating-display-and-valuation-evidence-2026-09-25.md`, `weighting-and-rating-2026-10-04.md`, `scoring-review-2026-10-04.md`. If a session needs one, ask Andrew to have the Cowork chat copy it into the repo.
- **The badge design canvas** ("Kriterion Rating Mocks", a claude.ai Design artifact) holds the earlier grade cards and the first five badge directions. Andrew could not see the canvas, which is why the seal previews were rebuilt as plain HTML files in this repo.
- **"Claude outputs/"** at the repo root holds earlier PDFs, mocks and screenshots from Cowork sessions.

## Handing work back to Andrew

1. Write the changed files into this repo folder so they show up in GitHub Desktop.
2. Run the checklist and report the results.
3. Give him, each in its own copy-ready code block, a short summary of what changed and why, and a commit message that covers everything currently uncommitted.
4. After he pushes, load the live page and confirm it renders with the right numbers.
