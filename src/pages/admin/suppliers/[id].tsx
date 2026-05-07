/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Supplier detail. Four panes:
 *   1. Header with contact + Compose email (Gmail / Outlook / default
 *      / clipboard, same chain as /admin/clients)
 *   2. Purchase analytics with date-range picker (30d / 90d / 365d /
 *      custom). Total spend, receipt count, unique items, avg receipt.
 *   3. Products supplied -- the inventory_item_suppliers rows. Add /
 *      remove, edit per-supplier price + lead time.
 *   4. Receipts list filtered to this supplier in the chosen window.
 */
import { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Building2, Mail, Phone, Globe, Send, Copy, ExternalLink, Calendar, TrendingUp, Package, Receipt, Plus, Trash2, Star, Loader2, Search } from "lucide-react";
import { NoIndexMeta } from "@/components/NoIndexMeta";
import { AdminNav } from "@/components/admin/AdminNav";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { UserRole } from "@/types/app";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { composeEmail } from "@/lib/composeEmail";
import {
  supplierService, type Supplier, type SupplierProduct,
  type SupplierPurchaseSummary, type SupplierReceiptRow,
} from "@/services/supplierService";

const fmtR = (v: number | null | undefined) =>
  v == null ? "—" : `R ${Number(v).toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDate = (iso: string | null) =>
  !iso ? "—" : new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });

type RangeKey = "30d" | "90d" | "365d" | "custom";

function isoDaysAgo(d: number) {
  const dt = new Date();
  dt.setDate(dt.getDate() - d);
  return dt.toISOString();
}

function SupplierDetail() {
  const router = useRouter();
  const supplierId = typeof router.query.id === "string" ? router.query.id : null;
  const { profile, user } = useAuth() as any;
  const companyId = profile?.company_id;
  const { toast } = useToast();

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [products, setProducts] = useState<SupplierProduct[]>([]);
  const [summary, setSummary] = useState<SupplierPurchaseSummary | null>(null);
  const [receipts, setReceipts] = useState<SupplierReceiptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [composeOpen, setComposeOpen] = useState(false);
  const [linkProductOpen, setLinkProductOpen] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<SupplierProduct | null>(null);

  const [range, setRange] = useState<RangeKey>("90d");
  const [customFrom, setCustomFrom] = useState<string>(new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState<string>(new Date().toISOString().slice(0, 10));

  const { fromIso, toIso } = useMemo(() => {
    if (range === "custom") {
      return {
        fromIso: new Date(customFrom + "T00:00:00").toISOString(),
        toIso: new Date(customTo + "T23:59:59").toISOString(),
      };
    }
    const days = range === "30d" ? 30 : range === "90d" ? 90 : 365;
    return { fromIso: isoDaysAgo(days), toIso: new Date().toISOString() };
  }, [range, customFrom, customTo]);

  const reload = async () => {
    if (!supplierId || !companyId) return;
    setLoading(true);
    const [s, prods, sum, rcpts] = await Promise.all([
      supplierService.getById(supplierId),
      supplierService.listProducts(supplierId),
      supplierService.getPurchaseSummary({ supplierId, companyId, fromIso, toIso }),
      supplierService.listReceipts({ supplierId, companyId, fromIso, toIso }),
    ]);
    setSupplier(s);
    setProducts(prods);
    setSummary(sum);
    setReceipts(rcpts);
    setLoading(false);
  };

  useEffect(() => { reload(); }, [supplierId, companyId, fromIso, toIso]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supplierId) return null;

  return (
    <>
      <NoIndexMeta />
      <Head><title>{supplier?.supplier_name || "Supplier"} - CateringMS Admin</title></Head>
      <AdminNav />

      <div className="min-h-screen overflow-x-hidden bg-gradient-to-br from-slate-50 to-slate-100 lg:pl-72 xl:pl-80">
        <div className="px-3 sm:px-4 md:px-6 pt-20 lg:pt-6 pb-6 max-w-screen-2xl">

          <Link
            href="/admin/suppliers"
            className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1 mb-3"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to suppliers
          </Link>

          {loading || !supplier ? (
            <Card className="border-0 shadow"><CardContent className="py-16 text-center text-slate-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading supplier...
            </CardContent></Card>
          ) : (
            <>
              {/* Header */}
              <Card className="border-0 shadow-lg mb-5">
                <CardContent className="pt-6 pb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg flex-shrink-0">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-amber-600 to-orange-600 bg-clip-text text-transparent">
                        {supplier.supplier_name}
                      </h1>
                      <div className="flex items-center gap-3 flex-wrap text-sm text-slate-600 mt-1">
                        {supplier.contact_person && <span className="text-slate-900">{supplier.contact_person}</span>}
                        {supplier.email && (
                          <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3" />{supplier.email}</span>
                        )}
                        {supplier.phone && (
                          <span className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{supplier.phone}</span>
                        )}
                        {(supplier as any).website && (
                          <a href={(supplier as any).website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-amber-700 hover:underline">
                            <Globe className="w-3 h-3" />{(supplier as any).website}
                          </a>
                        )}
                      </div>
                      {((supplier as any).supplier_categories || []).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {((supplier as any).supplier_categories || []).map((c: string) => (
                            <Badge key={c} variant="outline" className="text-[10px] bg-slate-50 text-slate-700 border-slate-200">
                              {c}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {(supplier.payment_terms || (supplier as any).payment_method) && (
                        <p className="text-xs text-slate-500 mt-2">
                          {(supplier as any).payment_method && <span className="capitalize">{(supplier as any).payment_method}</span>}
                          {(supplier as any).payment_method && supplier.payment_terms && <span> · </span>}
                          {supplier.payment_terms && <span>{supplier.payment_terms}</span>}
                        </p>
                      )}
                      {supplier.notes && (
                        <p className="text-xs text-slate-600 mt-2 max-w-xl">{supplier.notes}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    <Button
                      onClick={() => setComposeOpen(true)}
                      disabled={!supplier.email}
                      className="bg-gradient-to-r from-amber-600 to-orange-600 text-white"
                    >
                      <Send className="w-4 h-4 mr-1.5" /> Compose email
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Date range + summary tiles */}
              <Card className="border-0 shadow-sm mb-5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                    Purchase summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-center gap-2 mb-4">
                    {(["30d", "90d", "365d", "custom"] as RangeKey[]).map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setRange(r)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                          range === r
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        {r === "custom" ? "Custom" : `Last ${r}`}
                      </button>
                    ))}
                    {range === "custom" && (
                      <div className="flex items-center gap-2 ml-2">
                        <Input
                          type="date"
                          value={customFrom}
                          onChange={(e) => setCustomFrom(e.target.value)}
                          className="text-xs h-8 w-40"
                        />
                        <span className="text-xs text-slate-500">to</span>
                        <Input
                          type="date"
                          value={customTo}
                          onChange={(e) => setCustomTo(e.target.value)}
                          className="text-xs h-8 w-40"
                        />
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <SummaryTile label="Total spend" value={fmtR(summary?.total_spend ?? 0)} accent="emerald" icon={TrendingUp} />
                    <SummaryTile label="Receipts" value={String(summary?.receipt_count ?? 0)} icon={Receipt} />
                    <SummaryTile label="Unique items" value={String(summary?.unique_items ?? 0)} icon={Package} />
                    <SummaryTile label="Avg receipt" value={fmtR(summary?.avg_receipt_value ?? 0)} icon={Calendar} />
                  </div>

                  {summary && summary.by_item.length > 0 && (
                    <div className="mt-4">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Top spend by item</h3>
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                            <tr>
                              <th className="text-left py-2 px-3">Item</th>
                              <th className="text-right py-2 px-3">Quantity</th>
                              <th className="text-right py-2 px-3">Spend</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.by_item.slice(0, 10).map((it, i) => (
                              <tr key={i} className="border-t border-slate-100">
                                <td className="py-2 px-3 text-slate-900">{it.description}</td>
                                <td className="py-2 px-3 text-right tabular-nums text-slate-600">{Number(it.quantity || 0).toLocaleString("en-ZA")}</td>
                                <td className="py-2 px-3 text-right tabular-nums font-semibold">{fmtR(it.spend)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Products supplied */}
              <Card className="border-0 shadow-sm mb-5">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Package className="w-4 h-4 text-purple-600" />
                    Products supplied
                    <Badge variant="outline" className="text-[10px] bg-slate-50">{products.length}</Badge>
                  </CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setLinkProductOpen(true)} className="gap-1.5">
                    <Plus className="w-3.5 h-3.5" /> Link product
                  </Button>
                </CardHeader>
                <CardContent>
                  {products.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">
                      No products linked yet. Link an inventory item to track per-supplier pricing.
                    </p>
                  ) : (
                    <div className="rounded-lg border border-slate-200 overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                          <tr>
                            <th className="text-left py-2 px-3">Item</th>
                            <th className="text-left py-2 px-3">Pack size</th>
                            <th className="text-right py-2 px-3">Unit price</th>
                            <th className="text-right py-2 px-3">Lead time</th>
                            <th className="text-left py-2 px-3">Last buy</th>
                            <th className="text-right py-2 px-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {products.map((p) => (
                            <tr key={p.id} className="border-t border-slate-100">
                              <td className="py-2 px-3">
                                <div className="font-medium text-slate-900 inline-flex items-center gap-1.5">
                                  {p.is_preferred && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                                  {p.inventory_items?.item_name || "(unlinked)"}
                                </div>
                                {p.inventory_items?.category && (
                                  <p className="text-[11px] text-slate-500">{p.inventory_items.category}</p>
                                )}
                              </td>
                              <td className="py-2 px-3 text-xs text-slate-600">{p.pack_size || "—"}</td>
                              <td className="py-2 px-3 text-right tabular-nums">{p.unit_price ? fmtR(p.unit_price) : "—"}</td>
                              <td className="py-2 px-3 text-right text-xs text-slate-600">
                                {p.lead_time_days != null ? `${p.lead_time_days}d` : "—"}
                              </td>
                              <td className="py-2 px-3 text-xs text-slate-600">{fmtDate(p.last_purchased_at)}</td>
                              <td className="py-2 px-3 text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setConfirmUnlink(p)}
                                  className="h-7 text-rose-600 hover:bg-rose-50 px-2"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Receipts list for this window */}
              <Card className="border-0 shadow-sm mb-5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-blue-600" />
                    Receipts in this window
                    <Badge variant="outline" className="text-[10px] bg-slate-50">{receipts.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {receipts.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">No receipts on file from this supplier in this window.</p>
                  ) : (
                    <div className="space-y-2">
                      {receipts.map((r) => (
                        <Link
                          key={r.id}
                          href={`/admin/shopping?tab=receipts&receipt=${r.id}`}
                          className="block px-3 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900 truncate">{r.vendor || "(no vendor)"}</p>
                              <p className="text-xs text-slate-500">
                                {fmtDate(r.receipt_date) || fmtDate(r.created_at)}
                                {r.notes && ` · ${r.notes.slice(0, 60)}${r.notes.length > 60 ? "..." : ""}`}
                              </p>
                            </div>
                            <span className="text-sm font-semibold text-emerald-700 flex-shrink-0">{fmtR(r.total)}</span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Compose email -- Gmail / Outlook / default / clipboard */}
      {supplier && (
        <ComposeSupplierEmail
          open={composeOpen}
          onClose={() => setComposeOpen(false)}
          supplier={supplier}
          fromName={profile?.full_name || profile?.company_name}
        />
      )}

      {/* Link product dialog */}
      {supplierId && companyId && (
        <LinkProductDialog
          open={linkProductOpen}
          companyId={companyId}
          supplierId={supplierId}
          onClose={() => setLinkProductOpen(false)}
          onSaved={() => { setLinkProductOpen(false); reload(); }}
        />
      )}

      {/* Unlink confirm */}
      <AlertDialog open={!!confirmUnlink} onOpenChange={(o) => !o && setConfirmUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlink this product?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmUnlink?.inventory_items?.item_name} will no longer be associated with this supplier.
              The inventory item itself stays in place.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={async () => {
                if (!confirmUnlink) return;
                try {
                  await supplierService.unlinkProduct(confirmUnlink.id);
                  toast({ title: "Product unlinked" });
                  setConfirmUnlink(null);
                  reload();
                } catch (e: any) {
                  toast({ title: "Couldn't unlink", description: e?.message, variant: "destructive" });
                }
              }}
            >
              Unlink
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SummaryTile({
  label, value, icon: Icon, accent = "slate",
}: { label: string; value: string; icon: typeof TrendingUp; accent?: "slate" | "emerald" }) {
  const accentClass = accent === "emerald" ? "text-emerald-600" : "text-slate-700";
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <Icon className={`w-4 h-4 ${accentClass}`} />
        </div>
        <p className={`text-xl font-bold ${accentClass}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function ComposeSupplierEmail({
  open, onClose, supplier, fromName,
}: {
  open: boolean;
  onClose: () => void;
  supplier: Supplier;
  fromName?: string;
}) {
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSubject(`Order request for ${supplier.supplier_name}`);
    const greeting = supplier.contact_person ? `Hi ${supplier.contact_person.split(" ")[0]},` : "Hi there,";
    setBody(`${greeting}\n\nHope you're well. Could you please confirm availability and pricing on the items below for delivery this week?\n\n- \n- \n- \n\nLet me know your soonest delivery slot.\n\nThanks,\n${fromName || ""}`);
  }, [open, supplier, fromName]);

  const payload = {
    to: supplier.email || "",
    subject,
    body,
    fromName,
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-5 h-5 text-amber-600" />
            Email {supplier.supplier_name}
          </DialogTitle>
          <DialogDescription>
            Sent through Gmail / Outlook / your default mail app, so it actually arrives from your address.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Card className="border-0 shadow-sm bg-slate-50">
            <CardContent className="py-3 text-xs space-y-0.5">
              <div className="flex justify-between"><span className="text-slate-500">To</span><span className="font-medium">{supplier.email || "(no email)"}</span></div>
              {supplier.contact_person && (
                <div className="flex justify-between"><span className="text-slate-500">Contact</span><span className="font-medium">{supplier.contact_person}</span></div>
              )}
              {supplier.phone && (
                <div className="flex justify-between"><span className="text-slate-500">Phone</span><span className="font-medium">{supplier.phone}</span></div>
              )}
            </CardContent>
          </Card>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Subject</label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-mono"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
            <Button
              disabled={!supplier.email}
              onClick={() => window.open(composeEmail.gmailUrl(payload), "_blank", "noopener")}
              className="gap-2 bg-gradient-to-r from-amber-600 to-orange-600 text-white"
            >
              <ExternalLink className="w-4 h-4" /> Open in Gmail
            </Button>
            <Button
              variant="outline"
              disabled={!supplier.email}
              onClick={() => window.open(composeEmail.outlookUrl(payload), "_blank", "noopener")}
              className="gap-2"
            >
              <ExternalLink className="w-4 h-4" /> Open in Outlook
            </Button>
            <Button
              variant="outline"
              disabled={!supplier.email}
              onClick={() => { window.location.href = composeEmail.mailto(payload); }}
              className="gap-2"
            >
              <Mail className="w-4 h-4" /> Default mail app
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const ok = await composeEmail.copyToClipboard(payload);
                if (ok) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                  toast({ title: "Copied to clipboard" });
                }
              }}
              className="gap-2"
            >
              <Copy className="w-4 h-4" /> {copied ? "Copied!" : "Copy"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LinkProductDialog({
  open, companyId, supplierId, onClose, onSaved,
}: {
  open: boolean;
  companyId: string;
  supplierId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [items, setItems] = useState<Array<{ id: string; item_name: string }>>([]);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string | null>(null);
  const [unitPrice, setUnitPrice] = useState("");
  const [packSize, setPackSize] = useState("");
  const [leadDays, setLeadDays] = useState("");
  const [isPreferred, setIsPreferred] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch(""); setPicked(null); setUnitPrice(""); setPackSize(""); setLeadDays(""); setIsPreferred(false);
    (async () => {
      const { data } = await supabase
        .from("inventory_items")
        .select("id, item_name")
        .eq("company_id", companyId)
        .is("deleted_at", null)
        .order("item_name");
      setItems((data || []) as any);
    })();
  }, [open, companyId]);

  const filtered = useMemo(() => {
    if (!search) return items.slice(0, 30);
    const q = search.toLowerCase();
    return items.filter((it) => it.item_name.toLowerCase().includes(q)).slice(0, 30);
  }, [items, search]);

  const save = async () => {
    if (!picked) {
      toast({ title: "Pick an inventory item first", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await supplierService.linkProduct({
        companyId,
        supplierId,
        inventoryItemId: picked,
        unit_price: unitPrice ? Number(unitPrice) : null,
        pack_size: packSize.trim() || null,
        lead_time_days: leadDays ? Number(leadDays) : null,
        is_preferred: isPreferred,
      });
      toast({ title: "Product linked" });
      onSaved();
    } catch (e: any) {
      toast({ title: "Couldn't link product", description: e?.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a product to this supplier</DialogTitle>
          <DialogDescription>
            Pick an inventory item and capture the supplier-specific pricing + lead time.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Find inventory item</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPicked(null); }}
                placeholder="e.g. Beef mince"
                className="pl-9"
              />
            </div>
            {!picked && search && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-3">No items match.</p>
                ) : filtered.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => { setPicked(it.id); setSearch(it.item_name); }}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    {it.item_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Unit price (R)</label>
              <Input type="number" inputMode="decimal" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Pack size</label>
              <Input value={packSize} onChange={(e) => setPackSize(e.target.value)} placeholder="e.g. 10kg, 6 pack" className="mt-1" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-700">Lead time (d)</label>
              <Input type="number" value={leadDays} onChange={(e) => setLeadDays(e.target.value)} className="mt-1" />
            </div>
          </div>
          <label className="text-sm flex items-center gap-2">
            <input type="checkbox" checked={isPreferred} onChange={(e) => setIsPreferred(e.target.checked)} />
            Mark as preferred supplier for this item
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving || !picked} className="bg-gradient-to-r from-amber-600 to-orange-600 text-white">
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
            Link product
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SupplierDetailPage() {
  return (
    <ProtectedRoute allowedRoles={[UserRole.SUPER_ADMIN, UserRole.COMPANY_ADMIN, UserRole.ADMIN]}>
      <SupplierDetail />
    </ProtectedRoute>
  );
}
