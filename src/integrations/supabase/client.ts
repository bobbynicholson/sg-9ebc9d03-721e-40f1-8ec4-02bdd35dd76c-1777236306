// We use the new @supabase/ssr client
import { createClient } from "@/lib/supabase/client";

// Export a singleton instance for backward compatibility with the rest of the app
// Note: In Next.js Pages router, this is generally safe for client-side use
// For SSR/getServerSideProps, use createPagesServerClient from @/lib/supabase/server instead
export const supabase = createClient();