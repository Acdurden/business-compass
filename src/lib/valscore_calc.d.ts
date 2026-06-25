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
export interface ValuationLeg {
  multiple: number;
  marketPosition: string;
  estimatedValuation: number;
  maxValuation: number;
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
export function computeValuation(
  responses: Array<{ questionnaire_type?: string | null; section_id?: string | null; points_awarded?: number | null }>,
  questions: Array<{ section_id: string; max_score?: number | null; questionnaire_type: string }>,
  inputs: ValuationInputs,
): ValuationResult;
export const CONFIG: unknown;
export function computeSectionScores(responses: unknown[], questions: unknown[]): SectionScore[];
export function totalByType(sectionScores: SectionScore[], type: string): number;
export function interpolatedMultiple(score: number, floors: number[], anchors: number[]): number;
export function marketPosition(score: number, bands: Array<{ min: number; max: number; label: string }>): string;
