/* eslint-disable @typescript-eslint/no-explicit-any */
import { UserRole } from "@/types/app";
import { useState, useEffect, useMemo } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SortHeader } from "@/components/ui/sort-header";
import {
  DollarSign, Clock, AlertTriangle, ChefHat, TrendingUp, Loader2,
  Calendar, Download, ExternalLink, Users,
} from "lucide-react";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  kitchenStaffService,
  type StaffWageSummary,
} from "@/services/kitchenStaffService";

// ── Date range presets ──────────────────────────────────────────────────────

type Preset = "this_week" | "last_week" | "this_month" | "last_month" | "custom";

interface Range { fromISO: string; toISO: string; label: string; }

function startOfWeek(d: Date): Date {
  // Monday start (SA convention). Move to Mon = day 1.
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay(); // 0=Sun ... 6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function presetRange(p: Preset): Range {
  const now = new Date();
  if (p === "this_week") {
    const from = startOfWeek(now);
    const to = new Date(from);
    to.setDate(to.getDate() + 7);
    return { fromISO: from.toISOString(), toISO: to.toISOString(), label: "This week" };
  }
  if (p === "last_week") {
    const thisStart = startOfWeek(now);
    const from = new Date(thisStart);
    from.setDate(from.getDate() - 7);
    return { fromISO: from.toISOString(), toISO: thisStart.toISOString(), label: "Last week" };
  }
  if (p === "this_month") {
    const from = startOfMonth(now);
    const to = new Date(from);
    to.setMonth(to.getMonth() + 1);
    return { fromISO: from.toISOString(), toISO: to.toISOString(), label: "This month" };
  }
  if (p === "last_month") {
    const thisStart = startOfMonth(now);
    const from = new Date(thisStart);
    from.setMonth(from.getMonth() - 1);
    return { fromISO: from.toISOString(), toISO: thisStart.toISOString(), label: "Last month" };
  }
  // Custom -- caller manages.
  return { fromISO: "", toISO: "", label: "Custom" };
}

function fmtMins(mins: number): string {
  if (!Number.isFinite(mins)) return "0h";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function fmtZAR(amount: number | null | undefined): string {
  if (amount == null || isNaN(amount)) return "--";
  return `R ${amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDateInput(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function fromDateInput(local: string, endOfDay = false): string {
  const d = new Date(local);
  if (isNaN(d.getTime())) return "";
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

type SortKey = "name" | "shifts" | "standard" | "hours" | "overtime" | "wage" | "rate";

function WageDashboardPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const companyId = (profile as any)?.company_id as string | undefined;

  const [preset, setPreset] = useState<Preset>("this_week");
  const [range, setRange] = useState<Range>(presetRange("this_week"));
  const [customFrom, setCustomFrom] = useState<string>(toDateInput(presetRange("this_week").fromISO));
  const [customTo, setCustomTo] = useState<string>(toDateInput(presetRange("this_week").toISO));

  const [rows, setRows] = useState<StaffWageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("wage");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const load = async () => {
    if (!companyId || !range.fromISO || !range.toISO) return;
    setLoading(true);
    try {
      const data = await kitchenStaffService.getWageSummary(companyId, range.fromISO, range.toISO);
      setRows(data);
    } catch (e: any) {
      toast({ title: "Could not load wages", description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [companyId, range.fromISO, range.toISO]);

  const handlePresetChange = (p: Preset) => {
    setPreset(p);
    if (p !== "custom") {
      const r = presetRange(p);
      setRange(r);
      setCustomFrom(toDateInput(r.fromISO));
      setCustomTo(toDateInput(r.toISO));
    }
  };

  const handleApplyCustom = () => {
    if (!customFrom || !customTo) {
      toast({ title: "Pick both dates", variant: "destructive" });
      return;
    }
    const fromISO = fromDateInput(customFrom);
    const toISO = fromDateInput(customTo, /* endOfDay */ true);
    if (!fromISO || !toISO || new Date(fromISO) > new Date(toISO)) {
      toast({ title: "Invalid range", variant: "destructive" });
      return;
    }
    setPreset("custom");
    setRange({ fromISO, toISO, label: "Custom" });
  };

  // Headline totals
  const totals = useMemo(() => {
    const standard_min = rows.reduce((s, r) => s + r.standard_min, 0);
    const overtime_min = rows.reduce((s, r) => s + r.overtime_min, 0);
    const total_wage = rows.reduce((s, r) => s + r.total_wage, 0);
    const open_shifts = rows.filter(r => r.open_shift).length;
    const missing_rates = rows.filter(r => r.hourly_rate == null && (r.standard_min + r.overtime_min) > 0).length;
    return {
      standard_min,
      overtime_min,
      total_wage,
      total_min: standard_min + overtime_min,
      staff_count: rows.length,
      open_shifts,
      missing_rates,
    };
  }, [rows]);

  // Sort, every column on the wages table can drive it now.
  const sorted = useMemo(() => {
    const arr = [...rows];
    arr.sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc"
        ? a.full_name.localeCompare(b.full_name)
        : b.full_name.localeCompare(a.full_name);
      let av = 0, bv = 0;
      if (sortKey === "shifts")        { av = a.shifts_count;  bv = b.shifts_count; }
      else if (sortKey === "standard") { av = a.standard_min;  bv = b.standard_min; }
      else if (sortKey === "hours")    { av = a.total_min;     bv = b.total_min; }
      else if (sortKey === "overtime") { av = a.overtime_min;  bv = b.overtime_min; }
      else if (sortKey === "rate")     { av = Number(a.hourly_rate ?? -1); bv = Number(b.hourly_rate ?? -1); }
      else if (sortKey === "wage")     { av = a.total_wage;    bv = b.total_wage; }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };

  // CSV export -- no rates withheld here, this page is owner-only
  const handleExportCsv = () => {
    if (sorted.length === 0) return;
    const header = [
      "Staff name", "Role", "Shifts", "Standard hours", "Overtime hours",
      "Total hours", "Hourly rate (R)", "Overtime rate (R)",
      "Standard wage (R)", "Overtime wage (R)", "Total wage (R)", "Open shift",
    ];
    const lines = [header.join(",")];
    for (const r of sorted) {
      const row = [
        `"${(r.full_name || "").replace(/"/g, '""')}"`,
        `"${(r.role_title || "").replace(/"/g, '""')}"`,
        r.shifts_count,
        (r.standard_min / 60).toFixed(2),
        (r.overtime_min / 60).toFixed(2),
        (r.total_min / 60).toFixed(2),
        r.hourly_rate ?? "",
        r.overtime_rate ?? "",
        r.standard_wage.toFixed(2),
        r.overtime_wage.toFixed(2),
        r.total_wage.toFixed(2),
        r.open_shift ? "yes" : "no",
      ];
      lines.push(row.join(","));
    }
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const tag = `${toDateInput(range.fromISO)}_to_${toDateInput(range.toISO)}`;
    a.download = `kitchen-wages-${tag}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProtectedRoute allowedRoles={[UserRole.ADMIN, UserRole.SUPER_ADMIN]}>
      <Head><title>Wage Dashboard, CateringMS</title></Head>
      <NoIndexMeta />
      <AdminNav />
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-emerald-50 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <div className="px-3 sm:px-4 md:px-6 py-4 sm:py-6 md:py-8 max-w-screen-2xl">

          {/* Header */}
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <DollarSign className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
                  Wage Dashboard
                  <InfoTooltip content="Hours x rates roll-up for the kitchen team. Standard hours are anything within the staffer's daily threshold (default 9h, BCEA ordinary day). Anything over is overtime at 1.5x by default.\n\nThis page is the only place rand values are visible, the kitchen tablet shows hours only." />
                </h1>
                <p className="text-sm text-slate-600 mt-1">
                  Hours and wages, owner-only. The kitchen team never sees rates.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/admin/kitchen-staff">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Users className="w-4 h-4" />Manage staff
                </Button>
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportCsv}
                disabled={sorted.length === 0}
                className="gap-1.5"
              >
                <Download className="w-4 h-4" />Export CSV
              </Button>
            </div>
          </div>

          {/* Range picker */}
          <Card className="border-0 shadow-sm mb-5">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-1.5">
                  {([
                    ["this_week", "This week"],
                    ["last_week", "Last week"],
                    ["this_month", "This month"],
                    ["last_month", "Last month"],
                    ["custom", "Custom"],
                  ] as Array<[Preset, string]>).map(([p, label]) => (
                    <Button
                      key={p}
                      variant={preset === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => handlePresetChange(p)}
                      className={preset === p ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
                {preset === "custom" && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">From</Label>
                      <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-40" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">To</Label>
                      <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-40" />
                    </div>
                    <Button size="sm" onClick={handleApplyCustom} className="bg-emerald-600 hover:bg-emerald-700">Apply</Button>
                  </div>
                )}
                <div className="text-xs text-slate-500 inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {range.fromISO && range.toISO
                    ? `${new Date(range.fromISO).toLocaleDateString("en-ZA")} -> ${new Date(new Date(range.toISO).getTime() - 1).toLocaleDateString("en-ZA")}`
                    : "Pick a range"}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Headline stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Total wage</div>
                <div className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums">{fmtZAR(totals.total_wage)}</div>
                <div className="text-[10px] text-slate-500 mt-1">{totals.staff_count} staff member{totals.staff_count === 1 ? "" : "s"}</div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1"><Clock className="w-3 h-3" />Standard hours</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{fmtMins(totals.standard_min)}</div>
                <div className="text-[10px] text-slate-500 mt-1">Within daily threshold</div>
              </CardContent>
            </Card>
            <Card className={`border-0 shadow-sm ${totals.overtime_min > 0 ? "bg-amber-50" : ""}`}>
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 inline-flex items-center gap-1"><TrendingUp className="w-3 h-3" />Overtime hours</div>
                <div className={`text-xl sm:text-2xl font-bold tabular-nums ${totals.overtime_min > 0 ? "text-amber-700" : "text-slate-900"}`}>{fmtMins(totals.overtime_min)}</div>
                <div className="text-[10px] text-slate-500 mt-1">
                  {totals.total_min > 0
                    ? `${Math.round((totals.overtime_min / totals.total_min) * 100)}% of total`
                    : "No worked time yet"}
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Open shifts</div>
                <div className="text-xl sm:text-2xl font-bold text-slate-900 tabular-nums">{totals.open_shifts}</div>
                <div className="text-[10px] text-slate-500 mt-1">In progress now</div>
              </CardContent>
            </Card>
          </div>

          {/* Missing-rate banner */}
          {totals.missing_rates > 0 && (
            <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <span className="font-semibold">{totals.missing_rates} staff member{totals.missing_rates === 1 ? "" : "s"} worked without an hourly rate set.</span>{" "}
                Their hours show but their wages can't be computed.
                <Link href="/admin/kitchen-staff" className="ml-1 underline font-medium inline-flex items-center gap-1">
                  Set rates <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
            </div>
          )}

          {/* Table */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-slate-500 text-sm">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />Loading wages...
                </div>
              ) : sorted.length === 0 ? (
                <div className="text-center py-12">
                  <ChefHat className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">No shifts in this range</p>
                  <p className="text-sm text-slate-500 mt-1">
                    Once your kitchen team starts clocking in, wages will appear here.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200 bg-slate-50/50">
                        <th className="px-4 py-2.5 font-medium">
                          <SortHeader sortKey="name" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)}>Staff</SortHeader>
                        </th>
                        <th className="px-2 py-2.5 font-medium text-right">
                          <SortHeader sortKey="shifts" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)} align="right">Shifts</SortHeader>
                        </th>
                        <th className="px-2 py-2.5 font-medium text-right">
                          <SortHeader sortKey="standard" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)} align="right">Standard</SortHeader>
                        </th>
                        <th className="px-2 py-2.5 font-medium text-right">
                          <SortHeader sortKey="overtime" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)} align="right">Overtime</SortHeader>
                        </th>
                        <th className="px-2 py-2.5 font-medium text-right">
                          <SortHeader sortKey="hours" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)} align="right">Total hrs</SortHeader>
                        </th>
                        <th className="px-2 py-2.5 font-medium text-right">
                          <SortHeader sortKey="rate" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)} align="right">Rate</SortHeader>
                        </th>
                        <th className="px-3 py-2.5 font-medium text-right">
                          <SortHeader sortKey="wage" activeKey={sortKey} activeDir={sortDir} onToggle={(k) => toggleSort(k as SortKey)} align="right">Wage</SortHeader>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => {
                        const noRate = r.hourly_rate == null;
                        return (
                          <tr key={r.staff_id} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                                  <ChefHat className="w-3.5 h-3.5 text-slate-500" />
                                </div>
                                <div className="min-w-0">
                                  <div className="font-medium text-slate-900 truncate">{r.full_name}</div>
                                  <div className="text-[10px] text-slate-500 flex items-center gap-1 flex-wrap">
                                    {r.role_title && <span>{r.role_title}</span>}
                                    {r.open_shift && (
                                      <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[9px] px-1 py-0">On shift now</Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right text-slate-600 tabular-nums">{r.shifts_count}</td>
                            <td className="px-2 py-2.5 text-right tabular-nums">{fmtMins(r.standard_min)}</td>
                            <td className={`px-2 py-2.5 text-right tabular-nums font-medium ${r.overtime_min > 0 ? "text-amber-700" : "text-slate-500"}`}>
                              {fmtMins(r.overtime_min)}
                            </td>
                            <td className="px-2 py-2.5 text-right text-slate-900 font-semibold tabular-nums">{fmtMins(r.total_min)}</td>
                            <td className="px-2 py-2.5 text-right text-slate-600 tabular-nums">
                              {noRate
                                ? <span className="text-amber-600 text-xs">Not set</span>
                                : `R ${Number(r.hourly_rate).toFixed(2)}`}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                              {noRate
                                ? <span className="text-amber-600 text-xs">--</span>
                                : (
                                  <div>
                                    <div className="text-slate-900">{fmtZAR(r.total_wage)}</div>
                                    {r.overtime_wage > 0 && (
                                      <div className="text-[10px] text-amber-700 font-normal">
                                        incl. {fmtZAR(r.overtime_wage)} OT
                                      </div>
                                    )}
                                  </div>
                                )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 border-t-2 border-slate-200 font-semibold">
                        <td className="px-4 py-3 text-slate-900">Totals</td>
                        <td className="px-2 py-3"></td>
                        <td className="px-2 py-3 text-right tabular-nums">{fmtMins(totals.standard_min)}</td>
                        <td className={`px-2 py-3 text-right tabular-nums ${totals.overtime_min > 0 ? "text-amber-700" : ""}`}>{fmtMins(totals.overtime_min)}</td>
                        <td className="px-2 py-3 text-right tabular-nums">{fmtMins(totals.total_min)}</td>
                        <td className="px-2 py-3"></td>
                        <td className="px-3 py-3 text-right text-emerald-700 tabular-nums">{fmtZAR(totals.total_wage)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Footer />
      </main>
    </ProtectedRoute>
  );
}

export default WageDashboardPage;
