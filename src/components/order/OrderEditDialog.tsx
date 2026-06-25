/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Client-facing order editor (magic-link surface).
 *
 * Wave 33: the /c/order page only let a client change guest count + leave
 * a note. This dialog lets them edit the things they edit at order time -
 * menu items (add / remove / qty), equipment, guest count, venue, delivery
 * time and special instructions - then submits the whole lot as a single
 * `proposed_changes` payload to /api/client-tokens/amend-order. The caterer
 * still APPROVES it (the existing amendment cascade recomputes money,
 * regenerates the quote/invoice, resyncs kitchen/driver/shopping and
 * notifies everyone), so this is a richer REQUEST, not a direct write.
 *
 * Consistency rule: what the client sees here must equal what the approve
 * cascade computes. So we submit EXPLICIT quantities (pricing_mode
 * "per_portion") for every line the client pinned, and only keep the
 * "per guest" auto-scaling lines as pricing_mode "per_person" (quantity 0)
 * when their qty still equals the live guest count - in which case the two
 * are numerically identical anyway.
 */
import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X, Users, MapPin, Clock, Utensils, Package } from "lucide-react";
import { Button } from "@/components/ui/button";

type MenuLine = {
  key: string;
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
  perGuest: boolean;
};
type EquipLine = {
  key: string;
  equipment_id: string;
  name: string;
  unit_price: number;
  quantity: number;
};
type CatalogueMenu = { menu_item_id: string; item_name: string; unit_price: number; category: string | null };
type CatalogueEquip = { equipment_id: string; name: string; unit_price: number; category: string | null; available_quantity: number };

let _seq = 0;
const nextKey = () => `k${++_seq}`;

export function OrderEditDialog({
  open,
  onOpenChange,
  orderId,
  primary = "#9333ea",
  secondary = "#ec4899",
  onSubmitted,
  dataUrl,
  submitUrl = "/api/client-tokens/amend-order",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string;
  primary?: string;
  secondary?: string;
  onSubmitted?: () => void;
  /** Where to load catalogue + current lines. Defaults to the magic-link
   *  (per-order cookie) endpoint; the authed portal passes the session
   *  endpoint /api/orders/{id}/edit-data. */
  dataUrl?: string;
  /** Where to submit the amendment. Magic-link uses amend-order (default);
   *  the authed portal uses /api/orders/amendment-request. */
  submitUrl?: string;
}) {
  const resolvedDataUrl = dataUrl || "/api/client-tokens/order-edit-data";
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [currency, setCurrency] = useState("ZAR");
  const [deliveryFee, setDeliveryFee] = useState(0);
  const [orderTotal, setOrderTotal] = useState(0);
  const [baselineMenuSum, setBaselineMenuSum] = useState(0);
  const [taxRate, setTaxRate] = useState(0.15);

  const [guestCount, setGuestCount] = useState(0);
  const [menuLines, setMenuLines] = useState<MenuLine[]>([]);
  const [equipLines, setEquipLines] = useState<EquipLine[]>([]);
  const [venueAddress, setVenueAddress] = useState("");
  const [deliveryTime, setDeliveryTime] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const [menuCat, setMenuCat] = useState<CatalogueMenu[]>([]);
  const [equipCat, setEquipCat] = useState<CatalogueEquip[]>([]);
  const [addMenuId, setAddMenuId] = useState("");
  const [addEquipId, setAddEquipId] = useState("");

  // Load editor data when opened.
  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      setMsg(null);
      try {
        const r = await fetch(resolvedDataUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_id: orderId }),
        });
        const d = await r.json();
        if (!r.ok || !d?.ok) throw new Error(d?.error || `Could not load (${r.status})`);
        if (cancelled) return;
        const guests = Number(d.guest_count) || 0;
        setCurrency(d.currency || "ZAR");
        setDeliveryFee(Number(d.delivery_fee) || 0);
        setOrderTotal(Number(d.order_total) || 0);
        setTaxRate(Number(d.tax_rate) || 0.15);
        setGuestCount(guests);
        setMenuCat(d.menu_catalogue || []);
        setEquipCat(d.equipment_catalogue || []);
        const cm: MenuLine[] = (d.current_menu || []).map((it: any) => ({
          key: nextKey(),
          menu_item_id: it.menu_item_id || null,
          item_name: it.item_name,
          unit_price: Number(it.unit_price) || 0,
          quantity: Number(it.quantity) || 0,
          // Heuristic: a line whose qty equals the guest count is a
          // per-head dish; pin everything else (flat charges, fixed kit).
          perGuest: guests > 0 && Number(it.quantity) === guests,
        }));
        setMenuLines(cm);
        setBaselineMenuSum(
          (d.current_menu || []).reduce(
            (s: number, it: any) => s + (Number(it.line_total) || Number(it.quantity) * Number(it.unit_price) || 0),
            0,
          ),
        );
        setEquipLines(
          (d.current_equipment || []).map((it: any) => ({
            key: nextKey(),
            equipment_id: it.equipment_id,
            name: it.name,
            unit_price: Number(it.unit_price) || 0,
            quantity: Number(it.quantity) || 0,
          })),
        );
      } catch (e: any) {
        if (!cancelled) setLoadErr(e?.message || "Could not load your order");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  // When guest count changes, re-scale the per-guest menu lines so the
  // preview tracks the headcount.
  function changeGuests(next: number) {
    const g = Math.max(0, Math.floor(next || 0));
    setGuestCount(g);
    setMenuLines((lines) => lines.map((l) => (l.perGuest ? { ...l, quantity: g } : l)));
  }

  const effMenuQty = (l: MenuLine) => (l.perGuest ? guestCount : l.quantity);
  const newMenuSum = useMemo(
    () => menuLines.reduce((s, l) => s + effMenuQty(l) * l.unit_price, 0),
    [menuLines, guestCount],
  );

  // Self-calibrating estimate: scale the current authoritative total by the
  // change in menu sum, so it starts exactly at order_total and moves with
  // edits regardless of the tenant's VAT-inclusive/exclusive convention.
  const ratio = useMemo(() => {
    const base = baselineMenuSum + deliveryFee;
    if (base > 0 && orderTotal > 0) return orderTotal / base;
    return 1 + taxRate;
  }, [baselineMenuSum, deliveryFee, orderTotal, taxRate]);
  const estTotal = (newMenuSum + deliveryFee) * ratio;
  const delta = estTotal - orderTotal;

  const fmt = useMemo(
    () => new Intl.NumberFormat("en-ZA", { style: "currency", currency, maximumFractionDigits: 0 }),
    [currency],
  );

  function addMenu() {
    const c = menuCat.find((m) => m.menu_item_id === addMenuId);
    if (!c) return;
    setMenuLines((l) => [
      ...l,
      { key: nextKey(), menu_item_id: c.menu_item_id, item_name: c.item_name, unit_price: c.unit_price, quantity: guestCount || 1, perGuest: true },
    ]);
    setAddMenuId("");
  }
  function addEquip() {
    const c = equipCat.find((e) => e.equipment_id === addEquipId);
    if (!c) return;
    setEquipLines((l) => [
      ...l,
      { key: nextKey(), equipment_id: c.equipment_id, name: c.name, unit_price: c.unit_price, quantity: 1 },
    ]);
    setAddEquipId("");
  }

  async function submit() {
    setBusy(true);
    setMsg(null);
    try {
      // Build menu_items: per-guest lines still pinned to the live guest
      // count go as per_person/0 (cascade re-scales identically); anything
      // else goes as an explicit-quantity per_portion line so the approve
      // cascade reproduces exactly what the client saw here.
      const menu_items = menuLines
        .filter((l) => effMenuQty(l) > 0)
        .map((l) => {
          if (l.perGuest && l.quantity === guestCount) {
            return { menu_item_id: l.menu_item_id, item_name: l.item_name, unit_price: l.unit_price, pricing_mode: "per_person", quantity: 0 };
          }
          return { menu_item_id: l.menu_item_id, item_name: l.item_name, unit_price: l.unit_price, pricing_mode: "per_portion", quantity: l.quantity };
        });
      const equipment_items = equipLines
        .filter((l) => l.quantity > 0)
        .map((l) => ({ equipment_id: l.equipment_id, name: l.name, unit_price: l.unit_price, quantity: l.quantity }));

      const proposed_changes: Record<string, any> = {
        guest_count: guestCount,
        menu_items,
        equipment_items,
      };
      if (venueAddress.trim()) proposed_changes.venue_address = venueAddress.trim();
      if (deliveryTime.trim()) proposed_changes.delivery_time = deliveryTime.trim();
      if (specialInstructions.trim()) proposed_changes.special_instructions = specialInstructions.trim();

      const r = await fetch(submitUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: orderId, proposed_changes }),
      });
      const d = await r.json();
      if (!r.ok || !d?.ok) {
        setMsg({ tone: "err", text: d?.error || `Request failed (${r.status})` });
        return;
      }
      setMsg({ tone: "ok", text: "Sent. The caterer will review your changes and confirm the final price by email." });
      onSubmitted?.();
    } catch (e: any) {
      setMsg({ tone: "err", text: e?.message || "Try again" });
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  const addableMenu = menuCat.filter((c) => !menuLines.some((l) => l.menu_item_id === c.menu_item_id));
  const addableEquip = equipCat.filter((c) => !equipLines.some((l) => l.equipment_id === c.equipment_id));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-2xl sm:rounded-2xl shadow-2xl max-h-[100dvh] sm:max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 text-white flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}>
          <div>
            <p className="text-xs uppercase tracking-wide text-white/70">Request changes</p>
            <h2 className="text-lg font-bold">Edit your order</h2>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-white/20" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-slate-400" />
          </div>
        ) : loadErr ? (
          <div className="flex-1 flex items-center justify-center py-20 px-6 text-center text-sm text-rose-600">{loadErr}</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {/* Guests */}
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                  <Users className="w-4 h-4" style={{ color: primary }} /> Guests
                </div>
                <input
                  type="number"
                  min={1}
                  value={guestCount || ""}
                  onChange={(e) => changeGuests(Number(e.target.value))}
                  className="w-32 px-3 py-2 rounded-md border border-slate-300 text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">Per-guest dishes update automatically when you change this.</p>
              </section>

              {/* Menu */}
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                  <Utensils className="w-4 h-4" style={{ color: primary }} /> Menu
                </div>
                <div className="space-y-2">
                  {menuLines.map((l) => (
                    <div key={l.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{l.item_name}</p>
                        <p className="text-xs text-slate-500">{fmt.format(l.unit_price)} each · {fmt.format(effMenuQty(l) * l.unit_price)}</p>
                      </div>
                      <label className="flex items-center gap-1 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={l.perGuest}
                          onChange={(e) =>
                            setMenuLines((lines) =>
                              lines.map((x) => (x.key === l.key ? { ...x, perGuest: e.target.checked, quantity: e.target.checked ? guestCount : x.quantity } : x)),
                            )
                          }
                        />
                        per guest
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={effMenuQty(l) || ""}
                        disabled={l.perGuest}
                        onChange={(e) =>
                          setMenuLines((lines) => lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(0, Number(e.target.value) || 0) } : x)))
                        }
                        className="w-16 px-2 py-1.5 rounded-md border border-slate-300 text-sm text-center disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <button onClick={() => setMenuLines((lines) => lines.filter((x) => x.key !== l.key))} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {menuLines.length === 0 && <p className="text-xs text-slate-400">No menu items.</p>}
                </div>
                {addableMenu.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <select value={addMenuId} onChange={(e) => setAddMenuId(e.target.value)} className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm bg-white">
                      <option value="">Add a dish...</option>
                      {addableMenu.map((c) => (
                        <option key={c.menu_item_id} value={c.menu_item_id}>
                          {c.item_name} — {fmt.format(c.unit_price)}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" onClick={addMenu} disabled={!addMenuId} className="shrink-0">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </section>

              {/* Equipment */}
              <section>
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-2">
                  <Package className="w-4 h-4" style={{ color: primary }} /> Equipment
                </div>
                <div className="space-y-2">
                  {equipLines.map((l) => (
                    <div key={l.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{l.name}</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        value={l.quantity || ""}
                        onChange={(e) => setEquipLines((lines) => lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(0, Number(e.target.value) || 0) } : x)))}
                        className="w-16 px-2 py-1.5 rounded-md border border-slate-300 text-sm text-center"
                      />
                      <button onClick={() => setEquipLines((lines) => lines.filter((x) => x.key !== l.key))} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {equipLines.length === 0 && <p className="text-xs text-slate-400">No equipment.</p>}
                </div>
                {addableEquip.length > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <select value={addEquipId} onChange={(e) => setAddEquipId(e.target.value)} className="flex-1 px-3 py-2 rounded-md border border-slate-300 text-sm bg-white">
                      <option value="">Add equipment...</option>
                      {addableEquip.map((c) => (
                        <option key={c.equipment_id} value={c.equipment_id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <Button type="button" variant="outline" onClick={addEquip} disabled={!addEquipId} className="shrink-0">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </section>

              {/* Logistics */}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <MapPin className="w-4 h-4" style={{ color: primary }} /> Venue &amp; timing
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">New venue address (leave blank to keep)</label>
                  <input value={venueAddress} onChange={(e) => setVenueAddress(e.target.value)} placeholder="Only if the venue is changing" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1"><Clock className="w-3 h-3 inline mr-1" />New delivery / setup time (leave blank to keep)</label>
                  <input value={deliveryTime} onChange={(e) => setDeliveryTime(e.target.value)} placeholder="e.g. 14:00" className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 block mb-1">Special instructions / notes for the team</label>
                  <textarea rows={2} value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} placeholder="Allergies, plating, access notes..." className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm" />
                </div>
              </section>
            </div>

            {/* Footer: live estimate + submit */}
            <div className="border-t border-slate-200 px-5 py-4 bg-white space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600">Estimated new total</span>
                <span className="font-bold text-slate-900 tabular-nums">{fmt.format(estTotal)}</span>
              </div>
              {Math.abs(delta) >= 1 && (
                <div className={`flex items-center justify-between text-xs ${delta > 0 ? "text-amber-700" : "text-brand-primary"}`}>
                  <span>{delta > 0 ? "Increase" : "Decrease"} vs current ({fmt.format(orderTotal)})</span>
                  <span className="font-semibold tabular-nums">{delta > 0 ? "+" : "-"}{fmt.format(Math.abs(delta))}</span>
                </div>
              )}
              <p className="text-[11px] text-slate-400 leading-snug">Estimate only. Your caterer confirms the final price when they approve these changes, and you&apos;ll get an email with the updated order.</p>
              {msg && <p className={`text-xs ${msg.tone === "ok" ? "text-brand-primary" : "text-rose-700"}`}>{msg.text}</p>}
              <Button
                onClick={submit}
                disabled={busy || msg?.tone === "ok"}
                className="w-full text-white"
                style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)` }}
              >
                {busy ? "Sending..." : msg?.tone === "ok" ? "Sent ✓" : "Send change request"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
