/**
 * Legacy client sign-in.
 *
 * There used to be two client sign-in screens: this one and `/client/auth`.
 * Only `/client/auth` handles invite links, password recovery and "forgot
 * password", so it is the one that survives — but old links, bookmarks and
 * anything already sent to a client may still point here, so `/login` stays as
 * a redirect rather than disappearing.
 *
 * Do not rebuild a sign-in form here. One sign-in screen, one place for a
 * client to get stuck.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/client/auth" });
  },
  component: () => null,
});
