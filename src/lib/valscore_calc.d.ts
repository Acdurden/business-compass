export interface ValuationInputs {
  valuationInputType: "netfeeincome" | "ebitda";
  valuationInputAmount: number;
  targetValuation?: number;
}
export interface SectionScore {
  section_id: string;
  questionnaire_type: string;
  actual_score: number;
  max_score: number;
  potential_improvement: number;
}
export interface TargetAnalysis {
  requiredMultiple: number;
  requiredScore: number | null;
  scoreDeficit: number | null;
  additionalIncomeRequired: number;
  totalIncomeRequired: number;
}
export interface ValuationLeg {
  multiple: number;
  marketPosition: string;
  estimatedValuation: number;
  maxValuation: number;
  target: TargetAnalysis | null;
}
export interface ValuationResult {
  sectionScores: SectionScore[];
  objectiveScore: number;
  advisoryScore: number;
  valScore: number;
  objective: ValuationLeg;
  adjusted: ValuationLeg;
  inputs: ValuationInputs;
}
export interface ScoringConfig {
  objectiveFloors: number[];
  adjustedFloors: number[];
  multipleAnchorsNFI: number[];
  multipleAnchorsEBITDA: number[];
  objectiveBands: Array<{ min: number; max: number; label: string }>;
  adjustedBands: Array<{ min: number; max: number; label: string }>;
}
export function buildConfig(
  scoreBands: Array<{ band_type?: string | null; min_score?: number | string | null; max_score?: number | string | null; label?: string | null }>,
  valuationMultiples: Array<{ band_index?: number | string | null; nfi_multiple?: number | string | null; ebitda_multiple?: number | string | null }>,
): ScoringConfig;
export function computeValuation(
  responses: Array<{ questionnaire_type?: string | null; section_id?: string | null; points_awarded?: number | null }>,
  questions: Array<{ section_id: string; max_score?: number | null; questionnaire_type: string }>,
  inputs: ValuationInputs,
  config?: ScoringConfig,
): ValuationResult;
export const CONFIG: ScoringConfig;
export const DEFAULT_CONFIG: ScoringConfig;
export function computeSectionScores(responses: unknown[], questions: unknown[]): SectionScore[];
export function totalByType(sectionScores: SectionScore[], type: string): number;
export function interpolatedMultiple(score: number, floors: number[], anchors: number[]): number;
export function marketPosition(score: number, bands: Array<{ min: number; max: number; label: string }>): string;
