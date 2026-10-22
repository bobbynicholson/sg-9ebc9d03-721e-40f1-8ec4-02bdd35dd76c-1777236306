export type ServiceSittingInput = {
  guestCount: number;
  serviceTime: string;
  kitchenReadyTime?: string | null;
  dispatchTime?: string | null;
  cleaningResetRequired?: boolean;
  returnRequired?: boolean;
  returnTime?: string | null;
};

const validTime = (value: unknown) => typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

export function normaliseServiceSittings(raw: unknown, totalGuests: number): { value?: ServiceSittingInput[]; error?: string } {
  if (raw == null) return {};
  if (!Number.isSafeInteger(totalGuests) || totalGuests < 1) return { error: "Choose a valid total guest count before setting serving times." };
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return { error: "Choose between one and twelve service sittings." };
  const value: ServiceSittingInput[] = [];
  for (const item of raw) {
    const guestCount = Number(item?.guestCount);
    if (!Number.isSafeInteger(guestCount) || guestCount < 1) return { error: "Every sitting needs a valid guest count." };
    if (!validTime(item?.serviceTime)) return { error: "Every sitting needs a valid service time." };
    for (const key of ["kitchenReadyTime", "dispatchTime", "returnTime"] as const) {
      if (item?.[key] != null && item[key] !== "" && !validTime(item[key])) return { error: "Use a valid time for each operational deadline." };
    }
    value.push({ guestCount, serviceTime: item.serviceTime, kitchenReadyTime: item.kitchenReadyTime || null, dispatchTime: item.dispatchTime || null, cleaningResetRequired: !!item.cleaningResetRequired, returnRequired: !!item.returnRequired, returnTime: item.returnTime || null });
  }
  if (value.reduce((sum, s) => sum + s.guestCount, 0) !== Math.round(Number(totalGuests))) return { error: `Sitting guest counts must total ${totalGuests}.` };
  return { value };
}

export type ServiceSittingsForm = { count: 1 | 2; firstGuests: number; firstTime: string; secondTime: string };

export function serviceSittingsFormFromSaved(
  sittings: Array<{ sequence_number: number; guest_count: number; service_time: string }> | undefined,
  eventTime: string | null | undefined,
  totalGuests: number,
): ServiceSittingsForm {
  const saved = [...(sittings || [])].sort((a, b) => a.sequence_number - b.sequence_number);
  return {
    count: saved.length === 2 ? 2 : 1,
    firstGuests: saved[0]?.guest_count || Math.ceil(totalGuests / 2),
    firstTime: String(saved[0]?.service_time || eventTime || "").slice(0, 5),
    secondTime: String(saved[1]?.service_time || "").slice(0, 5),
  };
}

export function serviceSittingsFromForm(form: ServiceSittingsForm, totalGuests: number) {
  return normaliseServiceSittings([
    { guestCount: form.count === 2 ? form.firstGuests : totalGuests, serviceTime: form.firstTime },
    ...(form.count === 2 ? [{ guestCount: totalGuests - form.firstGuests, serviceTime: form.secondTime }] : []),
  ], totalGuests);
}

export function describeServiceSittings(sittings: Array<{ guestCount: number; serviceTime: string }>): string {
  return sittings.map((s, index) => `Sitting ${index + 1}: ${s.guestCount} guests at ${s.serviceTime}`).join("; ");
}

/** Proportional kitchen portions without inventing extra meals. Whole
 *  quantities stay whole; fractional quantities retain two decimals. */
export function allocateSittingQuantities(quantity: number, guests: number[]): number[] {
  const total = guests.reduce((sum, count) => sum + count, 0);
  if (!(quantity > 0) || !(total > 0)) return guests.map(() => 0);
  const scale = Number.isInteger(quantity) ? 1 : 100;
  const units = Math.round(quantity * scale);
  const shares = guests.map((count, index) => ({ index, exact: units * count / total }));
  const allocated = shares.map(({ exact }) => Math.floor(exact));
  let remainder = units - allocated.reduce((sum, count) => sum + count, 0);
  for (const share of [...shares].sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.index - b.index)) {
    if (remainder-- <= 0) break;
    allocated[share.index] += 1;
  }
  return allocated.map((count) => count / scale);
}
