/**
 * The advisor's action plan — the problem→cure recommendations.
 *
 * Two halves live in the database:
 *
 *   - the LIBRARY (`action_problems`, `action_cures`, `partner_categories`) is
 *     curated content, written once and reused on every client. It is readable
 *     by advisors and admins only. A client can read an individual library row
 *     ONLY when that exact row is on their own plan and their review has been
 *     submitted, which is what lets the client summary resolve the wording
 *     without ever being able to browse the library.
 *
 *   - the PLAN (`submission_problems`, `submission_cures`) is what one advisor
 *     flagged for one client. Actions hang off the flagged problem, so
 *     un-flagging a problem removes its actions with it (ON DELETE CASCADE) and
 *     a client can never see an action floating without its reason.
 *
 * This module is the only place either half is loaded or shaped, so the advisor
 * workspace and the client summary can never disagree about what a plan is.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Opportunity } from "@/lib/score-display";

/* ------------------------------------------------------------------ */
/* Library                                                             */
/* ------------------------------------------------------------------ */

export type LibraryProblem = {
  problem_id: string;
  section_id: string;
  problem_text: string;
  sort_order: number;
};

export type LibraryCure = {
  cure_id: string;
  problem_id: string;
  cure_text: string;
  category_id: string | null;
  sort_order: number;
};

export type PartnerCategory = {
  category_id: string;
  name: string;
};

export type Library = {
  problems: LibraryProblem[];
  cures: LibraryCure[];
  categories: PartnerCategory[];
  /** Active library problems for one advisory section, in display order. */
  problemsBySection: Map<string, LibraryProblem[]>;
  /** Active library actions under one problem, in display order. */
  curesByProblem: Map<string, LibraryCure[]>;
  problemById: Map<string, LibraryProblem>;
  cureById: Map<string, LibraryCure>;
  categoryById: Map<string, PartnerCategory>;
};

const EMPTY_LIBRARY: Library = {
  problems: [],
  cures: [],
  categories: [],
  problemsBySection: new Map(),
  curesByProblem: new Map(),
  problemById: new Map(),
  cureById: new Map(),
  categoryById: new Map(),
};

function indexLibrary(
  problems: LibraryProblem[],
  cures: LibraryCure[],
  categories: PartnerCategory[],
): Library {
  const problemsBySection = new Map<string, LibraryProblem[]>();
  problems.forEach((p) => {
    const list = problemsBySection.get(p.section_id);
    if (list) list.push(p);
    else problemsBySection.set(p.section_id, [p]);
  });

  const curesByProblem = new Map<string, LibraryCure[]>();
  cures.forEach((c) => {
    const list = curesByProblem.get(c.problem_id);
    if (list) list.push(c);
    else curesByProblem.set(c.problem_id, [c]);
  });

  return {
    problems,
    cures,
    categories,
    problemsBySection,
    curesByProblem,
    problemById: new Map(problems.map((p) => [p.problem_id, p])),
    cureById: new Map(cures.map((c) => [c.cure_id, c])),
    categoryById: new Map(categories.map((c) => [c.category_id, c])),
  };
}

/**
 * Load the curated library.
 *
 * Row-level security decides how much of it comes back: an advisor or admin
 * gets all of it, a client gets only the rows already on their own plan, and
 * anyone else gets nothing. Callers must therefore treat an empty result as
 * "nothing to show", never as an error.
 */
export async function loadLibrary(): Promise<Library> {
  const [problemsRes, curesRes, categoriesRes] = await Promise.all([
    supabase
      .from("action_problems")
      .select("problem_id,section_id,problem_text,sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("action_cures")
      .select("cure_id,problem_id,cure_text,category_id,sort_order")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("partner_categories")
      .select("category_id,name")
      .eq("active", true)
      .order("sort_order"),
  ]);

  if (problemsRes.error) throw new Error(problemsRes.error.message);
  if (curesRes.error) throw new Error(curesRes.error.message);
  // Partner categories are advisor/admin only. A client reading their own plan
  // gets an empty list here, which is intended — they are not shown the tag.
  const categories = categoriesRes.error
    ? []
    : ((categoriesRes.data ?? []) as PartnerCategory[]);

  return indexLibrary(
    (problemsRes.data ?? []) as LibraryProblem[],
    (curesRes.data ?? []) as LibraryCure[],
    categories,
  );
}

export function emptyLibrary(): Library {
  return EMPTY_LIBRARY;
}

/* ------------------------------------------------------------------ */
/* Plan                                                                */
/* ------------------------------------------------------------------ */

export type PlanProblemRow = {
  id: string;
  section_id: string;
  problem_id: string | null;
  custom_text: string | null;
  sort_order: number;
};

export type PlanCureRow = {
  id: string;
  submission_problem_id: string;
  cure_id: string | null;
  custom_text: string | null;
  sort_order: number;
};

export type Plan = {
  problems: PlanProblemRow[];
  cures: PlanCureRow[];
};

export const EMPTY_PLAN: Plan = { problems: [], cures: [] };

/**
 * Load one submission's plan.
 *
 * For a client the `submissionId` is their own; RLS additionally refuses the
 * rows until `advisor_status` is submitted or final, so a half-finished plan
 * can never reach them.
 */
export async function loadPlan(submissionId: string): Promise<Plan> {
  const problemsRes = await supabase
    .from("submission_problems")
    .select("id,section_id,problem_id,custom_text,sort_order")
    .eq("submission_id", submissionId)
    .order("sort_order");
  if (problemsRes.error) throw new Error(problemsRes.error.message);

  const problems = (problemsRes.data ?? []) as PlanProblemRow[];
  if (problems.length === 0) return { problems, cures: [] };

  const curesRes = await supabase
    .from("submission_cures")
    .select("id,submission_problem_id,cure_id,custom_text,sort_order")
    .in(
      "submission_problem_id",
      problems.map((p) => p.id),
    )
    .order("sort_order");
  if (curesRes.error) throw new Error(curesRes.error.message);

  return { problems, cures: (curesRes.data ?? []) as PlanCureRow[] };
}

/* ------------------------------------------------------------------ */
/* Shaping the plan for display                                        */
/* ------------------------------------------------------------------ */

export type PlanAction = {
  /** `submission_cures.id` */
  id: string;
  text: string;
  categoryId: string | null;
  /** Null for a client — they cannot read `partner_categories`. */
  categoryName: string | null;
  isCustom: boolean;
  sortOrder: number;
};

export type PlanItem = {
  /** `submission_problems.id` */
  id: string;
  sectionId: string;
  text: string;
  isCustom: boolean;
  sortOrder: number;
  /** Driver name and points available, when the section could be paired. */
  driverName: string | null;
  driverPoints: number | null;
  actions: PlanAction[];
};

export type DriverContext = { name: string; points: number; rank: number };

/**
 * Map each advisory section onto the driver it belongs to, and how many points
 * that driver still has available.
 *
 * `buildOpportunities` keys a full-service opportunity as `${objectiveId}-${advisoryId}`,
 * which is the only place the pairing is decided. Parsing the key here keeps a
 * single source of truth for that pairing rather than duplicating the table.
 */
export function advisoryDriverContext(
  opportunities: Opportunity[],
): Map<string, DriverContext> {
  const byAdvisorySection = new Map<string, DriverContext>();
  opportunities.forEach((o, rank) => {
    const parts = o.key.split("-");
    const advisoryId = parts.length > 1 ? parts[parts.length - 1] : o.key;
    if (byAdvisorySection.has(advisoryId)) return;
    byAdvisorySection.set(advisoryId, {
      name: o.name,
      points: Math.round(o.totalGap),
      rank,
    });
  });
  return byAdvisorySection;
}

/**
 * Turn stored rows into the ordered plan both screens render.
 *
 * Order is the value order agreed with the client-facing design: drivers with
 * the most points available first, then the advisor's own ordering inside a
 * driver. A problem whose section could not be paired sorts last rather than
 * disappearing.
 */
export function buildPlanItems(
  plan: Plan,
  library: Library,
  drivers: Map<string, DriverContext>,
): PlanItem[] {
  const curesByProblemRow = new Map<string, PlanCureRow[]>();
  plan.cures.forEach((c) => {
    const list = curesByProblemRow.get(c.submission_problem_id);
    if (list) list.push(c);
    else curesByProblemRow.set(c.submission_problem_id, [c]);
  });

  const items: PlanItem[] = plan.problems.map((row) => {
    const libraryProblem = row.problem_id
      ? library.problemById.get(row.problem_id)
      : undefined;
    const driver = drivers.get(row.section_id) ?? null;

    const actions: PlanAction[] = (curesByProblemRow.get(row.id) ?? [])
      .map((c) => {
        const libraryCure = c.cure_id
          ? library.cureById.get(c.cure_id)
          : undefined;
        const categoryId = libraryCure?.category_id ?? null;
        return {
          id: c.id,
          text: (libraryCure?.cure_text ?? c.custom_text ?? "").trim(),
          categoryId,
          categoryName: categoryId
            ? (library.categoryById.get(categoryId)?.name ?? null)
            : null,
          isCustom: c.cure_id == null,
          sortOrder: c.sort_order,
        };
      })
      .filter((a) => a.text.length > 0)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));

    return {
      id: row.id,
      sectionId: row.section_id,
      text: (libraryProblem?.problem_text ?? row.custom_text ?? "").trim(),
      isCustom: row.problem_id == null,
      sortOrder: row.sort_order,
      driverName: driver?.name ?? null,
      driverPoints: driver?.points ?? null,
      actions,
    };
  });

  const rankOf = (sectionId: string) =>
    drivers.get(sectionId)?.rank ?? Number.MAX_SAFE_INTEGER;

  return items
    .filter((i) => i.text.length > 0)
    .sort(
      (a, b) =>
        rankOf(a.sectionId) - rankOf(b.sectionId) ||
        a.sortOrder - b.sortOrder ||
        a.id.localeCompare(b.id),
    );
}

/** Every action across the plan, for the "N issues, M actions" summary line. */
export function countActions(items: PlanItem[]): number {
  return items.reduce((sum, i) => sum + i.actions.length, 0);
}
