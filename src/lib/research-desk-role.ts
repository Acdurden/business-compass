/**
 * Who may use the research desk: the market data and insights pages, the
 * market cards on a client's page, and the switch that marks an assessment as
 * a test.
 *
 * Admin only for now (Andrew, 3 October 2026). This is temporary, so it is
 * decided here and nowhere else: the server check in
 * `research-desk.functions.ts` and the browser check in
 * `use-research-desk-access.ts` both read this one value. Widening the desk is
 * a change to this line.
 *
 * Kept free of imports so the server and the browser can both load it.
 */
export const RESEARCH_DESK_ROLE = "admin" as const;
