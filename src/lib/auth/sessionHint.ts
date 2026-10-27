/**
 * Cheap, synchronous "might this browser be signed in?" check that needs no
 * Supabase client. Public marketing pages use it to decide whether to load
 * the (large) auth client at all: anonymous visitors never download it.
 *
 * True when any of these is present:
 *  - the @supabase/ssr session cookie (`sb-<ref>-auth-token`, possibly
 *    chunked as `.0`, `.1`, ...), which is how the app stores sessions;
 *  - a legacy localStorage session (`sb-<ref>-auth-token`);
 *  - auth tokens or a PKCE code in the URL from an email link, which the
 *    client must exchange (detectSessionInUrl).
 *
 * False negatives only mean "show the signed-out header", which is exactly
 * what these pages showed before the session was read anyway.
 */
export function hasSupabaseSessionHint(): boolean {
  if (typeof window === "undefined") return false;
  if (/(?:^|;\s*)sb-[^=;]+-auth-token(?:\.\d+)?=/.test(document.cookie)) return true;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      if (/^sb-.+-auth-token$/.test(window.localStorage.key(i) || "")) return true;
    }
  } catch {
    // Storage blocked (private mode, embedded browser): fall through.
  }
  const { hash, search } = window.location;
  return /(?:access_token|refresh_token|error_description)=/.test(hash) || /[?&](?:code|token_hash)=/.test(search);
}
