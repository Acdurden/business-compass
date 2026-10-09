# Score weighting, the rating question and the public badge

Discussion held 3 to 9 October 2026 in the Cowork project chat. **Nothing here is built, and nothing here has changed the database.** It records the analysis, Andrew's decisions so far and the previews, so a Claude Code session can pick it up.

Status in one line each:
- **Weighting:** Andrew is considering more weight on the advisor. Not decided.
- **Letter rating shown to clients or shared publicly:** dropped. Grades and scores stay out of anything shared.
- **Public badge:** direction decided (two tiers, a seal), design not final, not approved for build.

## 1. The live scoring, checked 4 October

Read straight from the live database.

- **Founder (objective) questionnaire:** 19 scored questions, 60 points. S1 Business Snapshot (Q1 to Q5) is unscored.
- **Advisor questionnaire:** 18 questions, 40 points.
- **ValScore** = founder points + advisor points, out of 100 (`valScore = objectiveScore + advisoryScore` in `src/lib/valscore_calc.js`). No weighting is applied.
- **Bands:** objective 0 / 30 / 42 / 51 / 60, adjusted 0 / 50 / 70 / 85 / 100.
- **Multiples at those floors:** net fee income 0 / 0.5 / 1.0 / 1.5 / 2.0, EBITDA 0 / 2.0 / 2.5 / 3.0 / 3.8.
- Every question's `max_score` equals its highest active answer, and the sections reconcile to the questions.

### What Adam changed after the 14 September v5 revision

Answer options only; no section total moved. The timing points to the afternoon of 3 October. The tables keep no edit history, so the author of each edit cannot be shown.

| Question | Change | Points now |
|---|---|---|
| Q10, Q18 | Duplicate 1-point answer retired | 0/1/2 |
| Q22 | Duplicate 1-point answer retired, now yes/no | 0/1 |
| Q11 | Bands no longer overlap: 0 to 1, 2 to 3, 4 to 6, 7 to 10, 11+ | unchanged |
| Q8 | Now says "operating profit margins" | unchanged |
| Q2, Q5 (unscored) | "$50M+" and "Other" retired | n/a |

Loose ends from that review: AQ14 still has two answers worth 1 point; Q2's top option has a stale `value_max` of 50,000,000; Q2 and Q3 labels still share boundaries; 17 stored test answers now point at retired options (scores do not move, because points are stored on the response, but those questions show as unanswered if the submission is reopened).

## 2. Weighting

### The question
Andrew feels the founder half at 60% of the ValScore is lopsided, and floated 30 founder / 70 advisor. He asked whether to raise the advisor points per answer, or keep the points and apply a multiplier.

### Mechanics: use a multiplier
- ValScore = founder raw x (W_founder / 60) + advisor raw x (W_advisor / 40), rounded once at the end. Keep the weights in configuration, the way `score_bands` are kept.
- **Rewriting points forces rounding that re-authors the questionnaire.** Advisor points x1.75 rounded to whole numbers total 65 or 74, never 70, so someone has to pick which questions round up.
- **The Objective Score is its own product** on the 60-point scale with its own bands and valuation. A multiplier leaves it untouched; rewritten points would break it.
- **Stored points stay valid.** `responses.points_awarded` keeps its meaning, and the weight can be retuned later.
- **Places that would need the same scaling:** the sum in `valscore_calc.js`, the area scaling in `client-report.ts`, both PDFs, and the action plan's "points available".

### The standing-rule conflict
`docs/research-desk/context/conventions.md` says never change a section's maximum point total and never change the eight category weights, and that a change needing a different denominator is a **new questionnaire version**. A multiplier keeps the stored totals but changes every ValScore. Treat it as a versioned change: stamp each finalised submission with the weighting it was scored under. Every submission is a test today, so now is the cheap time.

### Influence is not the point split
How much of the difference between two businesses each half explains. It grows with the square of the weight, and founder questions carry bigger point swings (Q7 alone is 0 / 4 / 8). Modelled on the live question set, answers independent and evenly spread:

| Split (founder / advisor) | Advisor share of score differences | Spread (SD) |
|---|---|---|
| 60/40 today | 30% | 7.2 |
| 50/50 | 49% | 7.0 |
| 40/60 | 68% | 7.1 |
| 30/70 | 84% | 7.5 |

- **40/60 delivers roughly the "advisor is 70% of the voice" Andrew described.** 30/70 overshoots to about 85/15.
- **No split widens the spread.** Scores still bunch in an 18-point window, so reweighting does nothing for the calibration problem below.
- **It is a repricing.** If owners answer optimistically (better answers weighted 2.2:1) and advisors neutrally, 30/70 drops the average ValScore from 57 to 53.5. The bottom band's share rises from 14% to 31%, and the average net fee income multiple falls about 13%.
- **The four reviewed test submissions all rise at 30/70**, by 0.25 to 5 points, because their advisor answers were generous. Two cross a band floor (45 to 50, 69 to 72).
- **Topic weights barely move.** At 30/70, Financial Quality goes from 28 to 26.5 points of the 100, and Client Concentration from 18 to 16.5. What changes is whose answer counts.

**Recommendation on the table: 40/60, applied as a multiplier, versioned.** Not decided.

### Background: the calibration finding (21 August)
- The ValScore centres near 51 whatever the answering behaviour, with an SD of about 7 under independent answers. The middle 80% of businesses sit between 42 and 60.
- The top two bands (70+ and 85+) are effectively unreachable: 0.3% and 0.0% under neutral answering.
- Real businesses answer in a correlated way, which widens the spread (SD about 15 under moderate correlation) but does not move the centre.
- A screen for buyers needs separation. **A percentile rank against Kriterion's own client base is the durable answer** once there is enough volume (roughly 150 to 200 real submissions).

## 3. The letter rating

A bond-style ladder was proposed on 25 September: B under 40, BB 40 to 49, BBB 50 to 59, A 60 to 69, AA 70 to 84, AAA 85+. The cuts at 50, 70 and 85 equal the existing band floors and multiple anchors.

On 4 October the question became how a provisional (founder-only) grade would relate to the final reviewed one. Owners answering optimistically, advisors neutrally:

| Split | Below BBB | A or better | Final grade lower than provisional |
|---|---|---|---|
| 60/40 | 14% | 37% | 32% |
| 40/60 | 25% | 23% | 52% |
| 30/70 | 31% | 20% | 57% |

Three provisional designs were modelled at 40/60:
1. **Letter from owner answers only, capped at A:** most owners get A (p), and the review lowers 52% of them.
2. **Letter with the advisor half held at its midpoint:** the review lowers 23% and raises 21%, but 80% of owners get the same BBB (p).
3. **A range until reviewed:** never lowered, but there is no single letter to share.

**Andrew's decision (4 October): leave the grade out of anything shared.** Owners share a badge showing they went through the process. Grades stay private, which keeps them valuable for a later paid buyer product. That removes the provisional-versus-final problem from public view.

## 4. The public badge

### Decisions
- **Two tiers:** "Kriterion Assessed" (founder questionnaire) and "Kriterion Advisor Reviewed".
- **No score or grade** on the badge or its share card.
- **The strategy:** the free founder questionnaire brings owners in; the advisor review rescores them and puts them in a better position to sell or grow; over time Kriterion holds a pool of consistently scored, decently underwritten businesses that buyers of all kinds (PE, family offices) would pay to screen.

### Design rounds
1. **Five directions** (seal, registry, mark, stamp, verified check) on the Design canvas "Kriterion Rating Mocks" in claude.ai. Andrew chose the seal, made more like the "verified" direction, in new colours.
2. **Seal round 2:** centred card, modern sans (Manrope), scalloped seal with ring text and a check, in three colourways. Andrew liked **oxblood on bone** and **sapphire and white**. Preview: `previews/seal-badge-mocks.html`.
3. **Seal options:** five more shapes (starburst, coin, shield, hexagon, monogram with check). Preview: `previews/seal-options.html`.
4. **Pairings, Andrew's pick of shapes (9 October):** Assessed is the **monogram K seal with a check on its lower right edge**. Advisor Reviewed is either the **starburst with the K** (pairing 1) or the **shield** (pairing 2). Preview: `previews/seal-pairings.html`.

**Open on the design:**
- **Starburst or shield for the higher tier.** The recommendation is the starburst: both seals are round and carry the K, so the higher tier reads as the first one upgraded.
- **A check on the starburst.** Without one, the lower tier is the only mark with a check, and a check usually signals the higher status.
- **Which colourway.**

Colours used in the previews: oxblood `#7d1d2c` on bone `#f4f2ec` (muted text `#5d5f66`); white on sapphire `#173a9e` (muted text `#c3d0f5`). Type: Manrope 500, 700 and 800.

### What building it would involve (when approved)
- **Replace the score share card.** `src/components/share-score-dialog.tsx` currently shares the score number.
- **A public verify page and an ID scheme.** The previews show `kriterionbvi.com/verify` and an ID like `KR-26-00417`, which is a made-up sample. The page must confirm only that an assessment or review took place, with a date, never a score or grade.
- **Badge wording.** Say "Assessed", never "Certified" or "Rated".
- **Neutral copy.** Earlier card copy said "eight areas a buyer reviews", which signals the owner may be selling; it was removed. Many owners keep sale plans private.
- **Selling access to buyers** needs owner opt-in in the terms from the first submission, and legal review. Charging buyers to find sellers can fall under business-broker or securities rules depending on how it is structured.

## 5. The modelling scripts

In `scripts/`, plain Python with numpy, the question set hard-coded as of 4 October:

- **`weighting_model.py`** gives the influence-by-split table and the band shares by scenario. It uses an exact distribution (convolution) under independent answers.
- **`rating_model.py`** gives the grade shares, and how often the final grade comes out below the provisional one, by split. It uses simulation, independent and with a shared quality factor.
- **`provisional_model.py`** gives the three provisional-grade designs compared across splits and advisor behaviours.

Answering scenarios: "neutral" weights every option equally. "Optimistic" weights options geometrically so the best option is 2.2 times as likely as the worst. "Cautious" is the reverse. The correlated case adds a shared quality factor tuned to an SD of about 14, matching the "moderate" row of the August calibration.
