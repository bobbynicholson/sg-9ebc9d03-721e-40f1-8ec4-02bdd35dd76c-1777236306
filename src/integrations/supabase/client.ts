// We use the new @supabase/ssr client
import { createClient } from "@/lib/supabase/client";

// Lazy singleton. Previously this constructed at module load
// (`export const supabase = createClient()`), which meant any server-side
// chunk that imported the module instantiated the client at build time.
// During `next build` page-data collection on Vercel that flow throws
// when NEXT_PUBLIC_SUPABASE_* env vars aren't piped through to the
// build (build cache invalidation can surface this). The lazy proxy
// keeps the existing import shape (`import { supabase }`) but defers
// construction until first property access. Browser callers and runtime
// API handlers see no behaviour change; build-time module loaders
// don't trigger the env-var guard.
let _client: ReturnType<typeof createClient> | null = null;
function getClient() {
  if (!_client) _client = createClient();
  return _client;
}

export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop, receiver) {
    return Reflect.get(getClient() as object, prop, receiver);
  },
}) as ReturnType<typeof createClient>;