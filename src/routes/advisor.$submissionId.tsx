import { createFileRoute } from "@tanstack/react-router";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";
import { requireAdvisorAuth } from "@/lib/require-advisor-auth";

export const Route = createFileRoute("/advisor/$submissionId")({
  ssr: false,
  beforeLoad: ({ location }) => requireAdvisorAuth(location.href),
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
  return (
    <QuestionnaireRunner
      mode="advisor"
      submissionId={submissionId}
      questionnaireType="advisory"
      statusField="advisor_status"
      eyebrow="Advisor questionnaire"
      finishLabel="View combined results"
      exitTo="/admin/submissions"
      notFoundTo="/admin/submissions"
      finishTo={{ to: "/admin/results/$submissionId", params: { submissionId } }}
    />
  );
}
