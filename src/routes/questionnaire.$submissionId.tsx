import { createFileRoute } from "@tanstack/react-router";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";

export const Route = createFileRoute("/questionnaire/$submissionId")({
  ssr: false,
  component: ClientQuestionnairePage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">Submission not found.</div>
  ),
});

function ClientQuestionnairePage() {
  const { submissionId } = Route.useParams();
  return (
    <QuestionnaireRunner
      submissionId={submissionId}
      questionnaireType="objective"
      statusField="client_status"
      eyebrow="Valuation questionnaire"
      finishLabel="See my results"
      exitTo="/"
      notFoundTo="/"
    />
  );
}
