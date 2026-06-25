import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/results/$submissionId")({
  ssr: false,
  component: ResultsStub,
});

function ResultsStub() {
  const { submissionId } = Route.useParams();
  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="max-w-md text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Submission {submissionId}
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">
          Results coming next
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The questionnaire is saved. The results page (section scores, valuation
          input, and computed valuation) will be built next once
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 text-xs">
            valscore_calc.js
          </code>
          is provided.
        </p>
        <Link
          to="/"
          className="mt-6 inline-flex rounded-md border border-border px-4 py-2 text-sm hover:bg-muted"
        >
          Back home
        </Link>
      </div>
    </main>
  );
}
