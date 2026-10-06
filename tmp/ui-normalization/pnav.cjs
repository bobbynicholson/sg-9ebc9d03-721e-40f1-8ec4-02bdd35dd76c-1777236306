const fs = require('fs');
const p = 'src/components/admin/PlatformNav.tsx';
let s = fs.readFileSync(p, 'utf8');
const crlf = s.includes('\r\n');
s = s.replace(/\r\n/g, '\n');
const a = s.indexOf('    sections: [\n      {\n        id: "command",');
const b = s.indexOf('      {\n        id: "footer",', a);
if (a < 0 || b < 0) throw new Error('sections');
const sections = `    // Grouped the way a platform owner works: what's happening, who the
    // customers are, money, content, then settings. Short descriptions so
    // every item reads on one line; quieter groups start folded.
    sections: [
      {
        id: "command",
        title: "Overview",
        defaultOpen: true,
        items: [
          { title: "Dashboard",     href: "/admin/platform/dashboard",     icon: LayoutDashboard, description: "Revenue and growth" },
          { title: "Company health", href: "/admin/platform/tenant-health", icon: Activity,        description: "Stuck or quiet companies" },
          { title: "Payment issues", href: "/admin/platform/payment-issues", icon: AlertTriangle,  description: "Billing setup problems" },
          { title: "Activity log",  href: "/admin/platform/audit-logs",    icon: ScrollText,      description: "Who did what" },
        ],
      },
      {
        id: "tenants",
        title: "Customers",
        defaultOpen: true,
        items: [
          { title: "Companies",     href: "/admin/platform/company-database",        icon: Building2,  description: "All catering businesses" },
          { title: "Users",         href: "/admin/platform/user-management",         icon: Users,      description: "Every account" },
          { title: "Subscriptions", href: "/admin/platform/subscription-management", icon: CreditCard, description: "Plans and cancellations" },
          { title: "Trials",        href: "/admin/platform/trial-management",        icon: Calendar,   description: "Extend or convert" },
        ],
      },
      {
        id: "revenue",
        title: "Money",
        defaultOpen: false,
        items: [
          { title: "Revenue",          href: "/admin/platform/financial-dashboard", icon: BarChart3,      description: "MRR and trends" },
          { title: "Pricing",          href: "/admin/platform/pricing-management",  icon: Tag,            description: "Plans and prices" },
          { title: "Tech costs",       href: "/admin/platform/tech-costs",          icon: Calculator,     description: "Costs and margin" },
          { title: "Currency",         href: "/admin/platform/currency-monitoring", icon: ArrowLeftRight, description: "Exchange rates" },
          { title: "Tax rules",        href: "/admin/platform/tax-rules",           icon: Percent,        description: "Slip deductibility" },
          { title: "Payment gateways", href: "/admin/payment-gateways",             icon: Landmark,       description: "Stripe, PayFast, Yoco" },
        ],
      },
      {
        id: "marketing",
        title: "Website",
        defaultOpen: false,
        items: [
          { title: "Pages",           href: "/admin/platform/cms-pages",           icon: Globe,     description: "Landing and pricing copy" },
          { title: "Blog",            href: "/admin/platform/cms-blog",            icon: Newspaper, description: "Articles and SEO" },
          { title: "Platform emails", href: "/admin/platform/messaging-templates", icon: Mail,      description: "Receipts and reminders" },
        ],
      },
      {
        id: "system",
        title: "Settings",
        defaultOpen: false,
        items: [
          { title: "Platform settings", href: "/admin/platform/settings",     icon: Settings,    description: "Import limits, origin" },
          { title: "AI brain",          href: "/admin/ai-brain",              icon: Brain,       description: "Assistant knowledge" },
          { title: "AI access",         href: "/admin/ai-brain/access",       icon: ShieldCheck, description: "Live-data access by role" },
          { title: "Running to-do",     href: "/admin/platform/running-todo", icon: ListChecks,  description: "Engineering backlog" },
        ],
      },
`;
s = s.slice(0, a) + sections + s.slice(b);
s = s.replace('  ShieldCheck,\n} from "lucide-react";', '  ShieldCheck,\n  Percent,\n} from "lucide-react";');
s = s.replace(`{ title: "Switch to company view", href: "/admin/platform/company-database#company-records", icon: MonitorCheck, description: "Choose a company to browse" }`,
  `{ title: "Open a company", href: "/admin/platform/company-database#company-records", icon: MonitorCheck, description: "View as that company" }`);
fs.writeFileSync(p, crlf ? s.replace(/\n/g, '\r\n') : s);
console.log('ok');
