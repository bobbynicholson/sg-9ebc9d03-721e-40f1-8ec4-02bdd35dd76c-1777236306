import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard,
  ShoppingCart,
  MapPin,
  Receipt,
  User,
  LogOut,
  Menu,
  X,
  Settings,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { ThemeSwitch } from "@/components/ThemeSwitch";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function ClientNav() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Load collapsed state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("clientNav-collapsed");
    if (saved) setIsCollapsed(JSON.parse(saved));
  }, []);

  // Save collapsed state to localStorage
  const toggleCollapse = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("clientNav-collapsed", JSON.stringify(newState));
  };

  const navigation = [
    { name: "Dashboard", href: "/client-portal/dashboard", icon: LayoutDashboard },
    { name: "My Orders", href: "/client-portal/my-orders", icon: ShoppingCart },
    { name: "Tracking", href: "/client-portal/tracking", icon: MapPin },
    { name: "Billing", href: "/client-portal/billing", icon: Receipt },
  ];

  const isActive = (path: string) => router.pathname === path;

  const handleSignOut = async () => {
    await signOut();
    router.push("/auth/login");
  };

  return (
    <>
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setOpen(!open)}>
              <Menu className="h-6 w-6" />
            </Button>
            <Link href="/client-portal/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-green-600 to-emerald-600 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-slate-900 dark:text-white">Client Portal</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <ThemeSwitch />
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 mt-16"
          onClick={() => setOpen(false)}
        >
          <div
            className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <nav className="p-4 space-y-2">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive(item.href)
                        ? "bg-blue-50 text-blue-600 font-medium"
                        : "text-slate-700 hover:bg-slate-100"
                    }`}
                    onClick={() => setOpen(false)}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.name}</span>
                  </Link>
                );
              })}
              <Button
                variant="ghost"
                className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={handleSignOut}
              >
                <LogOut className="w-5 h-5 mr-3" />
                Sign Out
              </Button>
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className={`hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:border-r lg:border-slate-200 dark:lg:border-slate-700 lg:bg-white dark:lg:bg-slate-900 transition-all duration-300 ${
        isCollapsed ? "lg:w-20" : "lg:w-64 xl:w-72"
      }`}>
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            {!isCollapsed ? (
              <>
                <Link href="/client-portal/dashboard" className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h1 className="font-bold text-slate-900 dark:text-white">Client Portal</h1>
                    <p className="text-xs text-slate-600 dark:text-slate-400">CateringMS</p>
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <NotificationBell />
                  <ThemeSwitch />
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 w-full">
                <div className="w-10 h-10 bg-gradient-to-br from-green-600 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                  <User className="w-5 h-5 text-white" />
                </div>
                <NotificationBell />
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                    isActive(item.href)
                      ? "bg-blue-50 text-blue-600 font-medium shadow-sm"
                      : "text-slate-700 hover:bg-slate-100"
                  } ${isCollapsed ? "justify-center" : ""}`}
                  title={isCollapsed ? item.name : ""}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!isCollapsed && <span>{item.name}</span>}
                </Link>
              );
            })}
          </nav>

          {/* User Section */}
          <div className="p-4 border-t border-slate-200 space-y-2">
            <Button
              variant="ghost"
              className={`w-full text-slate-600 hover:text-slate-900 hover:bg-slate-100 ${
                isCollapsed ? "justify-center px-2" : "justify-start"
              }`}
              onClick={toggleCollapse}
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? (
                <ChevronRight className="w-5 h-5" />
              ) : (
                <>
                  <ChevronLeft className="w-5 h-5 mr-3" />
                  Collapse
                </>
              )}
            </Button>
            <Button
              variant="ghost"
              className={`w-full text-red-600 hover:text-red-700 hover:bg-red-50 ${
                isCollapsed ? "justify-center px-2" : "justify-start"
              }`}
              onClick={handleSignOut}
              title={isCollapsed ? "Sign Out" : ""}
            >
              <LogOut className="w-5 h-5" />
              {!isCollapsed && <span className="ml-3">Sign Out</span>}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}