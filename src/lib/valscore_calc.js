// ============================================================
//  ValScore calculation engine  (JavaScript / Node / browser)
//  Reproduces the Excel model's scoring + valuation logic.
//  Verified against sample: objective 26 -> 0.4333x -> 650,000
//                           ValScore 64 -> 0.85x  -> 1,275,000
//
//  Scoring configuration (score-band floors, labels, and the
//  valuation multiple anchors) is now DATABASE-DRIVEN. Callers load
//  `score_bands` + `valuation_multiples` and pass a config built with
//  buildConfig(); when no config is supplied the DEFAULT_CONFIG below
//  is used, which mirrors the original hardcoded values exactly.
// ============================================================

// ---- Default configuration (fallback / parity with the original model) ----
// Band floors come from ScoreBands.min_score (per questionnaire_type).
// Multiple anchors come from valuation_multiples (net fee income OR ebitda basis).
const DEFAULT_CONFIG = {
  objectiveFloors: [0, 30, 42, 51, 60],
  adjustedFloors: [0, 50, 70, 85, 100],
  multipleAnchorsNFI: [0, 0.5, 1.0, 1.5, 2.0], // net fee income basis
  multipleAnchorsEBITDA: [0, 2.0, 2.5, 3.0, 3.8], // ebitda basis
  objectiveBands: [
    { min: 0, max: 29, label: "Bottom of market band" },
    { min: 30, max: 41, label: "Lower-middle band" },
    { min: 42, max: 50, label: "Upper-middle band" },
    { min: 51, max: 60, label: "Top band" },
  ],
  adjustedBands: [
    { min: 0, max: 49, label: "Bottom of market band" },
    { min: 50, max: 69, label: "Lower-middle band" },
    { min: 70, max: 84, label: "Upper-middle band" },
    { min: 85, max: 100, label: "Top band" },
  ],
};

// Backwards-compatible alias (some callers imported `CONFIG`).
const CONFIG = DEFAULT_CONFIG;

// ---- Build a runtime config from database rows ----
// scoreBands: rows from public.score_bands
//   { band_type: 'ObjectivePosition'|'AdjustedValueScore', min_score, max_score, label }
// valuationMultiples: rows from public.valuation_multiples
//   { band_index, nfi_multiple, ebitda_multiple }
// Any missing/invalid piece falls back to the matching DEFAULT_CONFIG value so a
// partial/empty table can never silently zero out a valuation.
function buildConfig(scoreBands, valuationMultiples) {
  const bandsByType = (type) =>
    (scoreBands || [])
      .filter((b) => b && b.band_type === type)
      .map((b) => ({
        min: Number(b.min_score),
        max: Number(b.max_score),
        label: b.label || "",
      }))
      .filter((b) => Number.isFinite(b.min) && Number.isFinite(b.max))
      .sort((a, b) => a.min - b.min);

  const floorsFromBands = (bands) =>
    bands.length ? [...bands.map((b) => b.min), bands[bands.length - 1].max] : [];

  const anchorCol = (key) => {
    const rows = (valuationMultiples || [])
      .filter((r) => r && Number.isFinite(Number(r.band_index)))
      .slice()
      .sort((a, b) => Number(a.band_index) - Number(b.band_index));
    const vals = rows.map((r) => Number(r[key]));
    return vals.every((v) => Number.isFinite(v)) ? vals : [];
  };

  const objectiveBands = bandsByType("ObjectivePosition");
  const adjustedBands = bandsByType("AdjustedValueScore");
  const objectiveFloors = floorsFromBands(objectiveBands);
  const adjustedFloors = floorsFromBands(adjustedBands);
  const nfi = anchorCol("nfi_multiple");
  const ebitda = anchorCol("ebitda_multiple");

  // A floors/anchors pair MUST be the same length for interpolation. If anything
  // is missing or misaligned, fall back to the defaults rather than risk a broken
  // valuation.
  const okObjective = objectiveFloors.length >= 2 && nfi.length === objectiveFloors.length;
  const okAdjusted = adjustedFloors.length >= 2 && nfi.length === adjustedFloors.length;
  const okAnchors = nfi.length >= 2 && ebitda.length === nfi.length;

  return {
    objectiveFloors: okObjective ? objectiveFloors : DEFAULT_CONFIG.objectiveFloors,
    adjustedFloors: okAdjusted ? adjustedFloors : DEFAULT_CONFIG.adjustedFloors,
    multipleAnchorsNFI: okAnchors ? nfi : DEFAULT_CONFIG.multipleAnchorsNFI,
    multipleAnchorsEBITDA: okAnchors ? ebitda : DEFAULT_CONFIG.multipleAnchorsEBITDA,
    objectiveBands: objectiveBands.length ? objectiveBands : DEFAULT_CONFIG.objectiveBands,
    adjustedBands: adjustedBands.length ? adjustedBands : DEFAULT_CONFIG.adjustedBands,
  };
}

// ---- 1. Section + total scores from raw responses ----
// responses: [{ questionnaire_type, section_id, points_awarded }, ...]
// questions: [{ section_id, max_score, questionnaire_type }, ...]
function computeSectionScores(responses, questions) {
  const actual = {}; // section_id -> sum of points
  const max = {}; // section_id -> sum of max_score
  for (const r of responses) {
    actual[r.section_id] = (actual[r.section_id] || 0) + (Number(r.points_awarded) || 0);
  }
  for (const q of questions) {
    max[q.section_id] = (max[q.section_id] || 0) + (Number(q.max_score) || 0);
  }
  const sections = {};
  for (const q of questions) sections[q.section_id] = q.questionnaire_type;
  return Object.keys(sections).map((sid) => ({
    section_id: sid,
    questionnaire_type: sections[sid],
    actual_score: actual[sid] || 0,
    max_score: max[sid] || 0,
    potential_improvement: (max[sid] || 0) - (actual[sid] || 0),
  }));
}

function totalByType(sectionScores, type) {
  return sectionScores
    .filter((s) => s.questionnaire_type === type)
    .reduce((sum, s) => sum + s.actual_score, 0);
}

// ---- 2. Interpolated multiple (the non-obvious part) ----
// Finds which band the score sits in, then slides linearly toward the
// next band's anchor. Top band is inclusive on the upper edge.
function interpolatedMultiple(score, floors, anchors) {
  for (let i = 0; i < floors.length - 1; i++) {
    const lo = floors[i],
      hi = floors[i + 1];
    const inBand = i < floors.length - 2 ? score >= lo && score < hi : score >= lo;
    if (inBand) {
      const slope = (anchors[i + 1] - anchors[i]) / (floors[i + 1] - floors[i]);
      return anchors[i] + (score - lo) * slope;
    }
  }
  return 0;
}

function marketPosition(score, bands) {
  const b = bands.find((x) => score >= x.min && score <= x.max);
  return b ? b.label : "";
}

// ---- Target analysis: "what would it take to reach a target valuation?" ----
// Inverts the interpolation to find the score that achieves the required multiple.
function requiredScore(reqMultiple, floors, anchors) {
  for (let i = 0; i < floors.length - 1; i++) {
    const aLo = anchors[i],
      aHi = anchors[i + 1];
    if (reqMultiple >= aLo && reqMultiple <= aHi && aHi > aLo) {
      const slope = (aHi - aLo) / (floors[i + 1] - floors[i]);
      return floors[i] + (reqMultiple - aLo) / slope;
    }
  }
  return null; // target beyond top band
}

function targetAnalysis(targetValuation, amount, currentScore, floors, anchors) {
  const maxMultiple = anchors[anchors.length - 1];
  if (!targetValuation || !amount) return null;
  // required multiple, capped at the max the model allows
  const requiredMultiple = Math.min(targetValuation / amount, maxMultiple);
  // if the target needs MORE than the max multiple, you also need more income
  const additionalIncomeRequired =
    targetValuation / amount > maxMultiple ? targetValuation / maxMultiple - amount : 0;
  const totalIncomeRequired = amount + additionalIncomeRequired;
  const reqScore = requiredScore(requiredMultiple, floors, anchors);
  const scoreDeficit = reqScore == null ? null : reqScore - currentScore;
  return {
    requiredMultiple,
    additionalIncomeRequired,
    totalIncomeRequired,
    requiredScore: reqScore,
    scoreDeficit,
  };
}

// ---- 3. Full valuation for one submission ----
// inputs: { valuationInputType: 'netfeeincome'|'ebitda',
//           valuationInputAmount: number,
//           targetValuation: number }
// config: optional, from buildConfig(). Defaults to DEFAULT_CONFIG.
function computeValuation(responses, questions, inputs, config) {
  const cfg = config || DEFAULT_CONFIG;
  const sectionScores = computeSectionScores(responses, questions);
  const objectiveScore = totalByType(sectionScores, "objective");
  const advisoryScore = totalByType(sectionScores, "advisory");
  const valScore = objectiveScore + advisoryScore;

  const anchors =
    inputs.valuationInputType === "ebitda" ? cfg.multipleAnchorsEBITDA : cfg.multipleAnchorsNFI;
  const amount = Number(inputs.valuationInputAmount) || 0;

  const objectiveMultiple = interpolatedMultiple(objectiveScore, cfg.objectiveFloors, anchors);
  const adjustedMultiple = interpolatedMultiple(valScore, cfg.adjustedFloors, anchors);
  const maxMultiple = anchors[anchors.length - 1];

  return {
    sectionScores,
    objectiveScore,
    advisoryScore,
    valScore,
    objective: {
      multiple: objectiveMultiple,
      marketPosition: marketPosition(objectiveScore, cfg.objectiveBands),
      estimatedValuation: amount * objectiveMultiple,
      maxValuation: amount * maxMultiple,
      target: targetAnalysis(
        Number(inputs.targetValuation),
        amount,
        objectiveScore,
        cfg.objectiveFloors,
        anchors,
      ),
    },
    adjusted: {
      multiple: adjustedMultiple,
      marketPosition: marketPosition(valScore, cfg.adjustedBands),
      estimatedValuation: amount * adjustedMultiple,
      maxValuation: amount * maxMultiple,
      target: targetAnalysis(
        Number(inputs.targetValuation),
        amount,
        valScore,
        cfg.adjustedFloors,
        anchors,
      ),
    },
    inputs,
  };
}

export {
  CONFIG,
  DEFAULT_CONFIG,
  buildConfig,
  computeSectionScores,
  totalByType,
  interpolatedMultiple,
  marketPosition,
  computeValuation,
  // Exported so the client-facing target planner can recompute interactively
  // against a target the client types, rather than duplicating the maths.
  requiredScore,
  targetAnalysis,
};
