import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DemoModeToggle } from "@/components/DemoModeToggle";
import {
  Menu,
  X,
  ChevronDown,
  Sparkles,
  Users,
  FileText,
  Package,
  Truck,
  ChefHat,
  ShoppingCart,
  MapPin,
  Mail,
  DollarSign,
  Shield,
  Globe,
  BarChart3,
  Calendar,
  Settings,
  BookOpen,
  Phone,
  ArrowRight,
  Zap,
  Target,
  AlertTriangle,
  Play,
  CheckCircle,
  Lock,
  Building2
} from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";
import { RegionSwitcher } from "@/components/RegionSwitcher";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useAuth } from "@/contexts/AuthContext";

export function Header() {
  const router = useRouter();
  const { branding } = useBranding();
  const { user, userRoles } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const displayName = branding?.organizationName || "CateringMS";
  const displayLogo = branding?.logoUrl;

  const getRoleBasedDashboard = () => {
    if (!user) return "/auth/login";
    
    const role = user.user_metadata?.role || user.role;
    
    switch (role) {
      case "admin":
        return "/admin/dashboard";
      case "driver":
        return "/team-portal/driver/dashboard";
      case "kitchen":
        return "/team-portal/kitchen/dashboard";
      case "shopping":
        return "/team-portal/shopping/dashboard";
      case "cleaning":
        return "/team-portal/cleaning/dashboard";
      case "staff":
        return "/team-portal/general/job-progress";
      case "client":
        return "/client-portal/dashboard";
      default:
        return "/";
    }
  };

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileMenuOpen(false);
    setActiveDropdown(null);
  }, [router.pathname]);

  const featuresMegaMenu = [
    {
      category: "Core Operations",
      icon: Settings,
      items: [
        { name: "Lead Management", href: "/features/lead-management", icon: Users, description: "Capture and convert leads automatically" },
        { name: "Calendar & Booking", href: "/features#calendar", icon: Calendar, description: "Visual scheduling with conflict detection" },
        { name: "Order Processing", href: "/features#orders", icon: Package, description: "Streamlined order management" },
        { name: "Equipment Tracking", href: "/admin/equipment-shortages", icon: AlertTriangle, description: "Monitor and resolve equipment shortages" }
      ]
    },
    {
      category: "Team Portals",
      icon: Users,
      items: [
        { name: "Driver Management", href: "/features#driver-portal", icon: Truck, description: "GPS tracking and earnings" },
        { name: "Kitchen Operations", href: "/features/kitchen-management", icon: ChefHat, description: "Prep schedules and production" },
        { name: "Shopping & Inventory", href: "/features/inventory-management", icon: ShoppingCart, description: "Stock management and purchasing" },
        { name: "Client Portal", href: "/features#client-portal", icon: Shield, description: "Self-service booking platform" }
      ]
    },
    {
      category: "Advanced Features",
      icon: Zap,
      items: [
        { name: "GPS Tracking", href: "/features/gps-tracking", icon: MapPin, description: "Real-time delivery tracking" },
        { name: "Email Automation", href: "/features/email-automation", icon: Mail, description: "Smart nurture campaigns" },
        { name: "Payment Processing", href: "/features#payments", icon: DollarSign, description: "Secure online payments" },
        { name: "Multi-Region Support", href: "/features#multi-region", icon: Globe, description: "Scale across locations" }
      ]
    },
    {
      category: "Business Intelligence",
      icon: BarChart3,
      items: [
        { name: "Analytics Dashboard", href: "/features#analytics", icon: BarChart3, description: "Real-time performance metrics" },
        { name: "Profit Optimization", href: "/features#profit", icon: Target, description: "Maximize margins and profitability" },
        { name: "Integrations", href: "/integrations", icon: Zap, description: "Xero, WhatsApp, Google Maps & more" }
      ]
    }
  ];

  const resourcesMegaMenu = [
    {
      category: "Learn",
      icon: BookOpen,
      items: [
        { name: "Blog & Insights", href: "/blog", icon: BookOpen, description: "Industry best practices" },
        { name: "Success Stories", href: "/blog#success", icon: Users, description: "Real results from caterers" },
        { name: "Video Tutorials", href: "/blog#videos", icon: Sparkles, description: "Visual walkthroughs" }
      ]
    },
    {
      category: "Support",
      icon: Phone,
      items: [
        { name: "Help Center", href: "/support", icon: Phone, description: "24-hour support" },
        { name: "Contact Us", href: "/contact", icon: Mail, description: "Get personalized help" },
        { name: "Documentation", href: "/blog", icon: FileText, description: "Complete guides" }
      ]
    }
  ];

  const isActive = (path: string) => router.pathname === path;

  const handleDropdownToggle = (dropdown: string) => {
    setActiveDropdown(activeDropdown === dropdown ? null : dropdown);
  };

  const handleMouseEnter = (dropdownName: string) => {
    // Clear any pending timeout
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setActiveDropdown(dropdownName);
  };

  const handleMouseLeave = () => {
    // Add delay before closing to allow user to move mouse to menu
    hoverTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 500);
  };

  return (
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 backdrop-blur-lg shadow-lg border-b border-slate-200"
          : "bg-white border-b border-slate-100"
      }`}
    >
      <nav className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-7xl">
        <div className="flex items-center justify-between h-14 sm:h-16 lg:h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group flex-shrink-0">
            {displayLogo ? (
              <img
                src={displayLogo}
                alt={displayName}
                className="h-7 sm:h-8 lg:h-10 object-contain"
              />
            ) : (
              <>
                <div className="p-1.5 sm:p-2 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg sm:rounded-xl group-hover:scale-110 transition-transform">
                  <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-white" />
                </div>
                <span className="text-base sm:text-lg lg:text-2xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                  {displayName}
                </span>
              </>
            )}
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-1">
            {/* Features Mega Menu */}
            <div
              className="relative"
              onMouseEnter={() => handleMouseEnter("features")}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive("/features") || activeDropdown === "features"
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">Features</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "features" ? "rotate-180" : ""}`} />
              </button>

              {activeDropdown === "features" && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-screen max-w-5xl">
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8">
                    <div className="grid grid-cols-4 gap-8">
                      {featuresMegaMenu.map((section, idx) => (
                        <div key={idx}>
                          <div className="flex items-center gap-2 mb-4">
                            <section.icon className="w-5 h-5 text-purple-600" />
                            <h3 className="font-bold text-slate-900 text-sm">{section.category}</h3>
                          </div>
                          <ul className="space-y-3">
                            {section.items.map((item, itemIdx) => (
                              <li key={itemIdx}>
                                <Link href={item.href}>
                                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-purple-50 transition-colors group cursor-pointer">
                                    <item.icon className="w-4 h-4 text-purple-500 mt-0.5 group-hover:scale-110 transition-transform flex-shrink-0" />
                                    <div>
                                      <p className="font-medium text-slate-900 text-sm group-hover:text-purple-700">
                                        {item.name}
                                      </p>
                                      <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                                    </div>
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 pt-6 border-t border-slate-200 flex items-center justify-between">
                      <p className="text-sm text-slate-600">
                        Explore 15+ integrated systems working together
                      </p>
                      <Link href="/features">
                        <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90">
                          View All Features
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href="/pricing">
              <button
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive("/pricing")
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Pricing
              </button>
            </Link>

            {/* Resources Mega Menu */}
            <div
              className="relative"
              onMouseEnter={() => handleMouseEnter("resources")}
              onMouseLeave={handleMouseLeave}
            >
              <button
                className={`flex items-center gap-1 px-4 py-2 rounded-lg transition-colors ${
                  isActive("/blog") || activeDropdown === "resources"
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <span className="font-medium">Resources</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "resources" ? "rotate-180" : ""}`} />
              </button>

              {activeDropdown === "resources" && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-screen max-w-2xl">
                  <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-8">
                    <div className="grid grid-cols-2 gap-8">
                      {resourcesMegaMenu.map((section, idx) => (
                        <div key={idx}>
                          <div className="flex items-center gap-2 mb-4">
                            <section.icon className="w-5 h-5 text-purple-600" />
                            <h3 className="font-bold text-slate-900">{section.category}</h3>
                          </div>
                          <ul className="space-y-3">
                            {section.items.map((item, itemIdx) => (
                              <li key={itemIdx}>
                                <Link href={item.href}>
                                  <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-purple-50 transition-colors group cursor-pointer">
                                    <item.icon className="w-5 h-5 text-purple-500 mt-0.5 group-hover:scale-110 transition-transform" />
                                    <div>
                                      <p className="font-medium text-slate-900 text-sm group-hover:text-purple-700">
                                        {item.name}
                                      </p>
                                      <p className="text-xs text-slate-600 mt-0.5">{item.description}</p>
                                    </div>
                                  </div>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link href="/contact">
              <button
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  isActive("/contact")
                    ? "bg-purple-50 text-purple-700"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                Contact
              </button>
            </Link>
          </div>

          {/* Desktop Right Section */}
          <div className="hidden lg:flex items-center gap-3">
            <RegionSwitcher />
            {user && userRoles.length > 1 && (
              <RoleSwitcher variant="compact" showLabel={false} />
            )}
            {user && <NotificationBell />}
            
            {/* Try Demo Button - Prominent */}
            <Link href="/test-company">
              <Button variant="outline" className="border-2 border-green-500 text-green-700 hover:bg-green-50 shadow-sm h-10">
                <Play className="w-4 h-4 mr-2" />
                Try Demo
              </Button>
            </Link>

            {/* Sign Up CTA */}
            <Link href="/pricing">
              <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 shadow-lg h-10">
                Start Free Trial
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
            ) : (
              <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-slate-700" />
            )}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute left-0 right-0 top-full bg-white border-b border-slate-200 shadow-2xl max-h-[calc(100vh-3.5rem)] sm:max-h-[calc(100vh-4rem)] overflow-y-auto">
            <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
              {/* Mobile Features */}
              <div className="space-y-2">
                <button
                  onClick={() => handleDropdownToggle("mobile-features")}
                  className="w-full flex items-center justify-between p-3 sm:p-4 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  <span className="font-medium text-sm sm:text-base text-slate-900">Features</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "mobile-features" ? "rotate-180" : ""}`} />
                </button>
                {activeDropdown === "mobile-features" && (
                  <div className="pl-1 sm:pl-2 space-y-2 sm:space-y-3">
                    {featuresMegaMenu.map((section, idx) => (
                      <div key={idx} className="space-y-1.5 sm:space-y-2">
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider px-2 sm:px-3 py-1">
                          {section.category}
                        </p>
                        {section.items.map((item, itemIdx) => (
                          <Link key={itemIdx} href={item.href}>
                            <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg hover:bg-purple-50 active:bg-purple-100 transition-colors">
                              <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 text-xs sm:text-sm">{item.name}</p>
                                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.description}</p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/pricing">
                <div className="p-3 sm:p-4 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 font-medium text-sm sm:text-base text-slate-900 flex items-center justify-between transition-colors">
                  <span>Pricing</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </Link>

              {/* Mobile Resources */}
              <div className="space-y-2">
                <button
                  onClick={() => handleDropdownToggle("mobile-resources")}
                  className="w-full flex items-center justify-between p-3 sm:p-4 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 transition-colors"
                >
                  <span className="font-medium text-sm sm:text-base text-slate-900">Resources</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${activeDropdown === "mobile-resources" ? "rotate-180" : ""}`} />
                </button>
                {activeDropdown === "mobile-resources" && (
                  <div className="pl-1 sm:pl-2 space-y-2 sm:space-y-3">
                    {resourcesMegaMenu.map((section, idx) => (
                      <div key={idx} className="space-y-1.5 sm:space-y-2">
                        <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider px-2 sm:px-3 py-1">
                          {section.category}
                        </p>
                        {section.items.map((item, itemIdx) => (
                          <Link key={itemIdx} href={item.href}>
                            <div className="flex items-start gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg hover:bg-purple-50 active:bg-purple-100 transition-colors">
                              <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-slate-900 text-xs sm:text-sm">{item.name}</p>
                                <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{item.description}</p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Link href="/contact">
                <div className="p-3 sm:p-4 rounded-lg bg-slate-50 hover:bg-slate-100 active:bg-slate-200 font-medium text-sm sm:text-base text-slate-900 flex items-center justify-between transition-colors">
                  <span>Contact</span>
                  <ArrowRight className="w-4 h-4 text-slate-400" />
                </div>
              </Link>

              {/* Mobile Demo Section - Highlighted */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-3 sm:p-4 border-2 border-green-200">
                <div className="flex items-center gap-2 mb-2 sm:mb-3">
                  <Play className="w-4 h-4 sm:w-5 sm:h-5 text-green-600 flex-shrink-0" />
                  <span className="font-bold text-green-900 text-xs sm:text-sm uppercase tracking-wider">
                    Try Demo
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-green-800 mb-2 sm:mb-3">
                  Test all features with pre-loaded sample data. Login as admin, driver, kitchen, shopping, cleaning, or client.
                </p>
                <Link href="/test-company">
                  <Button className="w-full bg-gradient-to-r from-green-500 to-emerald-500 hover:opacity-90 text-white h-11 sm:h-12 text-sm sm:text-base">
                    <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Access Demo Portal
                  </Button>
                </Link>
                <div className="flex items-center justify-center gap-3 sm:gap-4 mt-2 sm:mt-3 text-xs text-green-700">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-3 h-3 flex-shrink-0" />
                    <span>Unlimited</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Lock className="w-3 h-3 flex-shrink-0" />
                    <span>Safe Sandbox</span>
                  </div>
                </div>
              </div>

              {/* Mobile CTA Section */}
              <div className="pt-3 sm:pt-4 border-t border-slate-200 space-y-2 sm:space-y-3">
                {user && userRoles.length > 1 && (
                  <div className="px-1 sm:px-2">
                    <RoleSwitcher variant="default" showLabel={true} />
                  </div>
                )}
                <div className="flex justify-center">
                  <RegionSwitcher />
                </div>
                <Link href="/company-signup">
                  <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 shadow-lg h-11 sm:h-12 text-sm sm:text-base">
                    Start Free Trial
                    <ArrowRight className="w-4 h-4 sm:w-5 sm:h-5 ml-2" />
                  </Button>
                </Link>
                <div className="text-center">
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs">
                    14-Day Free Trial • No Credit Card
                  </Badge>
                </div>
              </div>
            </div>
          </div>
        )}
      </nav>
    </header>
  );
}
