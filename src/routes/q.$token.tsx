import { createFileRoute } from "@tanstack/react-router";
import { QuestionnaireRunner } from "@/components/QuestionnaireRunner";

export const Route = createFileRoute("/q/$token")({
  ssr: false,
  component: ClientQuestionnaireByToken,
  errorComponent: ({ error }) => (
    <div className="min-h-screen grid place-items-center p-6 text-center">
      <p className="text-sm text-muted-foreground">{error.message}</p>
    </div>
  ),
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center">Submission not found.</div>
  ),
});

function ClientQuestionnaireByToken() {
  const { token } = Route.useParams();
  return (
    <QuestionnaireRunner
      mode="client"
      token={token}
      questionnaireType="objective"
      statusField="client_status"
      eyebrow="ValScore questionnaire"
      finishLabel="See my results"
      exitTo="/"
      notFoundTo="/"
    />
  );
}
