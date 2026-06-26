import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AdvisorSubmissionRow = {
  submission_id: string;
  client_token: string;
  company_name: string;
  client_status: string;
  advisor_status: string;
  updated_at: string;
  owner_user_id: string | null;
  advisor_id: string | null;
};

export const listAllSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdvisorSubmissionRow[]> => {
    // Advisor-only: clients must not list every submission.
    const { data: isClientRow } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "client",
    });
    if (isClientRow === true) {
      throw new Error("Forbidden: clients cannot list submissions");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("submissions")
      .select(
        "submission_id,client_token,company_name,client_status,advisor_status,updated_at,owner_user_id,advisor_id",
      )
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as AdvisorSubmissionRow[];
  });
