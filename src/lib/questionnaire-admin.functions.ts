import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

// ============================================================
// Admin questionnaire editor — server functions
// Admin-only. All writes go through the service-role client.
// The scoring maths (question/section max_score) are recomputed
// SERVER-SIDE from answer points; the client's numbers are never trusted.
// Deletes are soft (active = false) so historical client submissions keep
// referencing the rows they were answered against.
// ============================================================

async function ensureAdmin(context: AuthedContext) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (isAdmin !== true) {
    throw new Error("Forbidden: admin role required");
  }
}

// ---------- Shared row shapes ----------
export type EditorSection = {
  section_id: string;
  section_name: string;
  questionnaire_type: string;
  sort_order: number;
  active: boolean;
  max_score: number;
};
export type EditorQuestion = {
  question_id: string;
  section_id: string;
  questionnaire_type: string;
  question_number: number;
  question_text: string;
  response_type: string;
  sort_order: number;
  active: boolean;
  max_score: number | null;
};
export type EditorAnswer = {
  id: string;
  question_id: string;
  section_id: string | null;
  option_order: number;
  answer_text: string;
  points: number | null;
  value_min: number | null;
  value_max: number | null;
  value_type: string | null;
  active: boolean;
};
export type EditorScoreBand = {
  id: string;
  band_type: string;
  questionnaire_type: string | null;
  min_score: number;
  max_score: number;
  label: string;
  extra_value: string | null;
};
export type EditorMultiple = {
  band_index: number;
  nfi_multiple: number;
  ebitda_multiple: number;
};

export type QuestionnaireEditorData = {
  sections: EditorSection[];
  questions: EditorQuestion[];
  answers: EditorAnswer[];
  scoreBands: EditorScoreBand[];
  valuationMultiples: EditorMultiple[];
};

// ---------- LOAD everything (including inactive rows) ----------
export const loadQuestionnaireEditor = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<QuestionnaireEditorData> => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [sections, questions, answers, scoreBands, multiples] = await Promise.all([
      supabaseAdmin
        .from("sections")
        .select("section_id,section_name,questionnaire_type,sort_order,active,max_score")
        .order("questionnaire_type")
        .order("sort_order"),
      supabaseAdmin
        .from("questions")
        .select(
          "question_id,section_id,questionnaire_type,question_number,question_text,response_type,sort_order,active,max_score",
        )
        .order("questionnaire_type")
        .order("sort_order"),
      supabaseAdmin
        .from("answer_options")
        .select(
          "id,question_id,section_id,option_order,answer_text,points,value_min,value_max,value_type,active",
        )
        .order("question_id")
        .order("option_order"),
      supabaseAdmin
        .from("score_bands")
        .select("id,band_type,questionnaire_type,min_score,max_score,label,extra_value")
        .order("band_type")
        .order("min_score"),
      supabaseAdmin
        .from("valuation_multiples")
        .select("band_index,nfi_multiple,ebitda_multiple")
        .order("band_index"),
    ]);

    for (const r of [sections, questions, answers, scoreBands, multiples]) {
      if (r.error) throw new Error(r.error.message);
    }

    return {
      sections: (sections.data ?? []) as EditorSection[],
      questions: (questions.data ?? []) as EditorQuestion[],
      answers: (answers.data ?? []) as EditorAnswer[],
      scoreBands: (scoreBands.data ?? []) as EditorScoreBand[],
      valuationMultiples: (multiples.data ?? []) as EditorMultiple[],
    };
  });

// ---------- SAVE (full snapshot upsert) ----------
type SavePayload = {
  sections: EditorSection[];
  questions: EditorQuestion[];
  answers: EditorAnswer[];
  scoreBands: EditorScoreBand[];
  valuationMultiples: EditorMultiple[];
};

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const saveQuestionnaire = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: SavePayload) => data)
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // ---- Basic validation ----
    if (
      !Array.isArray(data.sections) ||
      !Array.isArray(data.questions) ||
      !Array.isArray(data.answers)
    ) {
      throw new Error("Malformed payload");
    }
    if (data.sections.length === 0 || data.questions.length === 0) {
      throw new Error("Refusing to save an empty questionnaire");
    }
    const requireUnique = (ids: string[], what: string) => {
      const seen = new Set<string>();
      for (const id of ids) {
        if (!id || typeof id !== "string") throw new Error(`Missing ${what} id`);
        if (seen.has(id)) throw new Error(`Duplicate ${what} id: ${id}`);
        seen.add(id);
      }
    };
    requireUnique(
      data.sections.map((s) => s.section_id),
      "section",
    );
    requireUnique(
      data.questions.map((q) => q.question_id),
      "question",
    );
    requireUnique(
      data.answers.map((a) => a.id),
      "answer",
    );

    // ---- Cascade: a hidden section hides its questions ----
    const inactiveSectionIds = new Set(
      data.sections.filter((s) => s.active === false).map((s) => s.section_id),
    );
    const questions = data.questions.map((q) => ({
      ...q,
      active: inactiveSectionIds.has(q.section_id) ? false : q.active !== false,
    }));

    // ---- Recompute question.max_score (single-select => highest active option) ----
    const answersByQ = new Map<string, EditorAnswer[]>();
    for (const a of data.answers) {
      const arr = answersByQ.get(a.question_id) ?? [];
      arr.push(a);
      answersByQ.set(a.question_id, arr);
    }
    const questionMax = new Map<string, number>();
    for (const q of questions) {
      const opts = (answersByQ.get(q.question_id) ?? []).filter(
        (a) => a.active !== false && toNum(a.points) !== null,
      );
      const max = opts.length ? Math.max(...opts.map((a) => Number(toNum(a.points)))) : 0;
      questionMax.set(q.question_id, max);
    }

    // ---- Recompute section.max_score (sum of active questions' max) ----
    const sectionMax = new Map<string, number>();
    for (const q of questions) {
      if (q.active === false) continue;
      sectionMax.set(
        q.section_id,
        (sectionMax.get(q.section_id) ?? 0) + (questionMax.get(q.question_id) ?? 0),
      );
    }

    // ---- Build rows for upsert ----
    const sectionRows = data.sections.map((s) => ({
      section_id: s.section_id,
      section_name: s.section_name,
      questionnaire_type: s.questionnaire_type,
      sort_order: Number(s.sort_order) || 0,
      active: s.active !== false,
      max_score: sectionMax.get(s.section_id) ?? 0,
    }));
    const questionRows = questions.map((q) => ({
      question_id: q.question_id,
      section_id: q.section_id,
      questionnaire_type: q.questionnaire_type,
      question_number: Number(q.question_number) || Number(q.sort_order) || 0,
      question_text: q.question_text ?? "",
      response_type: q.response_type || "SingleSelect",
      sort_order: Number(q.sort_order) || 0,
      active: q.active !== false,
      max_score: questionMax.get(q.question_id) ?? 0,
    }));
    const answerRows = data.answers.map((a) => ({
      id: a.id,
      question_id: a.question_id,
      section_id: a.section_id ?? null,
      option_order: Number(a.option_order) || 0,
      answer_text: a.answer_text ?? "",
      points: toNum(a.points),
      value_min: toNum(a.value_min),
      value_max: toNum(a.value_max),
      value_type: a.value_type ?? "Text",
      active: a.active !== false,
    }));

    // ---- Persist (parents first for FK safety) ----
    const secUp = await supabaseAdmin
      .from("sections")
      .upsert(sectionRows, { onConflict: "section_id" });
    if (secUp.error) throw new Error(`sections: ${secUp.error.message}`);

    const qUp = await supabaseAdmin
      .from("questions")
      .upsert(questionRows, { onConflict: "question_id" });
    if (qUp.error) throw new Error(`questions: ${qUp.error.message}`);

    const aUp = await supabaseAdmin.from("answer_options").upsert(answerRows, { onConflict: "id" });
    if (aUp.error) throw new Error(`answers: ${aUp.error.message}`);

    // ---- Score bands (edit-only; count is fixed to keep engine alignment) ----
    if (Array.isArray(data.scoreBands) && data.scoreBands.length) {
      const bandRows = data.scoreBands.map((b) => ({
        id: b.id,
        band_type: b.band_type,
        questionnaire_type: b.questionnaire_type ?? null,
        min_score: Number(toNum(b.min_score) ?? 0),
        max_score: Number(toNum(b.max_score) ?? 0),
        label: b.label ?? "",
        extra_value: b.extra_value ?? null,
      }));
      const bUp = await supabaseAdmin.from("score_bands").upsert(bandRows, { onConflict: "id" });
      if (bUp.error) throw new Error(`score_bands: ${bUp.error.message}`);
    }

    // ---- Valuation multiples (band_index-aligned anchors) ----
    if (Array.isArray(data.valuationMultiples) && data.valuationMultiples.length) {
      const mRows = data.valuationMultiples.map((m) => ({
        band_index: Number(m.band_index),
        nfi_multiple: Number(toNum(m.nfi_multiple) ?? 0),
        ebitda_multiple: Number(toNum(m.ebitda_multiple) ?? 0),
      }));
      const mUp = await supabaseAdmin
        .from("valuation_multiples")
        .upsert(mRows, { onConflict: "band_index" });
      if (mUp.error) throw new Error(`valuation_multiples: ${mUp.error.message}`);
    }

    return { ok: true, savedAt: new Date().toISOString() };
  });
