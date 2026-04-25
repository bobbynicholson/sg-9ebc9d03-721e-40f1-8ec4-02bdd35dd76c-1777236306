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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: "", ...options });
          response = NextResponse.next({ request: { headers: request.headers } });
          response.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const { data: { session } } = await supabase.auth.getSession();

  // 🔧 DEV MODE BYPASS: Allow dev@cateringms.local to access everything
  if (session?.user?.email === "dev@cateringms.local") {
    console.log("🔧 DEV MODE: Bypassing all auth checks for dev@cateringms.local");
    return response;
  }

  // If no session, redirect to login
  if (!session) {
    console.log("🔐 No session - redirecting to login");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    redirectUrl.searchParams.set("redirect", pathname);
    redirectUrl.searchParams.set("message", "login_required");
    return NextResponse.redirect(redirectUrl);
  }

  // Get user profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, company_id, company_slug")
    .eq("id", session.user.id)
    .single();

  if (!profile) {
    console.log("❌ No profile found - redirecting to login");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/auth/login";
    return NextResponse.redirect(redirectUrl);
  }

  console.log("🔐 Middleware - User:", session.user.email);
  console.log("🎭 Middleware - Role:", profile.role);
  console.log("🏢 Middleware - Company:", profile.company_slug);
  console.log("🌐 Middleware - Path:", pathname);

  const userRole = profile.role;
  const userCompanySlug = profile.company_slug;

  // Super admin can access everything
  if (userRole === "super_admin") {
    console.log("✅ Super admin - access granted");
    return response;
  }

  // Extract company slug from URL if present
  const companySlugMatch = pathname.match(/^\/([^\/]+)\//);
  const urlCompanySlug = companySlugMatch ? companySlugMatch[1] : null;

  // Company admin access control
  if (userRole === "company_admin") {
    // Allow access to their own company routes
    if (urlCompanySlug && urlCompanySlug === userCompanySlug) {
      console.log("✅ Company admin accessing own company - access granted");
      return response;
    }

    // Allow access to non-company-specific routes
    if (!urlCompanySlug) {
      console.log("✅ Company admin accessing non-company route - access granted");
      return response;
    }

    // Block access to other companies
    console.log("❌ Company admin trying to access another company - blocked");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${userCompanySlug}/admin/dashboard`;
    return NextResponse.redirect(redirectUrl);
  }

  // Staff role access control
  if (["driver", "kitchen_staff", "shopping_staff", "cleaning_staff"].includes(userRole)) {
    // Staff can only access their own company's team portal
    if (pathname.startsWith(`/${userCompanySlug}/team-portal/`)) {
      console.log("✅ Staff accessing own company team portal - access granted");
      return response;
    }

    // Redirect staff to their team portal if accessing wrong area
    console.log("❌ Staff trying to access unauthorized area - redirecting");
    const redirectUrl = request.nextUrl.clone();
    const portalMap: Record<string, string> = {
      driver: "driver",
      kitchen_staff: "kitchen",
      shopping_staff: "shopping",
      cleaning_staff: "cleaning",
    };
    const portalType = portalMap[userRole] || "driver";
    redirectUrl.pathname = `/${userCompanySlug}/team-portal/${portalType}/dashboard`;
    return NextResponse.redirect(redirectUrl);
  }

  // Client access control
  if (userRole === "client") {
    // Clients can only access their own company's client portal
    if (pathname.startsWith(`/${userCompanySlug}/client-portal/`)) {
      console.log("✅ Client accessing own company portal - access granted");
      return response;
    }

    // Redirect clients to their portal
    console.log("❌ Client trying to access unauthorized area - redirecting");
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = `/${userCompanySlug}/client-portal/dashboard`;
    return NextResponse.redirect(redirectUrl);
  }

  // Default: allow access
  console.log("✅ Access granted to:", pathname);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};