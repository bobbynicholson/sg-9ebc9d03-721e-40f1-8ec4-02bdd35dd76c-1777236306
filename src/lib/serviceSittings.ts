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
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 12) return { error: "Choose between one and twelve service sittings." };
  const value: ServiceSittingInput[] = [];
  for (const item of raw) {
    const guestCount = Math.round(Number(item?.guestCount));
    if (!Number.isFinite(guestCount) || guestCount < 1) return { error: "Every sitting needs a valid guest count." };
    if (!validTime(item?.serviceTime)) return { error: "Every sitting needs a valid service time." };
    for (const key of ["kitchenReadyTime", "dispatchTime", "returnTime"] as const) {
      if (item?.[key] != null && item[key] !== "" && !validTime(item[key])) return { error: "Use a valid time for each operational deadline." };
    }
    value.push({ guestCount, serviceTime: item.serviceTime, kitchenReadyTime: item.kitchenReadyTime || null, dispatchTime: item.dispatchTime || null, cleaningResetRequired: !!item.cleaningResetRequired, returnRequired: !!item.returnRequired, returnTime: item.returnTime || null });
  }
  if (value.reduce((sum, s) => sum + s.guestCount, 0) !== Math.round(Number(totalGuests))) return { error: `Sitting guest counts must total ${totalGuests}.` };
  return { value };
}
