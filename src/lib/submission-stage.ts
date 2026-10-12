/**
 * Where a submission stands, decided in one place for the back office.
 *
 * The sidebar badge, the submissions filters and the dashboard tiles all ask
 * the same question ("is the next move ours or the client's?"). Answering it in
 * three files is how their counts would drift apart.
 */

export type StageInput = {
  client_status: string | null | undefined;
  advisor_status: string | null | undefined;
};

/** The client has finished their half and the questionnaire is locked. */
export function clientReady(clientStatus: string | null | undefined): boolean {
  return clientStatus === "submitted" || clientStatus === "complete";
}

export function normalizeAdvisoryStatus(
  status: string | null | undefined,
): "notstarted" | "inprogress" | "submitted" | "final" {
  if (status === "submitted" || status === "final" || status === "inprogress") return status;
  return "notstarted";
}

/**
 * The next step is the advisor's: the client has submitted and the advisory
 * review is not yet marked final. This is what the sidebar badge counts.
 */
export function needsAdvisor(r: StageInput): boolean {
  return clientReady(r.client_status) && normalizeAdvisoryStatus(r.advisor_status) !== "final";
}
