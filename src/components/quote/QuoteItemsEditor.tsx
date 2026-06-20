/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Menu + equipment line editor for the public quote "Request changes"
 * flow on /q/[token].
 *
 * The public quote page already holds the quote's current menu_items /
 * equipment_items (from fetchByToken), so this editor is PREFILLED with
 * them and lets the client add / remove / re-quantify lines - the same
 * add/remove experience they'd get when the quote was first built, rather
 * than describing the change in free text. It fetches the tenant's
 * catalogue (so "Add a dish / equipment" has options) from the
 * token-scoped /api/public/quotes/[token]/catalogue endpoint.
 *
 * It is a REQUEST surface, not a writer: the edited arrays are reported
 * up via onChange and submitted inside the change-request payload. The
 * caterer reviews them and sends a fresh quote, so we keep it simple -
 * explicit quantities, no per-guest auto-scaling (the caterer re-prices
 * on their side anyway).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Utensils, Package, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export type MenuLine = {
  key: string;
  menu_item_id: string | null;
  item_name: string;
  unit_price: number;
  quantity: number;
};
export type EquipLine = {
  key: string;
  equipment_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
};
type CatalogueMenu = { menu_item_id: string; item_name: string; unit_price: number; category: string | null };
type CatalogueEquip = { equipment_id: string; name: string; unit_price: number; category: string | null; available_quantity: number };

let _seq = 0;
const nextKey = () => `qk${++_seq}`;

function normaliseMenu(items: any[] | null | undefined): MenuLine[] {
  return ((items || []) as any[]).map((it) => ({
    key: nextKey(),
    menu_item_id: it.menu_item_id || it.id || null,
    item_name: it.item_name || it.name || "Item",
    unit_price: Number(it.unit_price ?? it.pricePerPerson ?? it.base_price) || 0,
    quantity: Number(it.quantity) || 0,
  }));
}
function normaliseEquip(items: any[] | null | undefined): EquipLine[] {
  return ((items || []) as any[]).map((it) => ({
    key: nextKey(),
    equipment_id: it.equipment_id || it.id || null,
    name: it.name || it.item_name || "Equipment",
    unit_price: Number(it.unit_price ?? it.rentalPrice ?? it.rental_price) || 0,
    quantity: Number(it.quantity) || 0,
  }));
}

export function QuoteItemsEditor({
  token,
  menuInit,
  equipInit,
  currencyFmt,
  primary = "#b45309",
  onChange,
}: {
  token: string;
  menuInit: any[] | null;
  equipInit: any[] | null;
  currencyFmt: (n: number) => string;
  primary?: string;
  /** Reports the current edited lines so the parent can include them in
   *  the change-request payload. */
  onChange: (menu: MenuLine[], equip: EquipLine[]) => void;
}) {
  const [menuLines, setMenuLines] = useState<MenuLine[]>(() => normaliseMenu(menuInit));
  const [equipLines, setEquipLines] = useState<EquipLine[]>(() => normaliseEquip(equipInit));
  const [menuCat, setMenuCat] = useState<CatalogueMenu[]>([]);
  const [equipCat, setEquipCat] = useState<CatalogueEquip[]>([]);
  const [catLoading, setCatLoading] = useState(true);
  const [addMenuId, setAddMenuId] = useState("");
  const [addEquipId, setAddEquipId] = useState("");

  // Load the tenant catalogue once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCatLoading(true);
      try {
        const r = await fetch(`/api/public/quotes/${token}/catalogue`);
        const d = await r.json();
        if (cancelled) return;
        if (r.ok && d?.ok) {
          setMenuCat(d.menu_catalogue || []);
          setEquipCat(d.equipment_catalogue || []);
        }
      } catch {
        /* catalogue is additive; the prefilled lines still edit fine */
      } finally {
        if (!cancelled) setCatLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  // Report edits up. Skip the very first render so we don't fire before
  // the parent has mounted its handler with stable identity.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    onChange(menuLines, equipLines);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuLines, equipLines]);

  const subtotal = useMemo(
    () =>
      menuLines.reduce((s, l) => s + l.quantity * l.unit_price, 0) +
      equipLines.reduce((s, l) => s + l.quantity * l.unit_price, 0),
    [menuLines, equipLines],
  );

  const addableMenu = menuCat.filter((c) => !menuLines.some((l) => l.menu_item_id === c.menu_item_id));
  const addableEquip = equipCat.filter((c) => !equipLines.some((l) => l.equipment_id === c.equipment_id));

  function addMenu() {
    const c = menuCat.find((m) => m.menu_item_id === addMenuId);
    if (!c) return;
    setMenuLines((l) => [...l, { key: nextKey(), menu_item_id: c.menu_item_id, item_name: c.item_name, unit_price: c.unit_price, quantity: 1 }]);
    setAddMenuId("");
  }
  function addEquip() {
    const c = equipCat.find((e) => e.equipment_id === addEquipId);
    if (!c) return;
    setEquipLines((l) => [...l, { key: nextKey(), equipment_id: c.equipment_id, name: c.name, unit_price: c.unit_price, quantity: 1 }]);
    setAddEquipId("");
  }

  return (
    <div className="space-y-4 rounded-lg border border-stone-200 bg-stone-50/60 p-3">
      {/* Menu */}
      <section>
        <div className="flex items-center gap-2 text-xs font-semibold text-stone-800 mb-2">
          <Utensils className="w-3.5 h-3.5" style={{ color: primary }} /> Menu items
        </div>
        <div className="space-y-1.5">
          {menuLines.map((l) => (
            <div key={l.key} className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{l.item_name}</p>
                <p className="text-[11px] text-stone-500">{currencyFmt(l.unit_price)} each · {currencyFmt(l.quantity * l.unit_price)}</p>
              </div>
              <input
                type="number"
                min={0}
                value={l.quantity || ""}
                onChange={(e) => setMenuLines((lines) => lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(0, Number(e.target.value) || 0) } : x)))}
                className="w-16 px-2 py-1 rounded-md border border-stone-300 text-sm text-center"
                aria-label={`Quantity for ${l.item_name}`}
              />
              <button type="button" onClick={() => setMenuLines((lines) => lines.filter((x) => x.key !== l.key))} className="p-1.5 text-stone-400 hover:text-rose-600" aria-label={`Remove ${l.item_name}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {menuLines.length === 0 && <p className="text-[11px] text-stone-400">No menu items - add one below.</p>}
        </div>
        {catLoading ? (
          <p className="text-[11px] text-stone-400 mt-2 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Loading options...</p>
        ) : addableMenu.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <select value={addMenuId} onChange={(e) => setAddMenuId(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white">
              <option value="">Add a dish...</option>
              {addableMenu.map((c) => (
                <option key={c.menu_item_id} value={c.menu_item_id}>{c.item_name} - {currencyFmt(c.unit_price)}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={addMenu} disabled={!addMenuId} className="shrink-0">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </section>

      {/* Equipment */}
      <section>
        <div className="flex items-center gap-2 text-xs font-semibold text-stone-800 mb-2">
          <Package className="w-3.5 h-3.5" style={{ color: primary }} /> Equipment
        </div>
        <div className="space-y-1.5">
          {equipLines.map((l) => (
            <div key={l.key} className="flex items-center gap-2 rounded-md border border-stone-200 bg-white px-2.5 py-1.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-stone-900 truncate">{l.name}</p>
                <p className="text-[11px] text-stone-500">{currencyFmt(l.unit_price)} each · {currencyFmt(l.quantity * l.unit_price)}</p>
              </div>
              <input
                type="number"
                min={0}
                value={l.quantity || ""}
                onChange={(e) => setEquipLines((lines) => lines.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(0, Number(e.target.value) || 0) } : x)))}
                className="w-16 px-2 py-1 rounded-md border border-stone-300 text-sm text-center"
                aria-label={`Quantity for ${l.name}`}
              />
              <button type="button" onClick={() => setEquipLines((lines) => lines.filter((x) => x.key !== l.key))} className="p-1.5 text-stone-400 hover:text-rose-600" aria-label={`Remove ${l.name}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {equipLines.length === 0 && <p className="text-[11px] text-stone-400">No equipment.</p>}
        </div>
        {!catLoading && addableEquip.length > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <select value={addEquipId} onChange={(e) => setAddEquipId(e.target.value)} className="flex-1 px-2.5 py-1.5 rounded-md border border-stone-300 text-sm bg-white">
              <option value="">Add equipment...</option>
              {addableEquip.map((c) => (
                <option key={c.equipment_id} value={c.equipment_id}>{c.name} - {currencyFmt(c.unit_price)}</option>
              ))}
            </select>
            <Button type="button" variant="outline" size="sm" onClick={addEquip} disabled={!addEquipId} className="shrink-0">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between border-t border-stone-200 pt-2 text-sm">
        <span className="text-stone-600">Your selection subtotal</span>
        <span className="font-semibold text-stone-900 tabular-nums">{currencyFmt(subtotal)}</span>
      </div>
      <p className="text-[11px] text-stone-400 leading-snug">
        This is an estimate of your picks. The caterer confirms the final price when they send the updated quote.
      </p>
    </div>
  );
}
