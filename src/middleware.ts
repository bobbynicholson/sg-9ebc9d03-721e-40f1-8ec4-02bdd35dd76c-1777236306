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
  const url = request.nextUrl.clone();

  // 🔧 DEV MODE: Skip all auth checks on localhost
  const isDevEnvironment = 
    request.nextUrl.hostname === "localhost" || 
    request.nextUrl.hostname === "127.0.0.1" ||
    request.nextUrl.searchParams.has("dev");

  if (isDevEnvironment) {
    console.log("🔧 DEV MODE: Skipping auth checks");
    return NextResponse.next();
  }

  // Extract company slug from URL patterns
  let companySlug: string | null = null;
  const companySlugMatch = pathname.match(/^\/([^\/]+)\/(admin|team-portal|client-portal)/);
  if (companySlugMatch) {
    companySlug = companySlugMatch[1];
  }

  try {
    const response = NextResponse.next();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              response.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    const {
      data: { session },
    } = await supabase.auth.getSession();

    // Public routes - allow access without authentication
    const publicRoutes = [
      "/",
      "/features",
      "/pricing",
      "/contact",
      "/support",
      "/terms",
      "/privacy",
      "/security",
      "/blog",
      "/demo",
      "/auth/login",
      "/auth/register",
      "/auth/reset-password",
      "/auth/callback",
      "/company-signup",
      "/subscription/checkout",
      "/subscription/success",
    ];

    const isPublicRoute =
      publicRoutes.includes(pathname) ||
      pathname.startsWith("/blog/") ||
      pathname.startsWith("/uk") ||
      pathname.startsWith("/us") ||
      pathname.startsWith("/features/") ||
      pathname.startsWith("/pay/invoice/") ||
      pathname.startsWith("/page/") ||
      pathname.startsWith("/_next") ||
      pathname.startsWith("/api/") ||
      pathname === "/favicon.ico";

    if (isPublicRoute) {
      return response;
    }

    // Protected routes - require authentication
    if (!session) {
      // Redirect to appropriate login page
      if (companySlug) {
        url.pathname = `/${companySlug}/login`;
      } else {
        url.pathname = "/auth/login";
      }
      url.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(url);
    }

    return response;
  } catch (e) {
    console.error("Middleware error:", e);
    // On error, allow the request through and let the page handle auth
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static files and API routes
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};