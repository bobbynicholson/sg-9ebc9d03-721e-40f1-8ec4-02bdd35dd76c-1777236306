import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that don't require company slug validation
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
  "/_next",
  "/favicon.ico",
  "/robots.txt",
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
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const pathname = req.nextUrl.pathname;

  // Allow public routes without validation
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return res;
  }

  // Get current session
  const { data: { session } } = await supabase.auth.getSession();

  // If no session, redirect to login
  if (!session) {
    const loginUrl = new URL("/auth/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Get user profile with company information
  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      *,
      companies!inner(
        id,
        company_slug,
        company_name
      )
    `)
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const userCompanySlug = profile.companies?.company_slug;
  const userRole = profile.active_role;

  // Super admin access rules
  if (userRole === "super_admin") {
    // Super admin can access:
    // 1. /super-admin routes
    // 2. /cateringms-platform routes
    // 3. Any /{company-slug}/ routes (to manage companies)
    
    if (SUPER_ADMIN_ROUTES.some(route => pathname.startsWith(route))) {
      return res; // Allow access
    }

    // If accessing a company route, allow it (super admin has god mode)
    if (pathname.match(/^\/[^\/]+\/(admin|team-portal|client-portal)/)) {
      return res;
    }

    // Default super admin to /super-admin
    if (pathname === "/") {
      return NextResponse.redirect(new URL("/super-admin", req.url));
    }
  }

  // Extract company slug from URL
  const pathParts = pathname.split("/").filter(Boolean);
  const urlCompanySlug = pathParts[0];

  // Check if this is a company-specific route
  const isCompanyRoute = COMPANY_ROUTES.some(route => 
    pathname.includes(route)
  );

  if (isCompanyRoute) {
    // Route must have company slug in URL
    if (!pathname.match(/^\/[^\/]+\/(admin|team-portal|client-portal)/)) {
      // Missing company slug - redirect to user's company
      const correctedUrl = new URL(`/${userCompanySlug}${pathname}`, req.url);
      return NextResponse.redirect(correctedUrl);
    }

    // Validate company slug matches user's company
    if (urlCompanySlug !== userCompanySlug && userRole !== "super_admin") {
      console.error(`🚨 SECURITY: User ${session.user.email} (${userCompanySlug}) attempted to access ${urlCompanySlug}`);
      
      // Redirect to their own company
      const correctedPath = pathname.replace(`/${urlCompanySlug}/`, `/${userCompanySlug}/`);
      const correctedUrl = new URL(correctedPath, req.url);
      return NextResponse.redirect(correctedUrl);
    }

    // Valid company route - add company context to headers
    res.headers.set("x-company-slug", urlCompanySlug);
    res.headers.set("x-company-id", profile.companies?.id || "");
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