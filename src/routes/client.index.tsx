import { createFileRoute, useNavigate, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/client/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/client/auth" });
    }
    const { data: isClient } = await supabase.rpc("has_role", {
      _user_id: data.session.user.id,
      _role: "client",
    });
    if (!isClient) {
      throw redirect({ to: "/client/auth" });
    }
    return { email: data.session.user.email ?? "" };
  },
  head: () => ({ meta: [{ title: "Client portal" }] }),
  component: ClientHome,
});

function ClientHome() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? "");
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/client/auth" });
  }

  return (
    <main className="min-h-screen">
      <header className="border-b border-border/60">
        <div className="mx-auto max-w-3xl px-6 py-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Client portal
            </p>
            <h1 className="text-lg font-semibold tracking-tight">Welcome</h1>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void signOut()}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign out
          </Button>
        </div>
      </header>
      <section className="mx-auto max-w-3xl px-6 py-16">
        <h2 className="text-3xl font-semibold tracking-tight">Welcome{email ? `, ${email}` : ""}</h2>
        <p className="mt-3 text-muted-foreground">
          Your client portal is being set up. Check back soon for your valuation
          questionnaire and results.
        </p>
      </section>
    </main>
  );
}
