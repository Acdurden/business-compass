import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RESEARCH_DESK_ROLE } from "@/lib/research-desk-role";

/**
 * Whether the signed-in person may see research desk controls: `null` while
 * still asking, then true or false.
 *
 * This only decides what to draw. The boundary is `ensureResearchDesk` in
 * `research-desk.functions.ts`, which every research desk server function
 * calls before it touches anything.
 */
export function useResearchDeskAccess(): boolean | null {
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return false;
      const { data: hasRole } = await supabase.rpc("has_role", {
        _user_id: data.session.user.id,
        _role: RESEARCH_DESK_ROLE,
      });
      return hasRole === true;
    })()
      .catch(() => false)
      .then((v) => {
        if (!cancelled) setAllowed(v);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return allowed;
}
