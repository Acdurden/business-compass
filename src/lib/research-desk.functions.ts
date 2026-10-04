import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { RESEARCH_DESK_ROLE } from "@/lib/research-desk-role";

/** What the auth middleware puts on `context`, as far as these helpers need it. */
type AuthedContext = { supabase: SupabaseClient<Database>; userId: string };

// ============================================================
// Research desk: server functions.
// Every function here calls `ensureResearchDesk` first. That check is the
// boundary; the route guards and hidden controls in the browser are only a
// courtesy. Reads and writes go through the service-role client, because the
// market tables have no browser access at all and `submissions.is_test` can
// only be changed by the service role (see the guard trigger in
// supabase/migrations/20261003120000_add_submissions_is_test.sql).
// ============================================================

async function ensureResearchDesk(context: AuthedContext) {
  const { data: allowed } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: RESEARCH_DESK_ROLE,
  });
  if (allowed !== true) {
    throw new Error(`Forbidden: ${RESEARCH_DESK_ROLE} role required`);
  }
}

/** The submission ids currently marked as tests. */
export const listTestSubmissionIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<string[]> => {
    await ensureResearchDesk(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select("submission_id")
      .eq("is_test", true);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.submission_id);
  });

/**
 * Mark an assessment as a test, or as real.
 *
 * A test stays in the app and works as before; it only drops out of the
 * Insights metrics. Nothing a client sees changes.
 *
 * `updated_at` is deliberately left alone: the submissions list sorts on it,
 * and flipping this switch is bookkeeping, not progress on the assessment.
 */
export const setSubmissionTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { submissionId: string; isTest: boolean }) => {
    const submissionId = String(input?.submissionId ?? "").trim();
    if (!submissionId) throw new Error("submissionId required");
    if (typeof input?.isTest !== "boolean") throw new Error("isTest must be true or false");
    return { submissionId, isTest: input.isTest };
  })
  .handler(async ({ data, context }) => {
    await ensureResearchDesk(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: updated, error } = await supabaseAdmin
      .from("submissions")
      .update({ is_test: data.isTest })
      .eq("submission_id", data.submissionId)
      .select("submission_id,is_test");
    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) throw new Error("Submission not found");
    return { ok: true as const, isTest: updated[0].is_test };
  });
