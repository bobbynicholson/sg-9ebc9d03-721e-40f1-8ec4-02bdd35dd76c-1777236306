/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * /admin/clients -- Real clients only.
 *
 * As of the May 2026 lifecycle refactor, "client" means someone in the
 * `clients` table -- which now only gets populated when a quote is
 * accepted (see lifecycleService.promoteLeadToClient). The historical
 * "everyone we've ever touched" CRM-inbox view moved to /admin/contacts.
 *
 * This page is the proper relationship database -- name, contact,
 * how many orders, lifetime spend, last touch, active or dormant.
 * Nothing about leads, nothing about quotes-still-in-the-air. Just
 * people who've committed to working with us at least once.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AdminNav } from "@/components/admin/AdminNav";
import { Footer } from "@/components/Footer";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { UserRole } from "@/types/app";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ChatBot } from "@/components/ChatBot";
import {
  Users, Search, Plus, Mail, Phone, ArrowRight, Loader2,
} from "lucide-react";

interface ClientRow {
  id: string;
  client_name: string;
  email: string;
  phone: string;
  is_active: boolean;
  created_at: string | null;
  // Derived from orders rollup
  orderCount: number;
  totalSpent: number;
  lastOrderDate: string | null;
  // True when leads.converted_to_client_id points at this client
  cameFromLead: boolean;
}

function ClientsDatabase() {
  const { profile } = useAuth() as any;
  const companyId: string | null = profile?.company_id ?? null;
  const currency: string = profile?.companies?.currency || "ZAR";

  const [rows, setRows] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "dormant">("all");

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Three small parallel queries beats one wrestled-with join.
        const [clientsRes, ordersRes, leadsRes] = await Promise.all([
          supabase
            .from("clients")
            .select("id,client_name,email,phone,is_active,created_at")
            .eq("company_id", companyId)
            .is("deleted_at", null)
            .order("client_name", { ascending: true }),
          supabase
            .from("orders")
            .select(
              "client_id,total_amount,payment_status,event_date,completed_at,delivered_at",
            )
            .eq("company_id", companyId)
            .is("deleted_at", null),
          supabase
            .from("leads")
            .select("converted_to_client_id")
            .eq("company_id", companyId)
            .not("converted_to_client_id", "is", null),
        ]);

        if (cancelled) return;

        const clients = (clientsRes.data || []) as any[];
        const orders = (ordersRes.data || []) as any[];
        const leadConvertedIds = new Set(
          (leadsRes.data || [])
            .map((l: any) => l.converted_to_client_id)
            .filter(Boolean) as string[],
        );

        // Group orders by client_id once.
        const byClient = new Map<
          string,
          { count: number; spent: number; lastDate: string | null }
        >();
        for (const o of orders) {
          if (!o.client_id) continue;
          const cur =
            byClient.get(o.client_id) || { count: 0, spent: 0, lastDate: null };
          cur.count++;
          if (o.payment_status === "paid") {
            cur.spent += Number(o.total_amount || 0);
          }
          const candidate = o.completed_at || o.delivered_at || o.event_date;
          if (candidate && (!cur.lastDate || candidate > cur.lastDate)) {
            cur.lastDate = candidate;
          }
          byClient.set(o.client_id, cur);
        }

        const enriched: ClientRow[] = clients.map((c) => {
          const m = byClient.get(c.id);
          return {
            id: c.id,
            client_name: c.client_name,
            email: c.email,
            phone: c.phone,
            is_active: !!c.is_active,
            created_at: c.created_at,
            orderCount: m?.count || 0,
            totalSpent: m?.spent || 0,
            lastOrderDate: m?.lastDate || null,
            cameFromLead: leadConvertedIds.has(c.id),
          };
        });

        if (!cancelled) setRows(enriched);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter((r) => {
      if (filter === "active" && !r.is_active) return false;
      if (filter === "dormant" && r.is_active) return false;
      if (!q) return true;
      return (
        r.client_name.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phone || "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, filter]);

  const fmt = useMemo(
    () =>
      new Intl.NumberFormat("en-ZA", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
    [currency],
  );

  const totals = useMemo(
    () => ({
      all: rows.length,
      active: rows.filter((r) => r.is_active).length,
      dormant: rows.filter((r) => !r.is_active).length,
    }),
    [rows],
  );

  return (
    <>
      <NoIndexMeta />
      <Head>
        <title>Clients - CateringMS Admin</title>
      </Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">
          {/* Header */}
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg flex-shrink-0">
                <Users className="w-6 h-6 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl xl:text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
                  Clients
                </h1>
                <p className="text-sm sm:text-base text-slate-600 mt-1">
                  People who've committed -- accepted a quote at least once. For the wider net (leads, prospects, lost) open{" "}
                  <Link href="/admin/contacts" className="text-purple-600 hover:underline">
                    Contacts
                  </Link>
                  .
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Search name, email, phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 w-64 sm:w-80"
                />
              </div>
              <Link href="/admin/contacts">
                <Button variant="outline" className="gap-1.5">
                  <Plus className="w-4 h-4" /> Add via Contacts
                </Button>
              </Link>
            </div>
          </div>

          {/* Filter chips */}
          <div className="flex flex-wrap gap-2 mb-4">
            {(["all", "active", "dormant"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`px-3 py-1.5 text-sm font-medium rounded-full border transition-all ${
                  filter === k
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
                }`}
              >
                {k === "all" ? "All clients" : k === "active" ? "Active" : "Dormant"}
                <span className="ml-1.5 opacity-75">{totals[k]}</span>
              </button>
            ))}
          </div>

          {/* Table */}
          <Card className="border-0 shadow-sm">
            <CardContent className="p-0">
              {loading ? (
                <div className="p-12 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-3" />
                  Loading clients...
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState filter={filter} totalAll={totals.all} />
              ) : (
                <div className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <ClientRowItem key={r.id} row={r} fmt={fmt} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        <Footer />
      </div>

      <ChatBot userRole="admin" companyId={companyId ?? undefined} />
    </>
  );
}

function EmptyState({
  filter,
  totalAll,
}: {
  filter: string;
  totalAll: number;
}) {
  if (totalAll === 0) {
    return (
      <div className="p-12 text-center">
        <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
        <p className="text-sm font-medium text-slate-700">No clients yet.</p>
        <p className="text-xs text-slate-500 mt-2 max-w-md mx-auto">
          A lead becomes a client the moment their first quote is accepted. Open{" "}
          <Link href="/admin/contacts" className="text-purple-600 hover:underline">
            Contacts
          </Link>{" "}
          to see your leads pipeline.
        </p>
      </div>
    );
  }
  return (
    <div className="p-12 text-center">
      <p className="text-sm text-slate-600">No clients match this filter.</p>
    </div>
  );
}

function ClientRowItem({
  row,
  fmt,
}: {
  row: ClientRow;
  fmt: Intl.NumberFormat;
}) {
  return (
    <div className="p-4 hover:bg-slate-50 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-slate-900 truncate">{row.client_name}</p>
            {row.cameFromLead && (
              <Badge variant="outline" className="text-xs">From lead</Badge>
            )}
            {!row.is_active && (
              <Badge variant="outline" className="text-xs text-slate-500">
                Dormant
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" /> {row.email}
            </span>
            {row.phone && (
              <span className="flex items-center gap-1">
                <Phone className="w-3 h-3" /> {row.phone}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6 text-sm">
          <div className="text-center min-w-[60px]">
            <div className="font-bold text-slate-900">{row.orderCount}</div>
            <div className="text-xs text-slate-500">Orders</div>
          </div>
          <div className="text-center min-w-[80px]">
            <div className="font-bold text-emerald-600">
              {fmt.format(row.totalSpent)}
            </div>
            <div className="text-xs text-slate-500">Lifetime</div>
          </div>
          <div className="text-center min-w-[90px]">
            <div className="font-medium text-slate-700 text-sm">
              {row.lastOrderDate
                ? new Date(row.lastOrderDate).toLocaleDateString("en-ZA", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </div>
            <div className="text-xs text-slate-500">Last order</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/contacts?focus=${encodeURIComponent(row.email)}`}
          >
            <Button variant="ghost" size="sm">
              View <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ClientsPage() {
  return (
    <ProtectedRoute
      allowedRoles={[
        UserRole.SUPER_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.ADMIN,
      ]}
    >
      <ClientsDatabase />
    </ProtectedRoute>
  );
}
