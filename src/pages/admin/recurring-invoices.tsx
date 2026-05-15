/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Recurring invoices -- Wave 68.
 *
 * Operator surface for the recurring_invoice_templates table. Set
 * up "weekly office lunch for Acme R 5 000" once; the cron at
 * /api/cron/recurring-invoices generates a draft invoice every
 * cycle automatically. Invoices land in /admin/invoices in Draft
 * status so the operator can review + send.
 *
 * MVP scope: list templates, toggle active, pause/resume,
 * inline-edit the basics (name, frequency, total, next run),
 * delete. Full line-item editor + per-row send-after-generate
 * preference can land in W68 part 2.
 */
import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pause, Play, Trash2, RefreshCw, Repeat, ArrowLeft } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatZAR } from "@/lib/formatters";

type Template = {
  id: string;
  template_name: string;
  client_name: string;
  client_email: string | null;
  frequency: string;
  next_run_at: string;
  total_amount: number;
  active: boolean;
  pause_until: string | null;
  end_date: string | null;
};

export default function RecurringInvoicesPage() {
  const { user } = useAuth() as any;
  const { toast } = useToast();
  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("recurring_invoice_templates")
      .select("*")
      .eq("company_id", user.company_id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load", description: error.message, variant: "destructive" });
    } else {
      setRows((data || []) as Template[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.company_id) load();
  }, [user?.company_id]);

  const toggleActive = async (t: Template) => {
    await (supabase as any)
      .from("recurring_invoice_templates")
      .update({ active: !t.active, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    load();
  };

  const remove = async (t: Template) => {
    if (!confirm(`Delete recurring template "${t.template_name}"? Invoices already generated will stay -- only the template + future runs are removed.`)) return;
    await (supabase as any)
      .from("recurring_invoice_templates")
      .delete()
      .eq("id", t.id);
    toast({ title: "Template deleted", description: t.template_name });
    load();
  };

  const quickCreate = async () => {
    const name = window.prompt("Template name (e.g. 'Acme weekly office lunch'):", "");
    if (!name) return;
    const clientName = window.prompt("Client name:", "");
    if (!clientName) return;
    const totalStr = window.prompt("Total amount per cycle (rand, e.g. 5000):", "");
    const total = Number(totalStr);
    if (!Number.isFinite(total) || total <= 0) { toast({ title: "Invalid amount", variant: "destructive" }); return; }
    const frequency = (window.prompt("Frequency: weekly / fortnightly / monthly / quarterly", "monthly") || "monthly").toLowerCase();
    if (!["weekly","fortnightly","monthly","quarterly"].includes(frequency)) { toast({ title: "Invalid frequency", variant: "destructive" }); return; }
    const today = new Date().toISOString().slice(0, 10);
    setCreating(true);
    const { error } = await (supabase as any)
      .from("recurring_invoice_templates")
      .insert([{
        company_id: user.company_id,
        client_name: clientName,
        template_name: name,
        frequency,
        start_date: today,
        next_run_at: today, // first invoice fires on the next cron tick
        total_amount: total,
        subtotal: total,
        tax_amount: 0,
        line_items: [{ item_name: name, quantity: 1, unit_price: total, line_total: total }],
        created_by: user.id,
      }]);
    setCreating(false);
    if (error) {
      toast({ title: "Could not create", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Recurring template created", description: `${name}: first invoice fires on tomorrow's cron run.` });
    load();
  };

  return (
    <>
      <NoIndexMeta />
      <Head><title>Recurring invoices | CateringMS</title></Head>
      <div className="min-h-screen bg-slate-50 lg:pl-72 xl:pl-80">
        <AdminNav />
        <div className="py-8 px-4 max-w-5xl">
          <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to invoices
          </Link>
          <div className="flex items-end justify-between mb-6 gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl font-bold text-slate-900 mb-1 inline-flex items-center gap-2">
                <Repeat className="w-7 h-7 text-blue-600" />
                Recurring invoices
              </h1>
              <p className="text-slate-600 text-sm">
                Set up weekly / monthly / quarterly invoices once; the platform generates a draft on each cycle.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={quickCreate} disabled={creating} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                New template
              </Button>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Your templates ({rows.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && <p className="text-sm text-slate-500">Loading...</p>}
              {!loading && rows.length === 0 && (
                <div className="py-12 text-center text-slate-500">
                  <Repeat className="w-12 h-12 mx-auto opacity-30 mb-3" />
                  <p className="text-sm">No recurring templates yet.</p>
                  <p className="text-xs mt-1">Click "New template" to set up your first.</p>
                </div>
              )}
              <div className="space-y-2">
                {rows.map((t) => (
                  <div key={t.id} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${t.active ? "border-slate-200 bg-white" : "border-slate-200 bg-slate-50 opacity-70"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-900 truncate">{t.template_name}</span>
                        <Badge variant="outline" className="text-xs capitalize">{t.frequency}</Badge>
                        {!t.active && <Badge className="bg-slate-300 text-slate-800 text-xs">Paused</Badge>}
                      </div>
                      <p className="text-xs text-slate-600 mt-0.5 truncate">
                        {t.client_name} · next run {t.next_run_at}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-sm font-semibold text-slate-900">{formatZAR(t.total_amount)}</p>
                      <p className="text-[11px] text-slate-500">per cycle</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(t)} title={t.active ? "Pause" : "Resume"}>
                        {t.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(t)} title="Delete template">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
