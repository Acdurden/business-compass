import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/advisor/")({
  ssr: false,
  beforeLoad: () => {
    throw redirect({ to: "/admin/submissions" });
  },
  component: () => null,
});
