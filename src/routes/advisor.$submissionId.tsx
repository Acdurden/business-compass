import { createFileRoute } from "@tanstack/react-router";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";

type AdvisorSearch = { mode?: "review" };

export const Route = createFileRoute("/advisor/$submissionId")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
  validateSearch: (search: Record<string, unknown>): AdvisorSearch => ({
    mode: search.mode === "review" ? "review" : undefined,
  }),
  component: AdvisorQuestionnairePage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">Submission not found.</div>
  ),
});

function AdvisorQuestionnairePage() {
  const { submissionId } = Route.useParams();
  const { mode } = Route.useSearch();
  const readOnly = mode === "review";
  return (
    <QuestionnaireRunner
      mode="advisor"
      submissionId={submissionId}
      questionnaireType="advisory"
      statusField="advisor_status"
      eyebrow={readOnly ? "Advisor questionnaire · Review" : "Advisor questionnaire"}
      finishLabel="Submit advisory"
      exitTo="/admin/submissions"
      notFoundTo="/admin/submissions"
      readOnly={readOnly}
      finishTo={{ to: "/admin/results/$submissionId", params: { submissionId } }}
    />
  );
}
