import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getLandingPageForRoleString } from "@/lib/authGuards";

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
  "/page",
  "/pay",
];

// Route authorization rules - maps route prefixes to allowed roles.
// Deny-default: any authenticated route that does not match an entry here is rejected.
const ALL_AUTHENTICATED_ROLES = [
  "super_admin", "company_admin", "admin", "owner",
  "kitchen_staff", "shopping_staff", "driver", "cleaning_staff", "client",
];

const ROUTE_GUARDS: Record<string, string[]> = {
  "/admin/platform": ["super_admin"],
  "/admin": ["super_admin", "company_admin", "admin", "owner"],
  "/team-portal/kitchen": ["super_admin", "company_admin", "admin", "owner", "kitchen_staff"],
  "/team-portal/shopping": ["super_admin", "company_admin", "admin", "owner", "shopping_staff"],
  "/team-portal/driver": ["super_admin", "company_admin", "admin", "owner", "driver"],
  "/team-portal/cleaning": ["super_admin", "company_admin", "admin", "owner", "cleaning_staff"],
  "/team-portal/general": ["super_admin", "company_admin", "admin", "owner", "kitchen_staff", "shopping_staff", "driver", "cleaning_staff"],
  "/team-portal": ["super_admin", "company_admin", "admin", "owner", "kitchen_staff", "shopping_staff", "driver", "cleaning_staff"],
  "/client-portal": ["super_admin", "company_admin", "admin", "owner", "client"],
  "/client": ["super_admin", "company_admin", "admin", "owner", "client"],
  "/subscription": ["super_admin", "company_admin", "admin", "owner"],
  "/account": ALL_AUTHENTICATED_ROLES,
};

// Check if user role has access to a specific route.
// Returns false (deny) if no guard matches — every protected prefix must be listed above.
const isAuthorizedForRoute = (pathname: string, userRole: string): boolean => {
  const sortedGuards = Object.entries(ROUTE_GUARDS).sort((a, b) => b[0].length - a[0].length);

  for (const [routePrefix, allowedRoles] of sortedGuards) {
    if (pathname === routePrefix || pathname.startsWith(routePrefix + "/")) {
      return allowedRoles.includes(userRole);
    }
  }

  return false;
};

// Check if path is a public route
const isPublicRoute = (pathname: string) => {
  // Exact match for homepage
  if (pathname === "/") return true;

  // Tenant-scoped login pages: /[slug]/login
  if (/^\/[^\/]+\/login$/.test(pathname)) return true;

  // Dynamic prefixes
  if (
    pathname.startsWith("/blog/") ||
    pathname.startsWith("/uk/") ||
    pathname.startsWith("/us/") ||
    pathname.startsWith("/page/") ||
    pathname.startsWith("/pay/invoice/") ||
    pathname.startsWith("/features/") ||
    pathname.startsWith("/api/public/") ||
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

export async function middleware(request: NextRequest) {
  // Redirect old platform admin URLs to new unified structure
  if (request.nextUrl.pathname.startsWith("/cateringms-platform") || 
      request.nextUrl.pathname.startsWith("/super-admin")) {
    const url = request.nextUrl.clone();
    url.pathname = url.pathname
      .replace("/cateringms-platform", "/admin/platform")
      .replace("/super-admin", "/admin/platform");
    return NextResponse.redirect(url, 301); // Permanent redirect
  }

  // 🔧 DEV MODE: Skip all auth checks on localhost if requested.
  // Triple-gated: NODE_ENV must be non-production (compile-time on Vercel),
  // hostname must be localhost/127.0.0.1, and ?dev query param must be present.
  if (process.env.NODE_ENV !== "production") {
    const isDevEnvironment =
      (request.nextUrl.hostname === "localhost" ||
       request.nextUrl.hostname === "127.0.0.1") &&
      request.nextUrl.searchParams.has("dev");

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
  
  // Skip middleware for static files and api routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/webhooks") ||
    pathname.includes(".") // crude check for files
  ) {
    return response;
  }

  // IMPORTANT: getUser revalidates the token against the Auth server
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = isPublicRoute(pathname);

  // Extract company slug if present for dynamic tenant routing (/[slug]/admin/...)
  let companySlug: string | null = null;
  const companySlugMatch = pathname.match(/^\/([^\/]+)\/(admin|team-portal|client-portal)/);
  if (companySlugMatch && companySlugMatch[1]) {
    companySlug = companySlugMatch[1];
  }

  // Handle unauthenticated users
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();

    if (companySlug && companySlug !== "auth" && companySlug !== "admin" && companySlug !== "api") {
      url.pathname = `/${companySlug}/login`;
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

  // Single profile fetch shared across all authenticated checks below
  let profileRole: string | null = null;
  let profileCompanyId: string | null = null;
  try {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();
    profileRole = profile?.role ?? null;
    profileCompanyId = profile?.company_id ?? null;
  } catch (error) {
    console.error("[Middleware] Error fetching profile:", error);
  }

  // Resolve user's own company slug for slug-aware landing redirects
  let userCompanySlug: string | undefined;
  if (profileCompanyId) {
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("slug")
        .eq("id", profileCompanyId)
        .single();
      userCompanySlug = company?.slug ?? undefined;
    } catch (error) {
      console.error("[Middleware] Error fetching user company slug:", error);
    }
  }

  const roleLandingPage = profileRole
    ? getLandingPageForRoleString(profileRole, userCompanySlug)
    : undefined;

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

  // ✅ Tenant slug validation: /[slug]/admin|team-portal|client-portal/...
  // super_admin bypasses; everyone else must own the slug they're hitting.
  if (companySlug && profileRole && profileRole !== "super_admin") {
    if (!profileCompanyId) {
      const url = request.nextUrl.clone();
      url.pathname = roleLandingPage ?? "/auth/login";
      url.searchParams.set("error", "no_company");
      return NextResponse.redirect(url);
    }
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("slug")
        .eq("id", profileCompanyId)
        .single();
      if (!company || company.slug !== companySlug) {
        console.log(`[Middleware] Tenant mismatch: ${profileRole} (company=${profileCompanyId}) tried ${pathname}`);
        const url = request.nextUrl.clone();
        url.pathname = roleLandingPage ?? "/auth/login";
        url.searchParams.set("error", "tenant_mismatch");
        return NextResponse.redirect(url);
      }
    } catch (error) {
      console.error("[Middleware] Error validating tenant slug:", error);
      const url = request.nextUrl.clone();
      url.pathname = roleLandingPage ?? "/auth/login";
      url.searchParams.set("error", "tenant_check_failed");
      return NextResponse.redirect(url);
    }
  }

  // ✅ Route authorization (deny-default for any non-public route)
  // Strip validated slug prefix so /[slug]/admin/... matches the /admin guard.
  const guardPath = companySlug ? pathname.replace(`/${companySlug}`, "") || "/" : pathname;
  if (!isPublic && profileRole) {
    if (!isAuthorizedForRoute(guardPath, profileRole)) {
      console.log(`[Middleware] Unauthorized: ${profileRole} attempted ${pathname}`);
      if (roleLandingPage) {
        const url = request.nextUrl.clone();
        url.pathname = roleLandingPage;
        url.searchParams.set("error", "unauthorized");
        return NextResponse.redirect(url);
      }
      // No landing page resolved — refuse rather than fall through
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      url.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(url);
    }
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
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};