/**
 * The client-facing valuation disclaimer.
 *
 * Every screen that shows a client a dollar figure carries this: the dashboard
 * at `/client`, the self-assessment record at `/client/assessment`, and the
 * assessed result at `/client/summary`. Wording approved 2026-08-27 — it lives
 * here and only here, so changing it changes it everywhere at once.
 *
 * `provisional` adds the pre-review caveat and must be true ONLY where an
 * advisor review is genuinely still to come. An objective-only client never
 * gets one, so they are not waiting and must not be told they are.
 *
 * `hasRange` is false where no income figure is on file and the screen is
 * therefore showing a score but no money. It drops the ±5% mechanics, which
 * would otherwise describe a range that is not on the page.
 */

import { BRAND } from "@/lib/score-display";

export function ValuationDisclaimer({
  provisional = false,
  hasRange = false,
}: {
  provisional?: boolean;
  hasRange?: boolean;
}) {
  return (
    <div
      className="mt-5 rounded-lg border px-4 py-3.5"
      style={{ borderColor: "#e4e9ef", background: "#f7f9fb" }}
    >
      <p
        className="m-0 text-[10.5px] font-bold uppercase tracking-[0.12em]"
        style={{ color: BRAND.muted }}
      >
        About these figures
      </p>
      <p
        className="mt-1.5 mb-0 max-w-[80ch] text-[12px] leading-[1.6]"
        style={{ color: BRAND.muted }}
      >
        {provisional
          ? "Your advisor has not reviewed this yet, so these figures are provisional and will move in either direction. "
          : ""}
        This is an estimate produced by a model, not a valuation, an appraisal or an offer. It is
        built from the answers you gave us, which we have not audited or independently verified.
        What a business actually sells for depends on the buyer, the timing, the deal terms and what
        comes out in diligence — none of which this assessment measures. Treat{" "}
        {hasRange ? "the range" : "this"} as a starting point for a conversation, not a price, and
        take your own professional advice before acting on it.
        {hasRange
          ? " Ranges are a ±5% band around the midpoint, and scores are shown on a 0–100 scale."
          : " Scores are shown on a 0–100 scale."}
      </p>
    </div>
  );
}
