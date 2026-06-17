/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/**
 * Recurring invoices - Wave 68.
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
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import Link from "next/link";
import { AdminNav } from "@/components/admin/AdminNav";
import { PortalShell, PortalHeader } from "@/components/portal/ui";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { toLocalISO } from "@/lib/localDate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pause, Play, Trash2, RefreshCw, Repeat, ArrowLeft, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { dbErrorMessage } from "@/lib/errors/dbErrorMessage";
import { useToast } from "@/hooks/use-toast";
import { formatZAR } from "@/lib/formatters";

type LineItem = {
  item_name: string;
  quantity: number;
  unit_price: number;
};

function emptyLine(): LineItem {
  return { item_name: "", quantity: 1, unit_price: 0 };
}

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
  // Wave 68.1 - proper Dialog state replacing the window.prompt chain.
  // 4 sequential prompts couldn't be cancelled cleanly, lost typing on
  // a misclick, and had no line-item editor at all. Now: one Dialog
  // with validated fields + an editable line-items table.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [frequency, setFrequency] = useState<string>("monthly");
  const [startDate, setStartDate] = useState<string>(() => toLocalISO(new Date()));
  const [lineItems, setLineItems] = useState<LineItem[]>([emptyLine()]);

  const subtotal = useMemo(
    () => lineItems.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.unit_price) || 0), 0),
    [lineItems],
  );

  const resetForm = () => {
    setTemplateName("");
    setClientName("");
    setClientEmail("");
    setFrequency("monthly");
    setStartDate(toLocalISO(new Date()));
    setLineItems([emptyLine()]);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const load = async () => {
    if (!user?.company_id) return;
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("recurring_invoice_templates")
      .select("*")
      .eq("company_id", user.company_id)
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Could not load", description: dbErrorMessage(error, { entity: "recurring invoice" }), variant: "destructive" });
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
    if (!confirm(`Delete recurring template "${t.template_name}"? Invoices already generated will stay - only the template + future runs are removed.`)) return;
    await (supabase as any)
      .from("recurring_invoice_templates")
      .delete()
      .eq("id", t.id);
    toast({ title: "Template deleted", description: t.template_name });
    load();
  };

  const handleCreate = async () => {
    // Validate. Toast on the first failing field so the operator
    // knows exactly what to fix; no shaking-form noise.
    if (!templateName.trim()) {
      toast({ title: "Template name required", variant: "destructive" });
      return;
    }
    if (!clientName.trim()) {
      toast({ title: "Client name required", variant: "destructive" });
      return;
    }
    const cleanLines = lineItems
      .map((l) => ({
        item_name: (l.item_name || "").trim(),
        quantity: Number(l.quantity) || 0,
        unit_price: Number(l.unit_price) || 0,
      }))
      .filter((l) => l.item_name && l.quantity > 0 && l.unit_price > 0);
    if (cleanLines.length === 0) {
      toast({
        title: "Need at least one line item",
        description: "Each line needs a name, quantity > 0 and price > 0.",
        variant: "destructive",
      });
      return;
    }
    const total = cleanLines.reduce((s, l) => s + l.quantity * l.unit_price, 0);

    setCreating(true);
    const { error } = await (supabase as any)
      .from("recurring_invoice_templates")
      .insert([{
        company_id: user.company_id,
        client_name: clientName.trim(),
        client_email: clientEmail.trim() || null,
        template_name: templateName.trim(),
        frequency,
        start_date: startDate,
        next_run_at: startDate, // first invoice fires on the next cron tick
        total_amount: total,
        subtotal: total,
        tax_amount: 0,
        line_items: cleanLines.map((l) => ({
          item_name: l.item_name,
          quantity: l.quantity,
          unit_price: l.unit_price,
          line_total: l.quantity * l.unit_price,
        })),
        created_by: user.id,
      }]);
    setCreating(false);
    if (error) {
      toast({ title: "Could not create", description: dbErrorMessage(error, { entity: "recurring invoice" }), variant: "destructive" });
      return;
    }
    toast({
      title: "Recurring template created",
      description: `${templateName.trim()}: first invoice fires on the next cron run.`,
    });
    setDialogOpen(false);
    resetForm();
    load();
  };

  const updateLine = (i: number, patch: Partial<LineItem>) => {
    setLineItems((prev) => prev.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };
  const removeLine = (i: number) => {
    setLineItems((prev) => prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev);
  };
  const addLine = () => setLineItems((prev) => [...prev, emptyLine()]);

  return (
    <>
      <NoIndexMeta />
      <Head><title>Recurring invoices - CateringMS</title></Head>
      <AdminNav />
      <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-slate-950 lg:pl-72 xl:pl-80 pt-16 lg:pt-0">
        <PortalShell className="min-h-0 bg-transparent dark:bg-transparent">
          <Link href="/admin/invoices" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to invoices
          </Link>
          <PortalHeader
            title="Recurring invoices"
            icon={Repeat}
            subtitle="Set up weekly / monthly / quarterly invoices once; the platform generates a draft on each cycle."
            actions={
            <>
              <Button variant="outline" onClick={load} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={openCreate} disabled={creating} className="bg-brand-primary hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                New template
              </Button>
            </>
            }
          />

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
        </PortalShell>
      </div>

      {/* Wave 68.1 - new-template dialog. Replaces the 4-prompt
          window.prompt chain with validated fields + editable
          line-items table. First invoice fires on the configured
          next_run_at (defaults to today). */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New recurring template</DialogTitle>
            <DialogDescription>
              Set up the invoice once. The cron generates a draft on the {frequency} cycle starting {startDate}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="ri-name">Template name</Label>
                <Input
                  id="ri-name"
                  placeholder="Acme weekly office lunch"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ri-client">Client name</Label>
                <Input
                  id="ri-client"
                  placeholder="Acme Ltd"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ri-email">Client email <span className="text-xs text-slate-400">(optional)</span></Label>
                <Input
                  id="ri-email"
                  type="email"
                  placeholder="ap@acme.example"
                  value={clientEmail}
                  onChange={(e) => setClientEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Frequency</Label>
                <Select value={frequency} onValueChange={setFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="fortnightly">Fortnightly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ri-start">First run date</Label>
                <Input
                  id="ri-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Line items</Label>
                <Button type="button" variant="ghost" size="sm" onClick={addLine}>
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  Add line
                </Button>
              </div>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="text-left px-2 py-1.5">Item</th>
                      <th className="text-right px-2 py-1.5 w-20">Qty</th>
                      <th className="text-right px-2 py-1.5 w-28">Unit price</th>
                      <th className="text-right px-2 py-1.5 w-28">Line total</th>
                      <th className="w-9"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineItems.map((l, i) => {
                      const lineTotal = (Number(l.quantity) || 0) * (Number(l.unit_price) || 0);
                      return (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="px-2 py-1">
                            <Input
                              value={l.item_name}
                              onChange={(e) => updateLine(i, { item_name: e.target.value })}
                              placeholder="Lunch platter"
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={l.quantity}
                              onChange={(e) => updateLine(i, { quantity: Number(e.target.value) || 0 })}
                              className="h-8 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              value={l.unit_price}
                              onChange={(e) => updateLine(i, { unit_price: Number(e.target.value) || 0 })}
                              className="h-8 text-right tabular-nums"
                            />
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums text-slate-700">
                            {formatZAR(lineTotal)}
                          </td>
                          <td className="px-1 py-1 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(i)}
                              disabled={lineItems.length <= 1}
                              className="text-slate-400 hover:text-rose-600 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Remove line"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50">
                    <tr className="border-t border-slate-200">
                      <td colSpan={3} className="px-2 py-1.5 text-right text-xs uppercase tracking-wider text-slate-500 font-semibold">
                        Subtotal per cycle
                      </td>
                      <td className="px-2 py-1.5 text-right text-sm font-semibold tabular-nums text-slate-900">
                        {formatZAR(subtotal)}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-brand-primary hover:opacity-90"
            >
              {creating ? "Creating..." : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
