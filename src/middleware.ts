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
  "/blog",           // Public blog for customers
  "/api",
  "/favicon.ico",
  "/robots.txt",
];

// Routes reserved for super admin only (no company slug required)
const SUPER_ADMIN_ROUTES = [
  "/super-admin",
];

// Check if path is a super admin route
const isSuperAdminRoute = (pathname: string) => {
  return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
};

// Check if path is a public route
const isPublicRoute = (pathname: string) => {
  return PUBLIC_ROUTES.some(route => {
    if (route === "/blog") {
      // Allow /blog and /blog/[slug]
      return pathname === "/blog" || pathname.startsWith("/blog/");
    }
    return pathname === route || pathname.startsWith(route);
  });
};

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
  if (isPublicRoute(pathname)) {
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
      id,
      active_role,
      company_id,
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

  const userRole = profile.active_role;
  const companyData = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies;
  const userCompanySlug = companyData?.company_slug;

  // Handle super admin routes
  if (isSuperAdminRoute(pathname)) {
    // Only super_admin role can access /super-admin/* routes
    if (userRole !== "super_admin") {
      console.error(`🚨 SECURITY: Non-super-admin user tried to access ${pathname}`);
      // Redirect to their own company dashboard
      if (userCompanySlug) {
        return NextResponse.redirect(new URL(`/${userCompanySlug}/admin/dashboard`, req.url));
      }
      return NextResponse.redirect(new URL("/auth/login", req.url));
    }
    // Super admin accessing super admin routes - allow
    return res;
  }

  // All other routes must have company slug format: /{company-slug}/...
  const slugMatch = pathname.match(/^\/([^\/]+)\//);
  
  if (!slugMatch) {
    // No company slug in URL - redirect to proper format
    if (userCompanySlug) {
      const correctedUrl = new URL(`/${userCompanySlug}${pathname}`, req.url);
      return NextResponse.redirect(correctedUrl);
    }
    return NextResponse.redirect(new URL("/auth/login", req.url));
  }

  const urlSlug = slugMatch[1];

  // Super admins can access any company's routes
  if (userRole === "super_admin") {
    res.headers.set("x-company-slug", urlSlug);
    return res;
  }

  // Regular users: validate slug matches their company
  if (urlSlug !== userCompanySlug) {
    console.error(`🚨 SECURITY: User from ${userCompanySlug} tried to access ${urlSlug}`);
    // Redirect to their own company's equivalent page
    const correctedPath = pathname.replace(`/${urlSlug}/`, `/${userCompanySlug}/`);
    return NextResponse.redirect(new URL(correctedPath, req.url));
  }

  // Valid access - set company slug header for downstream use
  res.headers.set("x-company-slug", urlSlug);
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