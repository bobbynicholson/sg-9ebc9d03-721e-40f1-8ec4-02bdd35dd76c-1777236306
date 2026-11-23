type RoleSelectionRouter = {
  asPath: string;
  replace: (url: string) => Promise<boolean>;
};

const roleSelectionNavigation = new WeakMap<object, { href: string; promise: Promise<void> }>();
const SAME_URL_RELOAD_KEY = "__auth_same_url_reload_at";

function reloadForSameUrlNavigation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!message.includes("Invariant: attempted to hard navigate to the same URL")) return false;
  if (typeof window === "undefined") return false;

  try {
    const lastReload = Number(window.sessionStorage.getItem(SAME_URL_RELOAD_KEY) || 0);
    if (Date.now() - lastReload < 15_000) return false;
    window.sessionStorage.setItem(SAME_URL_RELOAD_KEY, String(Date.now()));
  } catch {
    // If browser storage is unavailable, surface the original error instead
    // of risking an unbounded reload loop.
    return false;
  }

  // Next may have updated the address bar before a stale route chunk failed
  // to load. Reload the document to fetch the current deploy's page bundle.
  window.location.reload();
  return true;
}

/** Coalesce simultaneous session-restore and submit-handler login redirects. */
export async function navigateToRoleSelection(
  router: RoleSelectionRouter,
  redirectTo?: string,
): Promise<void> {
  const href = redirectTo
    ? `/auth/select-role?redirectTo=${encodeURIComponent(redirectTo)}`
    : "/auth/select-role";

  if (router.asPath === href) return;

  const existing = roleSelectionNavigation.get(router);
  if (existing?.href === href) {
    await existing.promise;
    return;
  }

  const promise = (async () => {
    try {
      await router.replace(href);
    } catch (error) {
      if (reloadForSameUrlNavigation(error)) return;
      throw error;
    }
  })();

  roleSelectionNavigation.set(router, { href, promise });
  try {
    await promise;
  } finally {
    if (roleSelectionNavigation.get(router)?.promise === promise) {
      roleSelectionNavigation.delete(router);
    }
  }
}
