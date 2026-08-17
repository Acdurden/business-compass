/**
 * Client-facing score presentation.
 *
 * The database and the advisor tools keep the real point scales: the objective
 * questionnaire is out of 60 and the advisory questionnaire is out of 40. This
 * module is the ONLY place that translates those into what a client sees:
 *
 *   - the objective score is grossed up onto a 0–100 scale (28/60 -> 47)
 *   - scores are always stated bare, never "47 / 100"
 *   - the two questionnaires are paired into eight comparable "value drivers"
 *
 * Nothing here changes a stored value or a valuation. It is presentation only.
 */

import type { ScoringConfig, SectionScore } from "@/lib/valscore_calc";

/* ------------------------------------------------------------------ */
/* Brand palette                                                       */
/* ------------------------------------------------------------------ */

/**
 * Placeholder brand colours. There is no formal brand guide yet — when one
 * lands, change these six values and every client-facing score screen follows.
 */
export const BRAND = {
  navy: "#0e1c2b",
  ink: "#12222f",
  muted: "#61707e",
  teal: "#1f8a86",
  tealDark: "#166f6b",
  upside: "#f0d69a",
  positive: "#4aa86f",
  positiveText: "#1f7a4d",
  negative: "#c05b4d",
  negativeText: "#9b4335",
  rail: "#dde4ea",
} as const;

/** Colours used for the four score bands, lowest to highest. */
export const BAND_COLORS = [
  "#c98a3a",
  "#4f8bd6",
  "#4aa86f",
  "#1f8a86",
] as const;

/* ------------------------------------------------------------------ */
/* Scale translation                                                   */
/* ------------------------------------------------------------------ */

/** The scale every client-facing score is shown on. */
export const CLIENT_SCALE_MAX = 100;

/**
 * Gross a raw objective score onto the client-facing 0–100 scale.
 * 28 of a possible 60 becomes 46.67, displayed as 47.
 *
 * The ValScore itself is already native 0–100 (objective 60 + advisory 40) and
 * must NOT be passed through this.
 */
export function grossObjective(
  objectiveScore: number,
  objectiveMax: number,
): number {
  if (
    !Number.isFinite(objectiveScore) ||
    !Number.isFinite(objectiveMax) ||
    objectiveMax <= 0
  ) {
    return 0;
  }
  return (objectiveScore / objectiveMax) * CLIENT_SCALE_MAX;
}

/** Express any actual/max pair on the 0–100 scale. */
export function asPercent(actual: number, max: number): number {
  if (!Number.isFinite(actual) || !Number.isFinite(max) || max <= 0) return 0;
  return (actual / max) * 100;
}

/**
 * Format a score for display. Client-facing scores are stated bare — a
 * denominator makes the number read like a test grade.
 */
export function displayScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toString();
}

/** Signed delta, e.g. "+35" / "−33". Returns "—" when the shift is negligible. */
export function displayDelta(delta: number, flatWithin = 3): string {
  if (!Number.isFinite(delta)) return "—";
  if (Math.abs(delta) < flatWithin) return "—";
  const rounded = Math.round(delta);
  return rounded > 0 ? `+${rounded}` : `−${Math.abs(rounded)}`;
}

export type BandInfo = {
  index: number;
  label: string;
  min: number;
  max: number;
};

/** Locate a score in a band list. Falls back to the nearest band rather than throwing. */
export function bandFor(
  score: number,
  bands: Array<{ min: number; max: number; label: string }>,
): BandInfo {
  if (!bands.length)
    return { index: 0, label: "", min: 0, max: CLIENT_SCALE_MAX };
  const sorted = [...bands].sort((a, b) => a.min - b.min);
  const found = sorted.findIndex((b) => score >= b.min && score <= b.max);
  const i = found >= 0 ? found : score < sorted[0].min ? 0 : sorted.length - 1;
  return {
    index: i,
    label: sorted[i].label,
    min: sorted[i].min,
    max: sorted[i].max,
  };
}

/** The band segments, for drawing the ribbon. */
export function bandSegments(config: ScoringConfig) {
  const bands = [...config.adjustedBands].sort((a, b) => a.min - b.min);
  return bands.map((b, i) => ({
    ...b,
    color: BAND_COLORS[Math.min(i, BAND_COLORS.length - 1)],
    width: Math.max(0, b.max - b.min + 1),
  }));
}

export function formatCurrency(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** A ±5% band around the midpoint, matching how results are quoted elsewhere. */
export function formatValuationRange(
  midpoint: number | null | undefined,
): string {
  if (midpoint == null || !Number.isFinite(midpoint)) return "—";
  return `${formatCurrency(Math.round(midpoint * 0.95))} – ${formatCurrency(
    Math.round(midpoint * 1.05),
  )}`;
}

/* ------------------------------------------------------------------ */
/* Value drivers — pairing the two questionnaires                      */
/* ------------------------------------------------------------------ */

/**
 * The eight scored objective sections correspond one-to-one with the eight
 * advisory sections, which is what makes a "you said / your advisor said"
 * comparison possible.
 *
 * Section ids are the primary key here because the display names differ
 * slightly between the two questionnaires (for example "Leadership & Founder
 * Dependency" against "Leadership & Founder Independence"). Any section not
 * listed is matched by name similarity instead, so adding a section to both
 * questionnaires still works without touching this file.
 */
const KNOWN_PAIRS: ReadonlyArray<{
  objective: string;
  advisory: string;
  name: string;
}> = [
  { objective: "S2", advisory: "A1", name: "Financial Quality" },
  { objective: "S4", advisory: "A2", name: "Client Concentration" },
  {
    objective: "S5",
    advisory: "A3",
    name: "Leadership & Founder Independence",
  },
  { objective: "S6", advisory: "A4", name: "Operational Maturity" },
  { objective: "S7", advisory: "A5", name: "Documentation Credibility" },
  { objective: "S8", advisory: "A6", name: "Strategic Positioning" },
  { objective: "S3", advisory: "A7", name: "Growth Trajectory" },
  { objective: "S9", advisory: "A8", name: "AI Readiness & Leverage" },
];

const STOP_WORDS = new Set([
  "and",
  "the",
  "of",
  "for",
  "a",
  "an",
  "&",
  "risk",
  "reporting",
]);

function nameTokens(name: string): Set<string> {
  return new Set(
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
  );
}

function similarity(a: string, b: string): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  ta.forEach((t) => {
    if (tb.has(t)) shared += 1;
  });
  return shared / Math.min(ta.size, tb.size);
}

export type SectionMeta = {
  section_id: string;
  section_name: string;
  questionnaire_type: string;
  sort_order: number;
};

export type Driver = {
  key: string;
  name: string;
  /** The client's own read, 0–100. */
  selfScore: number;
  /** The advisor's read, 0–100. */
  advisorScore: number;
  /** advisorScore − selfScore. */
  delta: number;
  /** Advisory points still available on this driver. */
  upsidePoints: number;
  advisoryActual: number;
  advisoryMax: number;
};

/**
 * Build the paired driver list from the section scores the engine produced.
 *
 * Sections with no scoreable points (the Business Snapshot profile section) and
 * sections that cannot be paired are omitted rather than shown as a half-empty
 * comparison.
 */
export function buildDrivers(
  sections: SectionMeta[],
  sectionScores: SectionScore[],
): Driver[] {
  const scoreBySection = new Map(sectionScores.map((s) => [s.section_id, s]));
  const metaBySection = new Map(sections.map((s) => [s.section_id, s]));

  const usedObjective = new Set<string>();
  const usedAdvisory = new Set<string>();
  const drivers: Driver[] = [];

  const push = (objectiveId: string, advisoryId: string, name: string) => {
    const o = scoreBySection.get(objectiveId);
    const a = scoreBySection.get(advisoryId);
    if (!o || !a) return;
    if (o.max_score <= 0 || a.max_score <= 0) return;
    usedObjective.add(objectiveId);
    usedAdvisory.add(advisoryId);
    const selfScore = asPercent(o.actual_score, o.max_score);
    const advisorScore = asPercent(a.actual_score, a.max_score);
    drivers.push({
      key: `${objectiveId}-${advisoryId}`,
      name,
      selfScore,
      advisorScore,
      delta: advisorScore - selfScore,
      upsidePoints: Math.max(0, a.max_score - a.actual_score),
      advisoryActual: a.actual_score,
      advisoryMax: a.max_score,
    });
  };

  // Known pairs first, in the order they are listed — that is the display order.
  KNOWN_PAIRS.forEach((pair) => {
    // Prefer the advisory section's own name if an admin has renamed it.
    const advisoryMeta = metaBySection.get(pair.advisory);
    push(
      pair.objective,
      pair.advisory,
      advisoryMeta?.section_name?.trim() || pair.name,
    );
  });

  // Anything the table didn't cover — pair by name similarity so that a section
  // added to both questionnaires still appears without a code change.
  const leftoverObjective = sections.filter(
    (s) =>
      s.questionnaire_type === "objective" &&
      !usedObjective.has(s.section_id) &&
      (scoreBySection.get(s.section_id)?.max_score ?? 0) > 0,
  );
  const leftoverAdvisory = sections.filter(
    (s) =>
      s.questionnaire_type === "advisory" &&
      !usedAdvisory.has(s.section_id) &&
      (scoreBySection.get(s.section_id)?.max_score ?? 0) > 0,
  );

  leftoverObjective.forEach((o) => {
    let bestId: string | null = null;
    let bestName = "";
    let bestScore = 0;
    leftoverAdvisory.forEach((a) => {
      if (usedAdvisory.has(a.section_id)) return;
      const sim = similarity(o.section_name, a.section_name);
      if (sim > bestScore) {
        bestScore = sim;
        bestId = a.section_id;
        bestName = a.section_name;
      }
    });
    if (bestId && bestScore >= 0.34) {
      push(o.section_id, bestId, bestName || o.section_name);
    }
  });

  return drivers;
}

/** Drivers with the most advisory points still available, biggest first. */
export function topUpsideDrivers(drivers: Driver[], limit = 5): Driver[] {
  return [...drivers]
    .sort((a, b) => b.upsidePoints - a.upsidePoints)
    .slice(0, limit);
}

/** Split drivers by how the advisor's read compared with the client's own. */
export function partitionByShift(drivers: Driver[], flatWithin = 3) {
  const up: Driver[] = [];
  const down: Driver[] = [];
  const held: Driver[] = [];
  drivers.forEach((d) => {
    if (Math.abs(d.delta) < flatWithin) held.push(d);
    else if (d.delta > 0) up.push(d);
    else down.push(d);
  });
  return { up, down, held };
}

/** "Alpha, Beta and Gamma" */
export function listNames(drivers: Driver[]): string {
  const names = drivers.map((d) => d.name);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
