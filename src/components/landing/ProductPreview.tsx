import {
  LayoutDashboard, FileText, Calendar, ChefHat, Truck, Users, BarChart3,
  Plus, Search, ArrowUpRight, MapPin, Check, Bell,
} from "lucide-react";

/**
 * A realistic, hand-built CateringMS admin dashboard mock for the landing
 * hero - the "this is serious software" centrepiece. Pure CSS/SVG (no
 * screenshots), so it's crisp at any size and fast. All figures are
 * illustrative. Decorative only - aria-hidden so screen readers skip it.
 */

const NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: FileText, label: "Quotes" },
  { icon: Calendar, label: "Calendar" },
  { icon: ChefHat, label: "Kitchen" },
  { icon: Truck, label: "Deliveries" },
  { icon: Users, label: "Clients" },
  { icon: BarChart3, label: "Reports" },
];

const KPIS = [
  { label: "Revenue (MTD)", value: "R 248,500", delta: "+12%" },
  { label: "Events this week", value: "14", delta: "+3" },
  { label: "Quotes pending", value: "7", delta: "2 new" },
  { label: "On-time rate", value: "98%", delta: "+1.4%" },
];

const EVENTS = [
  { date: "Sat 21", client: "Naidoo Wedding", type: "Wedding · 180 pax", status: "Confirmed", tone: "emerald", amount: "R 92,400" },
  { date: "Sun 22", client: "Deloitte Year-End", type: "Corporate · 320 pax", status: "In prep", tone: "amber", amount: "R 156,000" },
  { date: "Tue 24", client: "Khumalo 40th", type: "Private · 60 pax", status: "Out for delivery", tone: "blue", amount: "R 28,750" },
  { date: "Fri 27", client: "Gallery Launch", type: "Canapés · 120 pax", status: "Quote sent", tone: "stone", amount: "R 41,200" },
];

const BARS = [42, 58, 47, 70, 61, 88, 76];

const toneMap: Record<string, string> = {
  emerald: "bg-brand-primary/10 text-brand-primary ring-brand-primary/20",
  amber: "bg-amber-50 text-amber-700 ring-amber-600/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/20",
  stone: "bg-stone-100 text-stone-600 ring-stone-500/20",
};

export function ProductPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-5xl">
      {/* Glow behind the window */}
      <div className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 -z-10 bg-[radial-gradient(50%_50%_at_50%_40%,rgba(245,158,11,0.25),transparent)] blur-2xl" />

      {/* App window */}
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_40px_120px_-30px_rgba(0,0,0,0.7)] ring-1 ring-black/5">
        {/* Window chrome */}
        <div className="flex items-center gap-2 border-b border-stone-200/80 bg-stone-50 px-4 py-3">
          <span className="h-3 w-3 rounded-full bg-rose-400/80" />
          <span className="h-3 w-3 rounded-full bg-amber-400/80" />
          <span className="h-3 w-3 rounded-full bg-brand-primary/80" />
          <div className="mx-auto flex items-center gap-2 rounded-md bg-white px-3 py-1 text-[11px] text-stone-400 ring-1 ring-stone-200">
            <span className="h-2 w-2 rounded-full bg-brand-primary" />
            app.cateringms.com/admin/dashboard
          </div>
        </div>

        <div className="flex">
          {/* Sidebar */}
          <aside className="hidden w-44 shrink-0 border-r border-stone-200/80 bg-stone-50/60 p-3 sm:block">
            <div className="mb-4 flex items-center gap-2 px-1">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <ChefHat className="h-4 w-4 text-white" />
              </span>
              <span className="font-display text-base font-semibold text-stone-900">CateringMS</span>
            </div>
            <nav className="space-y-0.5">
              {NAV.map((item) => (
                <div
                  key={item.label}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium ${
                    item.active ? "bg-amber-100/70 text-amber-900" : "text-stone-500"
                  }`}
                >
                  <item.icon className={`h-4 w-4 ${item.active ? "text-amber-600" : "text-stone-400"}`} />
                  {item.label}
                </div>
              ))}
            </nav>
          </aside>

          {/* Main */}
          <main className="min-w-0 flex-1 bg-white p-4 sm:p-5">
            {/* Top bar */}
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-stone-900 sm:text-sm">Good morning, Thabo 👋</p>
                <p className="text-[11px] text-stone-400">Here&apos;s what&apos;s on this week</p>
              </div>
              <div className="flex items-center gap-2">
                <div className="hidden items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-[11px] text-stone-400 sm:flex">
                  <Search className="h-3.5 w-3.5" /> Search…
                </div>
                <div className="relative">
                  <Bell className="h-4 w-4 text-stone-400" />
                  <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
                </div>
                <div className="inline-flex items-center gap-1 rounded-lg bg-gradient-to-b from-amber-500 to-amber-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm">
                  <Plus className="h-3.5 w-3.5" /> New quote
                </div>
              </div>
            </div>

            {/* KPI tiles */}
            <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {KPIS.map((kpi) => (
                <div key={kpi.label} className="rounded-xl border border-stone-200/80 bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-stone-400">{kpi.label}</p>
                  <p className="mt-1 text-lg font-semibold tracking-tight text-stone-900">{kpi.value}</p>
                  <p className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-brand-primary">
                    <ArrowUpRight className="h-3 w-3" /> {kpi.delta}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid gap-3 lg:grid-cols-5">
              {/* Upcoming events */}
              <div className="rounded-xl border border-stone-200/80 bg-white p-3 lg:col-span-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold text-stone-900">Upcoming events</p>
                  <p className="text-[10px] text-amber-600">View all</p>
                </div>
                <div className="space-y-1.5">
                  {EVENTS.map((e) => (
                    <div key={e.client} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-stone-50">
                      <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md bg-stone-100 text-[9px] font-semibold leading-none text-stone-500">
                        {e.date.split(" ")[0]}
                        <span className="text-xs text-stone-900">{e.date.split(" ")[1]}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-stone-900">{e.client}</p>
                        <p className="truncate text-[10px] text-stone-400">{e.type}</p>
                      </div>
                      <span className={`hidden shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold ring-1 sm:inline ${toneMap[e.tone]}`}>
                        {e.status}
                      </span>
                      <span className="shrink-0 text-[11px] font-semibold text-stone-700">{e.amount}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right column: revenue chart + live delivery */}
              <div className="space-y-3 lg:col-span-2">
                <div className="rounded-xl border border-stone-200/80 bg-white p-3">
                  <p className="text-[11px] font-semibold text-stone-900">Revenue · last 7 days</p>
                  <div className="mt-3 flex h-20 items-end gap-1.5">
                    {BARS.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 origin-bottom rounded-t bg-gradient-to-t from-amber-400 to-amber-500 motion-reduce:!animate-none"
                        style={{
                          height: `${h}%`,
                          animation: `growbar 0.7s cubic-bezier(0.23,1,0.32,1) ${i * 0.06}s both`,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border border-stone-200/80 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-stone-900">Live delivery</p>
                    <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-brand-primary">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary motion-reduce:animate-none" /> Tracking
                    </span>
                  </div>
                  <div className="relative h-16 overflow-hidden rounded-lg bg-stone-100">
                    {/* faux map route */}
                    <svg viewBox="0 0 200 60" className="absolute inset-0 h-full w-full">
                      <path d="M10 48 C 60 10, 120 60, 190 14" fill="none" stroke="rgb(245 158 11)" strokeWidth="2.5" strokeDasharray="4 4" strokeLinecap="round" />
                      <circle cx="10" cy="48" r="3.5" fill="rgb(120 113 108)" />
                      <circle cx="190" cy="14" r="4" fill="rgb(217 119 6)" />
                    </svg>
                    <span className="absolute bottom-1.5 left-2 rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold text-stone-600 shadow-sm">
                      <MapPin className="mr-0.5 inline h-2.5 w-2.5 text-amber-600" /> ETA 12 min
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Floating live-status cards */}
      <div className="absolute -left-3 top-24 hidden animate-[floaty_5s_ease-in-out_infinite] sm:block motion-reduce:animate-none">
        <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-xl">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-primary/15">
            <Check className="h-4 w-4 text-brand-primary" />
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-stone-900">Quote accepted</p>
            <p className="text-[10px] text-stone-400">Naidoo Wedding · R 92,400</p>
          </div>
        </div>
      </div>

      <div className="absolute -right-3 bottom-16 hidden animate-[floaty_6s_ease-in-out_infinite_0.8s] sm:block motion-reduce:animate-none">
        <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-xl">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-100">
            <Truck className="h-4 w-4 text-amber-600" />
          </span>
          <div className="leading-tight">
            <p className="text-[11px] font-semibold text-stone-900">Driver en route</p>
            <p className="inline-flex items-center gap-1 text-[10px] text-stone-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-primary motion-reduce:animate-none" />
              Khumalo 40th · ETA 12 min
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
