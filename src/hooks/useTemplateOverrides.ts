/**
 * Tiny hook that prewarms the message-template cache for the current
 * company on mount. Call it once near the top of any page that uses
 * the legacy synchronous renderers (composeEmail.templateFor*,
 * whatsappTemplates.render*) so company overrides flow through to
 * those renderers without making them async.
 *
 * The hook also returns a `ready` flag + a `version` counter that
 * bumps once the cache is hot, so memoised values that depend on
 * the cache can re-compute. Most call sites can ignore both.
 */
import { useEffect, useState } from "react";
import { prewarmCompanyTemplates } from "@/services/messageTemplateService";

export function useTemplateOverrides(companyId: string | null | undefined) {
  const [ready, setReady] = useState(false);
  // Bump version once the cache is warm so any memo keyed off
  // [companyId, version] can re-evaluate against the freshly loaded
  // overrides.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setReady(true);
      return;
    }
    let cancelled = false;
    prewarmCompanyTemplates(companyId).then(() => {
      if (cancelled) return;
      setReady(true);
      setVersion((v) => v + 1);
    });
    return () => { cancelled = true; };
  }, [companyId]);

  return { ready, version };
}
