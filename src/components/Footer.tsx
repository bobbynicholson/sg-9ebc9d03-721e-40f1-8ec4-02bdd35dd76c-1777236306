
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

export function Footer() {
  const currentYear = new Date().getFullYear();

  const portalLinks = [
    {
      name: "Admin Portal",
      href: "/auth/login?portal=admin",
      icon: Shield,
      color: "text-slate-600 hover:text-slate-900"
    },
    {
      name: "Driver Portal",
      href: "/auth/login?portal=driver",
      icon: Truck,
      color: "text-purple-600 hover:text-purple-800"
    },
    {
      name: "Kitchen Portal",
      href: "/auth/login?portal=kitchen",
      icon: ChefHat,
      color: "text-orange-600 hover:text-orange-800"
    },
    {
      name: "Cleaning Portal",
      href: "/auth/login?portal=cleaning",
      icon: Sparkles,
      color: "text-cyan-600 hover:text-cyan-800"
    },
    {
      name: "Shopping Portal",
      href: "/auth/login?portal=shopping",
      icon: ShoppingCart,
      color: "text-green-600 hover:text-green-800"
    },
    {
      name: "Client Portal",
      href: "/auth/login?portal=client",
      icon: UserCircle,
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="col-span-1 md:col-span-2">
            <h3 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent mb-4">
              Catering Management Platform
            </h3>
            <p className="text-slate-300 mb-6 max-w-md">
              Complete solution for South African catering businesses. Automate your operations, increase profitability, and deliver exceptional service.
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

        <div className="border-t border-slate-700 pt-8 mb-8">
          <h4 className="font-semibold mb-4 text-slate-200 text-center">Portal Login Access</h4>
          <p className="text-sm text-slate-400 text-center mb-6">
            Use the same username and password for all portals
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {portalLinks.map((portal) => (
              <Link key={portal.name} href={portal.href}>
                <Button
                  variant="outline"
                  className="w-full bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:border-slate-600 transition-all"
                >
                  <portal.icon className={`w-4 h-4 mr-2 ${portal.color}`} />
                  <span className="text-slate-200">{portal.name.split(" ")[0]}</span>
                </Button>
              </Link>
            ))}
          </div>
        </div>

        <div className="border-t border-slate-700 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-sm text-slate-400">
              © {currentYear} Catering Management Platform. Built for South African catering excellence.
            </p>
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
