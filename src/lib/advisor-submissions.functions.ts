import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdvisorSubmissionRow = {
  submission_id: string;
  client_token: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  /** objective-only vs full-service; fixed at sign-up by the invite link used. */
  plan: string;
  updated_at: string;
  owner_user_id: string | null;
  advisor_id: string | null;
};

async function ensureAdvisor(context: { supabase: any; userId: string }) {
  const { data: isAdvisor } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "advisor",
  });
  if (isAdvisor !== true) {
    throw new Error("Forbidden: advisor role required");
  }
}

export const listAllSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorSubmissionRow[]> => {
    await ensureAdvisor(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select(
        "submission_id,client_token,company_name,client_status,advisor_status,plan,updated_at,owner_user_id,advisor_id",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdvisorSubmissionRow[];
  });

export type AdvisorSubmissionLoad = {
  company_name: string;
  client_token: string;
  client_status: string;
  advisor_status: string;
  responses: { question_id: string; answer_option_id: string }[];
};

export const getAdvisorSubmission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      submissionId: string;
      questionnaireType: "objective" | "advisory";
    }) => data,
  )
  .handler(async ({ data, context }): Promise<AdvisorSubmissionLoad> => {
    await ensureAdvisor(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const sub = await supabaseAdmin
      .from("submissions")
      .select("company_name,client_token,client_status,advisor_status")
      .eq("submission_id", data.submissionId)
      .maybeSingle();
    if (sub.error) throw new Error(sub.error.message);
    if (!sub.data) throw new Error("Submission not found");
    const resp = await supabaseAdmin
      .from("responses")
      .select("question_id,answer_option_id")
      .eq("submission_id", data.submissionId)
      .eq("questionnaire_type", data.questionnaireType);
    if (resp.error) throw new Error(resp.error.message);
    return {
      company_name: sub.data.company_name as string,
      client_token: sub.data.client_token as string,
      client_status: sub.data.client_status as string,
      advisor_status: sub.data.advisor_status as string,
      responses: (resp.data ?? []) as {
        question_id: string;
        answer_option_id: string;
      }[],
    };
  });

export const saveAdvisorResponse = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      submissionId: string;
      questionnaireType: "objective" | "advisory";
      questionId: string;
      sectionId: string;
      answerOptionId: string;
      answerText: string;
      points: number;
      uniqueIdResponse: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensureAdvisor(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    const responseId = `${data.submissionId}_${data.questionId}`;
    const { error } = await supabaseAdmin.from("responses").upsert(
      {
        response_id: responseId,
        submission_id: data.submissionId,
        question_id: data.questionId,
        answer_option_id: data.answerOptionId,
        section_id: data.sectionId,
        questionnaire_type: data.questionnaireType,
        unique_id_response: data.uniqueIdResponse,
        selected_answer_text: data.answerText,
        points_awarded: data.points,
        answered_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "submission_id,question_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAdvisorStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      submissionId: string;
      status: "notstarted" | "inprogress" | "submitted" | "final";
      onlyIfNotStarted?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await ensureAdvisor(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("submissions")
      .update({
        advisor_status: data.status,
        updated_at: new Date().toISOString(),
      })
      .eq("submission_id", data.submissionId);
    if (data.onlyIfNotStarted) q = q.eq("advisor_status", "notstarted");
    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Permanently delete a submission and all of its answers. The attached client
// login (owner_user_id), if any, is intentionally left intact so the client can
// start a fresh assessment. Advisor-gated; runs via the service role.
export const deleteSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { submissionId: string }) => {
    const submissionId = String(input?.submissionId ?? "").trim();
    if (!submissionId) throw new Error("submissionId required");
    return { submissionId };
  })
  .handler(async ({ data, context }) => {
    await ensureAdvisor(context);
    const { supabaseAdmin } =
      await import("@/integrations/supabase/client.server");

    // Confirm the submission exists (clearer than a silent no-op).
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("submissions")
      .select("submission_id")
      .eq("submission_id", data.submissionId)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub) throw new Error("Submission not found");

    // Delete child rows first — the foreign keys restrict deleting the parent
    // while responses / section_scores still point at it.
    const delResp = await supabaseAdmin
      .from("responses")
      .delete()
      .eq("submission_id", data.submissionId);
    if (delResp.error) throw new Error(delResp.error.message);

    const delScores = await supabaseAdmin
      .from("section_scores")
      .delete()
      .eq("submission_id", data.submissionId);
    if (delScores.error) throw new Error(delScores.error.message);

    // The client's auth account is deliberately preserved.
    const delSub = await supabaseAdmin
      .from("submissions")
      .delete()
      .eq("submission_id", data.submissionId);
    if (delSub.error) throw new Error(delSub.error.message);

    return { ok: true };
  });
