# Kriterion — working conventions (Andrew's preferences)

Adapted on 2026-10-03 from the Kriterion project doc `claude/conventions.md` (device-bridge steps trimmed, the 18 September standing rules appended). Rules to follow in every session on this project.

## Andrew is NOT a technical person (READ FIRST)
Andrew comes from a **financial-modeling background, largely Excel**. He does
**not** know SQL and is not comfortable with code, terminals, or database
tooling. Do the technical work FOR him — drive the browser, run the queries,
handle the database — rather than handing him SQL/commands to run. When you
must explain, use plain, non-technical language and describe outcomes, not
mechanics. Never ask him to paste/run SQL, edit code by hand, or interpret
technical jargon. If a step genuinely needs his action (e.g. approving a
purchase, moving nameservers at GoDaddy), spell it out click-by-click.

## SCORING IMMUTABILITY — the section point totals are locked
Added 2026-09-17 at Andrew's instruction. **Once real clients start submitting,
a client's score must never move because of something we changed.**

The protection that already exists: every row in `responses` stores its own
`points_awarded`, and since 2026-09-17 its own `question_text` and
`selected_answer_text`. The engine sums the stored points. So **question
wording and answer options can be changed freely, forever**, and no historical
score moves. That was verified across all five submissions during the v5
revision.

The protection that does **not** exist, and the rule that replaces it:

> **Never change a section's maximum point total, and never change the eight
> category weights.** They are the denominator. A section going from 18 points
> to 16 silently re-bases every historical submission, moving its percentage,
> its band, and its valuation, with nothing in the data to show it happened.

The current, locked allocation. Founder 60, advisor 40, combined 100:

| Category | Founder | Advisor | Total |
|---|---|---|---|
| Financial Quality | 18 | 10 | 28 |
| Client Concentration & Revenue Risk | 12 | 6 | 18 |
| Leadership & Founder Independence | 9 | 7 | 16 |
| Strategic Positioning | 5 | 5 | 10 |
| Growth Trajectory | 5 | 4 | 9 |
| Operational Maturity | 4 | 4 | 8 |
| AI Readiness & Leverage | 4 | 3 | 7 |
| Documentation Credibility | 3 | 1 | 4 |

If a change genuinely requires a different denominator, it is a **new version of
the questionnaire**, not an edit: stamp submissions with a version and leave the
old one intact. Do not quietly re-weight.

Note that `/admin/questionnaire` recomputes `max_score` server-side from the
highest active option, so **adding an option worth more than the current
maximum silently raises a section total.** That is the most likely accidental
route to breaking this rule.

## ONE report, ONE money formatter
Added 2026-09-17.

**The advisor must never see a different number from the client.** The advisor
workspace once printed "$1,646,667 – $1,820,000" beside a client report reading
"$1.65M – $1.82M": the same valuation wearing two faces, in a conversation where
both people are looking at their own screen.

- **All money goes through `formatCurrency` / `formatValuationRange` in
  `score-display.ts`.** Millions carry two decimals ($1.73M), thousands are
  whole ($650K). Never format money inline, and never call `Intl.NumberFormat`
  for a figure a person will read.
- **`round10k` lives in `score-display.ts` and nowhere else.** It had three
  definitions once, which is how the surfaces drifted.
- **The client report is assembled once**, in `client-report.ts`. The result
  page and the PDF both render that object and neither decides anything about
  its content. If a new surface needs the report, it takes the same object.

## Never invent something a client will read as fact
Rule 7 of the pre-push checklist covers numbers. It extends to judgements.

A placeholder verdict sentence describing what a buyer thinks of a client's
business, written by nobody, is a fabricated judgement and is worse than a
fabricated number. Where a written-by-a-person field is empty, either omit the
block or hold the space with a line that is true of every assessment and says
nothing about this business. See `verdictOrStandIn` in `client-report.ts`.

## Build previews BEFORE committing to a build (IMPORTANT)
Before writing production code for any new feature or screen, build an
**interactive preview first** and get Andrew's sign-off on it. His explicit
rules:
- "Always build previews before committing to a build."
- "Previews should be HTML so I can see them."

So: for any non-trivial UI/feature, produce a self-contained **HTML mock-up**
loaded with the **real data** (query the live DB and embed it) so Andrew can
click around and react. Make it feel like the real thing — live totals,
buttons that respond — but state clearly that nothing saves. Only after he
approves the design do you write the actual TanStack/React production code into
the repo.

(For the research desk build, the previews already exist and are approved. See
`docs/research-desk/HANDOFF.md`.)

## Spelling is always fixed, or at least verified
Added 2026-09-17. A typo found is a typo fixed in the same turn, not flagged and
left sitting. When a content sweep is warranted, sweep **both** questionnaires
and the section names, not just the thing that prompted it.

## PRE-PUSH CHECKLIST — run ALL of these before handing Andrew any code
Added 2026-08-17 at Andrew's instruction, after a delivery that compiled
cleanly but carried four real bugs and 368 lint errors. **Every item, every
time. Report the results to him as part of the handoff.**

0. **Use the repo's own tool config.** `.prettierrc`, `.prettierignore` and
   `eslint.config.js` must be the ones the checks run against. The repo asks
   for a 100-column width; prettier's default is 80.
1. **Typecheck** — `bunx tsc --noEmit`, exit 0.
2. **Build** — `bun run build`, exit 0. Note this REGENERATES
   `src/routeTree.gen.ts`, so a new route needs one build before `tsc` passes,
   and the regenerated file must ship with the delivery.
3. **Lint the way HE lints** — `bunx eslint .`, exit 0, not just the changed
   files. The repo uses eslint + prettier; `bunx eslint --fix` handles
   formatting automatically. Six shadcn warnings are known and accepted.
4. **Engine parity** — run the shipped modules over the real DB rows and check
   the output against the approved mock, figure by figure. Not "it compiles" —
   actual numbers.
5. **Edge cases** — exercise, at minimum: empty/missing responses, missing
   config rows (`score_bands`, `valuation_multiples`), missing section
   metadata, zero/null amounts, and all-max / all-zero scores. Confirm no
   crashes AND no misleading output.
6. **Consistency with existing data access** — if another page reads the same
   record, confirm both pick the SAME row.
7. **No fabricated numbers on client-facing pages.** Shared defaults (e.g.
   `DEFAULT_VALUATION_INPUT_AMOUNT`) are fine in advisor tools but must never
   silently invent a figure a client will read as their own. Hide the section
   instead.
8. **Responsive check** — inline `style={{ gridTemplateColumns: ... }}` CANNOT
   carry media queries. Use Tailwind `md:` classes for anything that must
   collapse on a phone.
9. **Browser render after deploy** — compile-clean is NOT render-clean. Once
   Andrew pushes, load the page and confirm it actually renders and the numbers
   match. Client routes need a client sign-in; advisor and admin routes Andrew
   stays signed into.

### Editing the questionnaire by SQL
Some answer options carry a numeric range as well as a label: `value_min` /
`value_max` with a `value_type` of `PercentRange` or `IntegerRange`, on Q2, Q3,
Q6, Q11, Q12, Q14 and Q15. **Changing the label alone leaves the number behind
it stale**, and the editor shows the number rather than the label. Change both.

`responses.answer_option_id` has a `NO ACTION` foreign key, so the database
refuses to delete any option that has been answered. Retire options with
`active = false` and insert replacements; never delete.

### Never run git commands against his repo
`git status` from a Linux VM once created a `.git/index.lock` it had no
permission to remove, which blocked Andrew's commit in GitHub Desktop. Verify
deliveries with plain file checks (`ls`, `stat`, `cksum`, `grep`) instead.

To check whether something was committed or pushed **without running git**, read
the plain text files: `.git/logs/HEAD` is the reflog and shows recent commit
messages, and `.git/refs/heads/<branch>` against
`.git/refs/remotes/origin/<branch>` tells you whether the branch is pushed.

### Line endings — settled 2026-08-18
The repo carries a `.gitattributes` with `* text=auto eol=lf`. **Never deliver
a file with CRLF**, and if a delivery ever shows up as a whole-file diff, check
line endings first.

## Handing off files to push via GitHub Desktop
Andrew manages this repo through **GitHub Desktop** (repo cloned at
`C:\Users\andre\OneDrive\Documents\GitHub\business-compass`, on branch
`cloudflare-migration`). When Claude produces file changes for him to commit
and push, Claude must:

1. Write the changed files into the repo folder so they appear in GitHub
   Desktop.
2. Provide, in an **easy-to-copy code block**, both:
   - a short **description/summary** of what changed and why, and
   - a ready-to-paste **commit message**.

Keep the summary tight and human — what changed, why, and anything to watch.

**Claude never commits or pushes.** Every delivery is uncommitted, and the
commit box must cover everything currently uncommitted, not just the newest
change.

### Verify every file actually landed
A partial write can look like a success. After delivering, checksum every file
that was meant to change and confirm it matches what was intended.

## Standing rules added 2026-09-18
- **Two products, not one score that matures.** The Objective Score comes from
  the client's own answers and never changes once submitted. The ValScore is a
  second, independent assessment by an advisor. Never present them as
  comparable, never show a delta between them, never put them side by side.
- **No em dashes in anything a client, advisor or admin reads.**
- **The band is internal.** It appears in nothing a client reads.
- **Each score has one name on every surface**: Objective Score, or ValScore.
- **Answer ranges never share a boundary**, and use "to" rather than a hyphen.
- **No client-facing text explains a product decision to the reader.**
