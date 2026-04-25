import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

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

// Role-based route access mapping
const ROLE_ROUTES = {
  super_admin: ["/super-admin"],
  company_admin: ["/admin"],
  driver: ["/team-portal/driver"],
  kitchen_staff: ["/team-portal/kitchen"],
  shopping_staff: ["/team-portal/shopping"],
  cleaning_staff: ["/team-portal/cleaning"],
  client: ["/client-portal"],
};

// Check if path is a super admin route
const isSuperAdminRoute = (pathname: string) => {
  return pathname === "/super-admin" || pathname.startsWith("/super-admin/");
};

// Check if path is a public route
const isPublicRoute = (pathname: string) => {
  // Exact match for homepage
  if (pathname === "/") return true;
  
  // Blog routes
  if (pathname === "/blog" || pathname.startsWith("/blog/")) return true;
  
  // Regional pages
  if (pathname === "/uk" || pathname === "/us") return true;
  if (pathname.startsWith("/uk/") || pathname.startsWith("/us/")) return true;
  
  // CMS pages
  if (pathname.startsWith("/page/")) return true;
  
  // Payment pages (public invoice payment)
  if (pathname.startsWith("/pay/")) return true;
  
  // Check other public routes
  return PUBLIC_ROUTES.some(route => {
    return pathname === route || pathname.startsWith(route);
  });
};

// Get the portal type from pathname
const getPortalType = (pathname: string): string | null => {
  if (pathname.startsWith("/super-admin")) return "super-admin";
  if (pathname.startsWith("/admin") || pathname.includes("/admin/")) return "admin";
  if (pathname.includes("/team-portal/driver")) return "driver";
  if (pathname.includes("/team-portal/kitchen")) return "kitchen";
  if (pathname.includes("/team-portal/shopping")) return "shopping";
  if (pathname.includes("/team-portal/cleaning")) return "cleaning";
  if (pathname.includes("/client-portal")) return "client";
  return null;
};

// Check if user role can access the portal
const canAccessPortal = (userRole: string, portalType: string): boolean => {
  const roleMapping: Record<string, string> = {
    "super-admin": "super_admin",
    "admin": "company_admin",
    "driver": "driver",
    "kitchen": "kitchen_staff",
    "shopping": "shopping_staff",
    "cleaning": "cleaning_staff",
    "client": "client",
  };

  const requiredRole = roleMapping[portalType];
  
  // Super admin can access everything
  if (userRole === "super_admin") return true;
  
  // Other users can only access their own portal
  return userRole === requiredRole;
};

// Get default dashboard for role
const getDefaultDashboard = (role: string, companySlug?: string): string => {
  switch (role) {
    case "super_admin":
      return "/super-admin/dashboard";
    case "company_admin":
      return companySlug ? `/${companySlug}/admin/dashboard` : "/admin/dashboard";
    case "driver":
      return companySlug ? `/${companySlug}/team-portal/driver/dashboard` : "/team-portal/driver/dashboard";
    case "kitchen_staff":
      return companySlug ? `/${companySlug}/team-portal/kitchen/dashboard` : "/team-portal/kitchen/dashboard";
    case "shopping_staff":
      return companySlug ? `/${companySlug}/team-portal/shopping/dashboard` : "/team-portal/shopping/dashboard";
    case "cleaning_staff":
      return companySlug ? `/${companySlug}/team-portal/cleaning/dashboard` : "/team-portal/cleaning/dashboard";
    case "client":
      return companySlug ? `/${companySlug}/client-portal/dashboard` : "/client-portal/dashboard";
    default:
      return "/";
  }
};

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
    loginUrl.searchParams.set("message", "login_required");
    return NextResponse.redirect(loginUrl);
  }

  // Get user profile with company information
  const { data: profile } = await supabase
    .from("profiles")
    .select(`
      id,
      role,
      company_id,
      companies (
        id,
        company_slug
      )
    `)
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    console.error("🚨 No profile found for user:", session.user.id);
    return NextResponse.redirect(new URL("/auth/login?error=no_profile", req.url));
  }

  const userRole = profile.role;
  const companyData = Array.isArray(profile.companies) ? profile.companies[0] : profile.companies;
  const userCompanySlug = companyData?.company_slug;

  console.log("🔐 Middleware - User:", session.user.email);
  console.log("🎭 Middleware - Role:", userRole);
  console.log("🏢 Middleware - Company:", userCompanySlug);
  console.log("🌐 Middleware - Path:", pathname);

  // Detect which portal the user is trying to access
  const portalType = getPortalType(pathname);

  if (portalType) {
    console.log("🚪 Middleware - Portal Type:", portalType);
    
    // Check if user can access this portal
    if (!canAccessPortal(userRole, portalType)) {
      console.error(`🚨 SECURITY: User with role ${userRole} tried to access ${portalType} portal`);
      
      // Redirect to their correct dashboard
      const correctDashboard = getDefaultDashboard(userRole, userCompanySlug);
      console.log("↩️ Redirecting to correct dashboard:", correctDashboard);
      
      return NextResponse.redirect(new URL(correctDashboard, req.url));
    }
  }

  // Handle super admin routes
  if (isSuperAdminRoute(pathname)) {
    if (userRole !== "super_admin") {
      console.error(`🚨 SECURITY: Non-super-admin (${userRole}) tried to access ${pathname}`);
      const correctDashboard = getDefaultDashboard(userRole, userCompanySlug);
      return NextResponse.redirect(new URL(correctDashboard, req.url));
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
      console.log("➕ Adding company slug to URL:", correctedUrl.pathname);
      return NextResponse.redirect(correctedUrl);
    }
    console.error("❌ No company slug found for user");
    return NextResponse.redirect(new URL("/auth/login?error=no_company", req.url));
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
    console.log("🔀 Redirecting to correct company:", correctedPath);
    return NextResponse.redirect(new URL(correctedPath, req.url));
  }

  // Valid access - set company slug header for downstream use
  res.headers.set("x-company-slug", urlSlug);
  console.log("✅ Access granted to:", pathname);
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