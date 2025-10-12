import Link from "next/link";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  Truck, 
  ChefHat, 
  Sparkles, 
  ShoppingCart, 
  UserCircle,
  Mail,
  Phone,
  MapPin
} from "lucide-react";
import { useBranding } from "@/contexts/BrandingContext";

export function Footer() {
  const currentYear = new Date().getFullYear();
  const { branding, isWhiteLabeled } = useBranding();

  const displayName = branding?.organizationName || "CateringMS";
  const displayLogo = branding?.logoUrl;

  const portalLinks = [
    {
      name: "Admin Portal",
      href: "/auth/login?portal=admin",
      icon: Shield,
      description: "Manage operations, staff, and system settings",
      color: "text-slate-600 hover:text-slate-900"
    },
    {
      name: "Driver Portal",
      href: "/auth/login?portal=driver",
      icon: Truck,
      description: "Track deliveries and manage earnings",
      color: "text-purple-600 hover:text-purple-800"
    },
    {
      name: "Kitchen Portal",
      href: "/auth/login?portal=kitchen",
      icon: ChefHat,
      description: "View orders and prep schedules",
      color: "text-orange-600 hover:text-orange-800"
    },
    {
      name: "Cleaning Portal",
      href: "/auth/login?portal=cleaning",
      icon: Sparkles,
      description: "Track equipment cleaning tasks",
      color: "text-cyan-600 hover:text-cyan-800"
    },
    {
      name: "Shopping Portal",
      href: "/auth/login?portal=shopping",
      icon: ShoppingCart,
      description: "Manage inventory and purchasing",
      color: "text-green-600 hover:text-green-800"
    },
    {
      name: "Client Portal",
      href: "/auth/login?portal=client",
      icon: UserCircle,
      description: "Book events and track orders",
      color: "text-blue-600 hover:text-blue-800"
    }
  ];

  const quickLinks = [
    { name: "About", href: "/about" },
    { name: "Features", href: "/features" },
    { name: "Pricing", href: "/pricing" },
    { name: "Blog", href: "/blog" },
    { name: "Contact", href: "/contact" },
    { name: "Support", href: "/support" }
  ];

  return (
    <footer className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white mt-20">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Portal Access Section - Now at the top for prominence */}
        <div className="bg-gradient-to-r from-slate-800 to-slate-700 rounded-2xl p-8 mb-12 border border-slate-600">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold mb-2 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Portal Login Access
            </h3>
            <p className="text-slate-300">
              Use the same username and password for all portals
            </p>
            <p className="text-sm text-slate-400 mt-1">
              Perfect for testing and accessing different areas of the platform
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {portalLinks.map((portal) => (
              <Link key={portal.name} href={portal.href}>
                <div className="bg-slate-900/50 border border-slate-600 rounded-lg p-4 hover:bg-slate-800 hover:border-slate-500 transition-all group cursor-pointer">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg bg-slate-800 group-hover:scale-110 transition-transform ${portal.color}`}>
                      <portal.icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-white mb-1">{portal.name}</h4>
                      <p className="text-xs text-slate-400">{portal.description}</p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            {displayLogo ? (
              <img
                src={displayLogo}
                alt={displayName}
                className="h-12 object-contain mb-4"
              />
            ) : (
              <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
                {displayName}
              </h3>
            )}
            <p className="text-slate-300 mb-6 max-w-md">
              {isWhiteLabeled
                ? `Complete catering management solution powered by advanced technology.`
                : `Complete solution for South African catering businesses. Automate your operations, increase profitability, and deliver exceptional service.`}
            </p>
            <div className="space-y-2 text-sm text-slate-300">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                <span>Cape Town, South Africa</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4" />
                <span>+27 (0) 21 123 4567</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4" />
                <span>support@cateringplatform.co.za</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Quick Links</h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  <Link href={link.href}>
                    <span className="text-slate-300 hover:text-white transition-colors text-sm">
                      {link.name}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-4 text-slate-200">Resources</h4>
            <ul className="space-y-2">
              <li>
                <Link href="/blog">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Blog
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/help">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Help Center
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/documentation">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Documentation
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/tutorials">
                  <span className="text-slate-300 hover:text-white transition-colors text-sm">
                    Video Tutorials
                  </span>
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar with CaterOS Attribution */}
        <div className="border-t border-slate-700 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="text-sm text-slate-400 text-center md:text-left">
              <p>© {currentYear} {displayName}. All rights reserved.</p>
              {isWhiteLabeled && (
                <p className="mt-2">
                  <Link href="https://cateringms.com" target="_blank" rel="noopener noreferrer">
                    <span className="inline-flex items-center gap-2 text-slate-500 hover:text-white transition-colors">
                      <Sparkles className="w-4 h-4" />
                      <span>Powered by CateringMS - Catering Management & Process Solutions</span>
                    </span>
                  </Link>
                </p>
              )}
            </div>
            <div className="flex gap-6 text-sm text-slate-400">
              <Link href="/privacy">
                <span className="hover:text-white transition-colors">Privacy Policy</span>
              </Link>
              <Link href="/terms">
                <span className="hover:text-white transition-colors">Terms of Service</span>
              </Link>
              <Link href="/cookies">
                <span className="hover:text-white transition-colors">Cookie Policy</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
