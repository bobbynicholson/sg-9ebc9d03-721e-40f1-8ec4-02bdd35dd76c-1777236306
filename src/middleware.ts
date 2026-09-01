import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getLandingPageForRoleString } from "@/lib/authGuards";
import { readCachedProfile, writeCachedProfile } from "@/lib/middleware/profileCache";
import { deriveUserRoles, normalizeRoleValue } from "@/lib/roleDerivation";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/",
  "/auth/login",
  "/auth/register",
  "/auth/callback",
  "/auth/reset-password",
  "/company-signup",
  "/contact",
  "/pricing",
  "/features",
  "/terms",
  "/privacy",
  "/security",
  "/support",
  "/demo",
  "/blog",
  "/api",
  "/favicon.ico",
  "/robots.txt",
  "/uk",
  "/us",
  "/eu",
  "/page",
  "/pay",
];

// Route authorization rules - maps route prefixes to allowed roles.
// Deny-default: any authenticated route that does not match an entry here is rejected.
//
// Multi-branch admin variants (Stage 0-3): region_admin is scoped to one or
// more branches via profiles.regions_covered; sales_admin is cross-branch
// but read-only on kitchen / dispatch ops. Both reach /admin/* the same
// way as company_admin - RLS narrows their data, not the route.
const ALL_AUTHENTICATED_ROLES = [
  "super_admin", "company_admin", "region_admin", "sales_admin", "admin", "owner",
  "kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff", "client",
];

const ADMIN_PORTAL_ROLES = ["super_admin", "company_admin", "region_admin", "sales_admin", "admin", "owner"];

const ROUTE_GUARDS: Record<string, string[]> = {
  "/admin/platform": ["super_admin"],
  "/admin/teams/kitchen": [...ADMIN_PORTAL_ROLES, "kitchen_manager"],
  "/admin/kitchen-schedule": [...ADMIN_PORTAL_ROLES, "kitchen_manager"],
  "/admin/kitchen-settings": [...ADMIN_PORTAL_ROLES, "kitchen_manager"],
  "/admin/teams/cleaning": [...ADMIN_PORTAL_ROLES, "cleaning_manager"],
  "/admin/cleaning-schedule": [...ADMIN_PORTAL_ROLES, "cleaning_manager"],
  "/admin": ADMIN_PORTAL_ROLES,
  "/team-portal/kitchen": [...ADMIN_PORTAL_ROLES, "kitchen_manager", "kitchen_staff"],
  "/team-portal/shopping": [...ADMIN_PORTAL_ROLES, "shopping_staff"],
  "/team-portal/driver": [...ADMIN_PORTAL_ROLES, "driver"],
  "/team-portal/waiter": [...ADMIN_PORTAL_ROLES, "waiter"],
  // CLN2-C follow-up (2026-05-19): admit kitchen_staff to
  // /team-portal/cleaning. PR #115 (KIT2-A) put a "Cleaning schedule"
  // CTA in the kitchen dashboard header per Bobby's "kitchen sees
  // cleaning schedule" directive. PR #123 admitted kitchen_staff at
  // the page-level ProtectedRoute - but THIS middleware was still
  // bouncing them at the route layer. Both gates have to allow the
  // role or the CTA 403s. Write actions on the cleaning dashboard
  // (clock-in button, damage report) stay gated per-component, so a
  // kitchen lead reading this page can still only read - not write.
  "/team-portal/cleaning": [...ADMIN_PORTAL_ROLES, "cleaning_manager", "cleaning_staff", "kitchen_manager", "kitchen_staff"],
  "/team-portal/general": [...ADMIN_PORTAL_ROLES, "kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff"],
  "/team-portal": [...ADMIN_PORTAL_ROLES, "kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff"],
  "/client-portal": [...ADMIN_PORTAL_ROLES, "client"],
  "/client": [...ADMIN_PORTAL_ROLES, "client"],
  "/subscription": ADMIN_PORTAL_ROLES,
  "/account": ALL_AUTHENTICATED_ROLES,
  // ODOC: unified OrderDocument at /order/[id]. Every internal role
  // can view (waiter included). Clients are admitted too: the client
  // portal "View details" links to /order/[id]?role=client (the doc
  // renders a client-appropriate view), and RLS still scopes which
  // order rows a client can read. (Magic-link visitors keep using the
  // token path /c/order/[token].)
  "/order": [...ADMIN_PORTAL_ROLES, "kitchen_manager", "kitchen_staff", "shopping_staff", "driver", "waiter", "cleaning_manager", "cleaning_staff", "client"],
};

// Check if user role has access to a specific route.
// Returns false (deny) if no guard matches - every protected prefix must be listed above.
const isAuthorizedForRoute = (pathname: string, userRole: string): boolean => {
  const sortedGuards = Object.entries(ROUTE_GUARDS).sort((a, b) => b[0].length - a[0].length);

  for (const [routePrefix, allowedRoles] of sortedGuards) {
    if (pathname === routePrefix || pathname.startsWith(routePrefix + "/")) {
      return allowedRoles.includes(userRole);
    }
  }

  return false;
};

const isAuthorizedForAnyRole = (pathname: string, userRoles: string[]): boolean => {
  return userRoles.some((role) => isAuthorizedForRoute(pathname, role));
};

const hasAnyRole = (userRoles: string[], allowedRoles: string[]): boolean => {
  return userRoles.some((role) => allowedRoles.includes(role));
};

// Check if path is a public route
const isPublicRoute = (pathname: string) => {
  // Exact match for homepage
  if (pathname === "/") return true;

  // Tenant-scoped staff login: /[slug]/login
  if (/^\/[^\/]+\/login$/.test(pathname)) return true;

  // Tenant-scoped client magic-link login: /[slug]/client/login
  if (/^\/[^\/]+\/client\/login$/.test(pathname)) return true;

  // Tenant-scoped magic-link auth callback: /[slug]/auth/callback.
  // The callback handles its own session creation via Supabase, so it
  // must be reachable without an existing session.
  if (/^\/[^\/]+\/auth\/callback$/.test(pathname)) return true;

  // TIGHTEN I.115 (2026-06-02): tenant-scoped customer public surfaces.
  // /[slug]/q/{token}, /[slug]/c/order/{id}, /[slug]/pay/i/{token} all
  // get the same public treatment as the bare /q, /c, /pay/i paths.
  // The next.config rewrite turns these into /q/{token}?company_slug=X
  // etc; this middleware short-circuit lets the rewrite happen without
  // an auth bounce.
  if (
    /^\/[^\/]+\/q\/[^\/]+$/.test(pathname) ||
    /^\/[^\/]+\/c\/order\//.test(pathname) ||
    /^\/[^\/]+\/pay\/i\/[^\/]+$/.test(pathname)
  ) {
    return true;
  }

  // Dynamic prefixes
  if (
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/uk/") ||
    pathname.startsWith("/us/") ||
    pathname.startsWith("/eu/") ||
    // POPIA/CPA: per-caterer T&Cs page linked from every email footer,
    // quote/invoice/receipt PDF and the client portal. Must be readable
    // without a session (clients follow it from an email).
    pathname.startsWith("/terms/") ||
    // CPA: one-click unsubscribe from email footers - the whole point is
    // that the recipient has no session.
    pathname.startsWith("/u/") ||
    pathname.startsWith("/page/") ||
    pathname.startsWith("/pay/invoice/") ||
    pathname.startsWith("/pay/i/") ||
    pathname.startsWith("/features/") ||
    pathname.startsWith("/api/public/") ||
    pathname.startsWith("/api/client-tokens/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/q/") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/auth/")
  ) {
    return true;
  }

  // Exact matches
  return PUBLIC_ROUTES.includes(pathname);
};

// Routes that should trigger role-based redirection
const shouldRedirectToRoleLanding = (pathname: string) => {
  return (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname === "/admin/dashboard" ||
    pathname === "/team-portal" ||
    pathname === "/client-portal"
  );
};

// ── Middleware-level structured logging (Edge-compatible - no fs) ──────────────
// This runs on the Edge runtime so we cannot use the file logger.
// These console.log calls are picked up by the Node.js instrumentation
// console patch when the page handler runs server-side.
function mwLog(level: "INFO" | "WARN" | "AUTH" | "DENY", message: string, ctx?: Record<string, string | null | undefined>) {
  const ctxStr = ctx ? " " + JSON.stringify(ctx) : "";
  const line = `[middleware] [${level}] ${message}${ctxStr}`;
  if (level === "DENY" || level === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export async function middleware(request: NextRequest) {
  mwLog("INFO", `request ${request.nextUrl.pathname}`);

  // Redirect old platform admin URLs to new unified structure
  if (request.nextUrl.pathname.startsWith("/cateringms-platform") ||
      request.nextUrl.pathname.startsWith("/super-admin")) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname
      .replace("/cateringms-platform", "/admin/platform")
      .replace("/super-admin", "/admin/platform");
    return NextResponse.redirect(url, 301); // Permanent redirect
  }

  // 🔧 DEV MODE: Skip all auth checks on localhost.
  // This is deliberately limited to non-production builds and loopback
  // hosts. The client AuthContext and ProtectedRoute already use the same
  // local-only dev identity, so requiring ?dev here made normal local
  // navigation bounce back to login as soon as a link dropped the query.
  if (process.env.NODE_ENV !== "production") {
    const isDevEnvironment =
      (request.nextUrl.hostname === "localhost" ||
       request.nextUrl.hostname === "127.0.0.1");

    if (isDevEnvironment) {
      return NextResponse.next();
    }
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return response; // Cannot auth without env vars
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { pathname } = request.nextUrl;

  // Skip middleware for static files and ALL api routes.
  //
  // Why every /api/ route, not just webhooks: the tenant-slug detector
  // below uses /^\/([^\/]+)\/(admin|...)/  which matches /api/admin/...
  // and incorrectly captures "api" as the company slug. That triggers a
  // tenant_mismatch redirect on POSTs (e.g. /api/admin/create-user),
  // which Next turns into a 405 because the role-landing page doesn't
  // accept POSTs.
  //
  // Every /api/ handler in this codebase already does its own session
  // and role check via createPagesServerClient (see e.g.
  // /api/admin/create-user, /api/admin/delete-user) - the middleware
  // adds nothing here and breaks the auth flow for write endpoints.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/") ||
    // LCF-G (task #228, 2026-05-25): public embed assets bypass the
    // auth gate. /embed/loader.js, /embed/helpers.js, /embed/demo.html
    // and the per-template files in /embed/templates/ are all meant
    // to load from any third-party site (the tenant's marketing
    // page) and from our own admin live-preview iframes. Without
    // this bypass, /embed/demo.html (no recognised extension) fell
    // through to the route-guard which has no entry for /embed/ and
    // bounced every iframe load to the dashboard with
    // ?error=unauthorized - so every form thumbnail rendered the
    // admin dashboard inside it instead of the actual form.
    pathname.startsWith("/embed/") ||
    // Tightened from pathname.includes(".") - that crude check matched
    // /api/foo.bar style paths too. Only skip the session check for the
    // last segment carrying a static-file extension (ico/png/jpg/webp/
    // svg/gif/woff/woff2/css/js/map/txt/xml/json/pdf/html). The check
    // is anchored to the trailing segment so a route like
    // /clients/john.doe wouldn't be misclassified as a file. LCF-G
    // added html to the list because /embed/demo.html is a static
    // asset and the per-tenant embed loader serves it raw.
    /\.(?:ico|png|jpg|jpeg|webp|svg|gif|avif|woff2?|css|js|map|txt|xml|json|pdf|html|webmanifest|wav|mp3|ogg|m4a|aac)$/i.test(pathname)
  ) {
    return response;
  }

  // IMPORTANT: getUser revalidates the token against the Auth server
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = isPublicRoute(pathname);

  // Extract company slug if present for dynamic tenant routing.
  // Matches /[slug]/admin/..., /[slug]/team-portal/..., /[slug]/client-portal/...,
  // /[slug]/account/..., /[slug]/subscription/..., /[slug]/order/...
  //
  // ODOC: 'order' added so the unified OrderDocument lives under the
  // tenant slug path too. Without it, the middleware doesn't recognise
  // /[slug]/order/[id] as a tenant-scoped route and treats the slug
  // as part of the route name, which fails the access-route gate.
  let companySlug: string | null = null;
  const companySlugMatch = pathname.match(
    /^\/([^\/]+)\/(admin|team-portal|client-portal|account|subscription|order)/,
  );
  if (companySlugMatch && companySlugMatch[1]) {
    companySlug = companySlugMatch[1];
  }

  // Handle unauthenticated users
  if (!user && !isPublic) {
    mwLog("AUTH", `unauthenticated - redirect to login`, { path: pathname });
    const url = request.nextUrl.clone();

    if (companySlug && companySlug !== "auth" && companySlug !== "admin" && companySlug !== "api") {
      // Client-portal routes go to the client magic-link login. Staff
      // routes (admin, team-portal) go to the staff password login. The
      // captured group at companySlugMatch[2] tells us which.
      const portalKind = companySlugMatch?.[2];
      url.pathname =
        portalKind === "client-portal"
          ? `/${companySlug}/client/login`
          : `/${companySlug}/login`;
    } else {
      url.pathname = "/auth/login";
    }

    if (pathname !== "/auth/login" && !pathname.endsWith("/login")) {
      url.searchParams.set("redirectTo", pathname);
    }

    return NextResponse.redirect(url);
  }

  if (!user) {
    return response;
  }

  // Single profile fetch shared across all authenticated checks below.
  // Signed-cookie cache (P2-15) short-circuits the two DB queries on
  // rapid navigations; on miss we run the original queries and rewrite
  // the cookie at the end of the request.
  let profileRole: string | null = null;
  let profileRoles: string[] = [];
  let profileCompanyId: string | null = null;
  let userCompanySlug: string | undefined;
  let onboardingCompletedAt: string | null = null;
  let subscriptionStatus: string | null = null;
  let cacheHit = false;

  const cached = await readCachedProfile(request, user.id);
  if (cached) {
    profileRole = normalizeRoleValue(cached.role) || cached.role;
    profileRoles = (cached.roles && cached.roles.length > 0 ? cached.roles : [cached.role])
      .map((role) => normalizeRoleValue(role))
      .filter((role): role is NonNullable<ReturnType<typeof normalizeRoleValue>> => !!role);
    if (profileRoles.length === 0 && cached.role) {
      profileRoles = [cached.role];
    }
    if (!profileRole && profileRoles.length > 0) {
      profileRole = profileRoles[0];
    }
    profileCompanyId = cached.company_id;
    userCompanySlug = cached.slug ?? undefined;
    onboardingCompletedAt = cached.onboarding_completed_at;
    subscriptionStatus = cached.subscription_status ?? null;
    cacheHit = true;
  } else {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role, active_role, company_id")
        .eq("id", user.id)
        .single();
      profileCompanyId = profile?.company_id ?? null;

      const { data: departmentRows, error: departmentError } = await supabase
        .from("user_departments")
        .select("department, is_primary")
        .eq("user_id", user.id)
        .order("is_primary", { ascending: false });
      if (departmentError) {
        console.error("[Middleware] Error fetching user departments:", departmentError);
      }

      const derivedRoles = deriveUserRoles({
        profileRole: profile?.role,
        activeRole: profile?.active_role,
        departments: departmentRows || [],
      });
      profileRoles = derivedRoles.roles;
      profileRole = derivedRoles.activeRole;
      if (profile?.role && !normalizeRoleValue(profile.role) && profile.role !== "client") {
        profileRoles = [profile.role];
        profileRole = profile.role;
      }
    } catch (error) {
      console.error("[Middleware] Error fetching profile:", error);
    }

    // Resolve user's own company slug + onboarding state for slug-aware
    // landing redirects. We piggyback the onboarding_completed_at lookup
    // on the slug fetch so it's a single round trip per request.
    if (profileCompanyId) {
      try {
        const { data: company } = await supabase
          .from("companies")
          .select("slug, onboarding_completed_at, subscription_status")
          .eq("id", profileCompanyId)
          .single();
        userCompanySlug = company?.slug ?? undefined;
        onboardingCompletedAt = company?.onboarding_completed_at ?? null;
        subscriptionStatus = (company as any)?.subscription_status ?? null;
      } catch (error) {
        console.error("[Middleware] Error fetching user company slug:", error);
      }
    }
  }

  const baseLandingPage = profileRole
    ? getLandingPageForRoleString(profileRole, userCompanySlug)
    : undefined;
  const isSuperAdmin = profileRoles.includes("super_admin");

  // Onboarding-aware landing override: a tenant admin/owner with
  // incomplete onboarding lands on /admin/onboarding instead of the
  // dashboard, so they pick up where they left off rather than staring
  // at a wall of zeros. Once onboarding_completed_at is set on
  // companies, we revert to the normal landing.
  const isAdminish =
    hasAnyRole(profileRoles, ["company_admin", "admin", "owner"]);
  const roleLandingPage =
    isAdminish && !onboardingCompletedAt && userCompanySlug
      ? `/${userCompanySlug}/admin/onboarding`
      : baseLandingPage;

  // ✅ Redirect authenticated users away from auth pages to their landing
  if (pathname === "/auth/login" || pathname === "/auth/register") {
    if (roleLandingPage) {
      const url = request.nextUrl.clone();
      url.pathname = roleLandingPage;
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  // ✅ Role-based landing redirect for generic landing routes
  if (shouldRedirectToRoleLanding(pathname) && roleLandingPage && pathname !== roleLandingPage) {
    const url = request.nextUrl.clone();
    url.pathname = roleLandingPage;
    console.log(`[Middleware] Redirecting ${profileRole} from ${pathname} to ${roleLandingPage}`);
    return NextResponse.redirect(url);
  }

  // ✅ Slug-prefix enforcement.
  //
  // Bobby's rule: every page a tenant user touches has their company
  // slug in the URL. If an authenticated tenant user lands on a bare
  // /admin/..., /team-portal/..., /account/... or /subscription/...
  // URL (e.g. via an old bookmark or a nav we missed), redirect to the
  // slug-prefixed form so their address bar reads
  // /spit-braai-delivery/admin/... end-to-end.
  //
  // super_admin bypasses - they navigate across tenants and don't have
  // a single "their" slug.
  //
  // Skip when the path already starts with the user's slug, when we
  // can't resolve the slug, and when the pathname is /admin/platform/*
  // (super-admin internal pages live at the bare path even for them).
  if (
    profileRole &&
    !isSuperAdmin &&
    userCompanySlug &&
    !pathname.startsWith("/admin/platform")
  ) {
    const tenantPrefixes = ["/admin", "/team-portal", "/client-portal", "/account", "/subscription"];
    const isBareTenantPath = tenantPrefixes.some(
      (p) => pathname === p || pathname.startsWith(p + "/"),
    );
    if (isBareTenantPath) {
      const url = request.nextUrl.clone();
      url.pathname = `/${userCompanySlug}${pathname}`;
      // Preserve query string so deep links keep working.
      console.log(
        `[Middleware] Slug-prefixing ${pathname} -> ${url.pathname} for ${profileRole}`,
      );
      return NextResponse.redirect(url);
    }
  }

  // ✅ Tenant slug validation: /[slug]/admin|team-portal|client-portal/...
  // super_admin bypasses; everyone else must own the slug they're hitting.
  // We already resolved userCompanySlug above (from cache or the
  // companies.select earlier) - compare against that instead of
  // re-querying.
  //
  // Clients are the exception to the profiles.company_id rule: a client
  // belongs to tenants through the `clients` table (clients.user_id), and
  // the same person can be a customer of several catering companies. Their
  // profile carries at most the FIRST company they ever signed in through
  // (often null for older accounts). So when the profile-based comparison
  // fails for a client, we verify membership against the clients table
  // before denying - otherwise every magic-link sign-in from a second
  // caterer (or any client with a null profiles.company_id) bounces to
  // the wrong portal with ?error=tenant_mismatch / no_company.
  if (companySlug && profileRole && !isSuperAdmin) {
    const slugMatchesProfile =
      !!profileCompanyId && !!userCompanySlug && userCompanySlug === companySlug;
    if (!slugMatchesProfile) {
      let clientMembership = false;
      if (profileRoles.includes("client")) {
        try {
          // Slug -> company id via the SECURITY DEFINER branding RPC
          // (same one the login/callback pages use - callable for any
          // session, returns id + safe branding fields only).
          const { data: brandData } = await supabase.rpc("get_company_branding", {
            p_slug: companySlug,
          });
          const brand = Array.isArray(brandData) ? brandData[0] : brandData;
          const targetCompanyId = (brand as { id?: string } | null)?.id;
          if (targetCompanyId) {
            // clients RLS permits user_id = auth.uid() reads, so this
            // works with the client's own session.
            const { data: membershipRows } = await supabase
              .from("clients")
              .select("id")
              .eq("user_id", user.id)
              .eq("company_id", targetCompanyId)
              .limit(1);
            clientMembership = !!membershipRows && membershipRows.length > 0;
          }
        } catch (error) {
          console.error("[Middleware] client tenant membership check failed:", error);
        }
      }
      if (clientMembership) {
        mwLog("AUTH", "client_membership_ok", { role: profileRole, path: pathname, tenant: companySlug });
      } else if (!profileCompanyId) {
        mwLog("DENY", "no_company", { role: profileRole, path: pathname });
        const url = request.nextUrl.clone();
        url.pathname = roleLandingPage ?? "/auth/login";
        url.searchParams.set("error", "no_company");
        return NextResponse.redirect(url);
      } else {
        mwLog("DENY", "tenant_mismatch", { role: profileRole, company: profileCompanyId ?? undefined, path: pathname });
        console.log(`[Middleware] Tenant mismatch: ${profileRole} (company=${profileCompanyId}) tried ${pathname}`);
        const url = request.nextUrl.clone();
        url.pathname = roleLandingPage ?? "/auth/login";
        url.searchParams.set("error", "tenant_mismatch");
        return NextResponse.redirect(url);
      }
    }
  }

  // Strip validated slug prefix so /[slug]/admin/... matches the /admin guard.
  const guardPath = companySlug ? pathname.replace(`/${companySlug}`, "") || "/" : pathname;

  // ✅ Expired-plan access gate.
  // When a company's subscription has lapsed (the expire-trials cron flips
  // an expired trial to 'suspended'; a cancellation sets 'cancelled') its
  // staff/admins lose access to the tenant app. We keep the billing
  // surfaces reachable so an owner can pay and restore access, and exempt:
  //   - super_admin (navigates across tenants), and
  //   - client (a caterer's billing state must not lock their end
  //     customers out of the client portal).
  // Fails OPEN: if subscription_status is null/unknown we never block.
  const NON_ACCESS_STATUSES = new Set(["cancelled", "suspended"]);
  if (
    profileRole &&
    !isSuperAdmin &&
    !profileRoles.every((role) => role === "client") &&
    subscriptionStatus &&
    NON_ACCESS_STATUSES.has(subscriptionStatus)
  ) {
    // Always-reachable so the owner can reactivate (and to avoid a
    // redirect loop). /pricing is a public route and isn't gated here.
    const billingAllowed =
      guardPath.startsWith("/admin/subscription") || guardPath.startsWith("/account");
    if (!billingAllowed) {
      const url = request.nextUrl.clone();
      if (hasAnyRole(profileRoles, ADMIN_PORTAL_ROLES) && userCompanySlug) {
        // Owners / admins -> the subscription page where they can pay.
        url.pathname = `/${userCompanySlug}/admin/subscription`;
        url.search = "";
        url.searchParams.set("expired", "1");
      } else {
        // Staff can't pay -> tenant login with a notice (terminal, no loop).
        url.pathname = userCompanySlug ? `/${userCompanySlug}/login` : "/auth/login";
        url.search = "";
        url.searchParams.set("message", "subscription_expired");
      }
      mwLog("DENY", "subscription_expired", { role: profileRole, status: subscriptionStatus, path: pathname });
      return NextResponse.redirect(url);
    }
  }

  // ✅ Route authorization (deny-default for any non-public route)
  if (!isPublic && profileRoles.length > 0) {
    if (!isAuthorizedForAnyRole(guardPath, profileRoles)) {
      mwLog("DENY", "unauthorized", { role: profileRole, path: pathname, guardPath });
      console.log(`[Middleware] Unauthorized: ${profileRole} attempted ${pathname}`);
      if (roleLandingPage) {
        const url = request.nextUrl.clone();
        url.pathname = roleLandingPage;
        url.searchParams.set("error", "unauthorized");
        // Wave 45 follow-up: surface the rejected path in the toast
        // so post-hoc debugging doesn't need server logs. The
        // MiddlewareErrorToast picks this up and includes it in the
        // description.
        url.searchParams.set("error_path", pathname);
        return NextResponse.redirect(url);
      }
      // No landing page resolved - refuse rather than fall through
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("error", "unauthorized");
      url.searchParams.set("error_path", pathname);
      return NextResponse.redirect(url);
    }
  }

  mwLog("AUTH", `allowed`, { role: profileRole ?? "unknown", path: pathname, tenant: userCompanySlug ?? "-", cache: cacheHit ? "hit" : "miss" });

  // Refresh the signed-cookie cache on a miss so the next nav skips
  // the DB queries. Redirects above don't carry this cookie - next
  // request after the redirect will refetch + cache.
  if (!cacheHit) {
    await writeCachedProfile(response, {
      uid: user.id,
      role: profileRole,
      roles: profileRoles,
      company_id: profileCompanyId,
      slug: userCompanySlug ?? null,
      onboarding_completed_at: onboardingCompletedAt,
      subscription_status: subscriptionStatus,
    });
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - images, fonts, etc.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webmanifest)$).*)",
  ],
};
