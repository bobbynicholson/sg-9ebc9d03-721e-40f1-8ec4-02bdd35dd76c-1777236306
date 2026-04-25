import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require company slug validation
const PUBLIC_ROUTES = [
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
  "/api"
];

// Exact paths that are public
const PUBLIC_EXACT_ROUTES = [
  "/",
  "/favicon.ico",
  "/robots.txt"
];

// Routes reserved for super admin only (no company slug)
const SUPER_ADMIN_ROUTES = [
  "/super-admin",
  "/cateringms-platform",
];

// Route patterns that require company slug
const COMPANY_ROUTES = [
  "/admin",
  "/team-portal",
  "/client-portal",
];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: {
      headers: req.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          req.cookies.set({ name, value, ...options });
          res = NextResponse.next({
            request: { headers: req.headers },
          });
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          req.cookies.set({ name, value: "", ...options });
          res = NextResponse.next({
            request: { headers: req.headers },
          });
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const pathname = req.nextUrl.pathname;

  // Allow public routes without validation
  if (
    PUBLIC_EXACT_ROUTES.includes(pathname) || 
    PUBLIC_ROUTES.some(route => pathname.startsWith(route))
  ) {
    return res;
  }

  // Check session
  const { data: { session } } = await supabase.auth.getSession();

  if (!session) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Get user profile with company information
  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      active_role,
      companies (
        id,
        company_slug
      )
    `)
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  // Safely extract company data (handles both array and object returns from Supabase)
  const companyData = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies;
  const userCompanySlug = companyData?.company_slug;
  const userRole = profile.active_role;

  // Super admin access rules
  if (userRole === "super_admin") {
    // 1. Super admin routes
    if (SUPER_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      return res;
    }

    // 2. Any company route (God Mode)
    if (pathname.match(/^\/[^\/]+\/(admin|team-portal|client-portal)/)) {
      return res;
    }

    // Default redirect for super admin
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/super-admin", req.url));
    }
  }

  // Check if this is a company-specific route
  const isCompanyRoute = COMPANY_ROUTES.some(route => pathname.includes(route));

  if (isCompanyRoute) {
    const routeMatch = pathname.match(/^\/([^\/]+)\/(admin|team-portal|client-portal)/);
    
    if (!routeMatch) {
      // Path is missing the company slug (e.g., /admin/dashboard)
      if (userCompanySlug) {
        // Automatically inject their slug and redirect
        const correctedUrl = new URL(`/${userCompanySlug}${pathname}`, req.url);
        return NextResponse.redirect(correctedUrl);
      } else {
        return NextResponse.redirect(new URL("/auth/login", req.url));
      }
    }

    const currentSlug = routeMatch[1];

    // Validate the slug matches the user's company
    if (currentSlug !== userCompanySlug && userRole !== "super_admin") {
      console.error(`🚨 SECURITY: User attempted to access ${currentSlug}, restricted to ${userCompanySlug}`);
      if (userCompanySlug) {
        // Redirect to their own company's equivalent page
        const correctedPath = pathname.replace(`/${currentSlug}/`, `/${userCompanySlug}/`);
        return NextResponse.redirect(new URL(correctedPath, req.url));
      } else {
        return NextResponse.redirect(new URL("/auth/login", req.url));
      }
    }

    // Valid company route - add company slug header for downstream API access if needed
    res.headers.set("x-company-slug", currentSlug);
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};