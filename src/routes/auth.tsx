/**
 * Legacy advisor sign-in.
 *
 * Until 12 October 2026 advisors and admins signed in here and clients at
 * `/client/auth`. There is now one sign-in screen for everyone, at
 * `/client/auth`, which sends each person on by role. This address stays as a
 * redirect so bookmarks and older links keep working, and it carries the
 * `redirect` parameter through so an advisor still lands on the page they were
 * heading to.
 *
 * Do not rebuild a sign-in form here. One sign-in screen, one place to get
 * stuck.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/client/auth",
      search: search.redirect ? { redirect: search.redirect } : {},
    });
  },
  component: () => null,
});
