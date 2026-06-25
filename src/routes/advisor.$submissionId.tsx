import { createFileRoute } from "@tanstack/react-router";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";

export const Route = createFileRoute("/advisor/$submissionId")({
  ssr: false,
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
      submissionId={submissionId}
      questionnaireType="advisory"
      statusField="advisor_status"
      eyebrow="Advisor questionnaire"
      finishLabel="View combined results"
      exitTo="/advisor"
      notFoundTo="/advisor"
    />
  );
}
