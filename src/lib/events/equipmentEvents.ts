/**
 * equipmentEvents - CLN2-I
 *
 * Why: when a cleaner flags damaged equipment, the kitchen
 * dashboard's readiness chip (KIT2-O) reads off cleaning_jobs
 * rolled up by tomorrow's orders. A new equipment_damages row
 * doesn't fire the cleaning_jobs realtime sub - the chip would
 * stay stale until the next focus / poll. This in-browser event
 * lets DamageFlagForm ping every surface that cares so they
 * refetch immediately. Mirrors orderEvents.ts.
 */
export const EQUIPMENT_DAMAGED_EVENT = "cateringms:equipment-damaged";

export interface EquipmentDamagedDetail {
  equipmentId: string;
  damageType: "broken" | "lost" | "stolen" | "damaged";
  quantity: number;
  orderId?: string;
  source: string;
}

export function emitEquipmentDamaged(detail: EquipmentDamagedDetail) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<EquipmentDamagedDetail>(EQUIPMENT_DAMAGED_EVENT, { detail }));
  } catch {
    // Best-effort broadcast - never block on emit failure.
  }
}

export function onEquipmentDamaged(handler: (detail: EquipmentDamagedDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const wrapped = (e: Event) => {
    const detail = (e as CustomEvent<EquipmentDamagedDetail>).detail;
    if (!detail) return;
    handler(detail);
  };
  window.addEventListener(EQUIPMENT_DAMAGED_EVENT, wrapped);
  return () => window.removeEventListener(EQUIPMENT_DAMAGED_EVENT, wrapped);
}
