import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

// Role-based landing pages (server-side mapping)
const ROLE_LANDING_PAGES: Record<string, string> = {
  super_admin: "/admin/platform/dashboard",
  company_admin: "/admin/leads",
  admin: "/admin/leads",
  owner: "/admin/leads",
  kitchen_staff: "/team-portal/kitchen/dashboard",
  shopping_staff: "/team-portal/shopping/dashboard",
  driver: "/team-portal/driver/dashboard",
  cleaning_staff: "/team-portal/cleaning/dashboard",
  client: "/client-portal/dashboard",
};

// Check if path is a public route
const isPublicRoute = (pathname: string) => {
  // Exact match for homepage
  if (pathname === "/") return true;
  
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

  // 🔧 DEV MODE: Skip all auth checks on localhost if requested
  const isDevEnvironment = 
    (request.nextUrl.hostname === "localhost" || 
     request.nextUrl.hostname === "127.0.0.1") &&
    request.nextUrl.searchParams.has("dev");

  if (isDevEnvironment) {
    return NextResponse.next();
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

  // Extract company slug if present for dynamic routing
  let companySlug: string | null = null;
  const companySlugMatch = pathname.match(/^\/([^\/]+)\/(admin|team-portal|client-portal)/);
  if (companySlugMatch && companySlugMatch[1]) {
    companySlug = companySlugMatch[1];
  }

  // Handle unauthenticated users
  if (!user && !isPublic) {
    // Determine the correct login URL
    const url = request.nextUrl.clone();
    
    // Check if the current route has a specific prefix that indicates a tenant login
    if (companySlug && companySlug !== "auth" && companySlug !== "admin" && companySlug !== "api") {
      url.pathname = `/${companySlug}/login`;
    } else {
      url.pathname = "/auth/login";
    }
    
    // Don't append redirectTo if we're already redirecting to login to avoid loops
    if (pathname !== "/auth/login" && !pathname.endsWith("/login")) {
      url.searchParams.set("redirectTo", pathname);
    }
    
    return NextResponse.redirect(url);
  }

  // ✅ ROLE-BASED REDIRECTION (Server-side)
  // Only redirect authenticated users on specific landing routes
  if (user && shouldRedirectToRoleLanding(pathname)) {
    try {
      // Fetch user profile to get role
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        const roleLandingPage = ROLE_LANDING_PAGES[profile.role];
        
        if (roleLandingPage && pathname !== roleLandingPage) {
          const url = request.nextUrl.clone();
          url.pathname = roleLandingPage;
          
          console.log(`[Middleware] Redirecting ${profile.role} from ${pathname} to ${roleLandingPage}`);
          
          return NextResponse.redirect(url);
        }
      }
    } catch (error) {
      console.error("[Middleware] Error fetching user role:", error);
      // Continue without redirect if profile fetch fails
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