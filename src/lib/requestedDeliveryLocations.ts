export type RequestedDeliveryLocation = {
  venueName: string;
  venueAddress: string;
  guestCount: number | null;
  serviceTime: string | null;
};

export type RequestedSittingDraft = {
  guestCount: number;
  serviceTime: string;
  venueName: string | null;
  /** null means inherit the booking's primary venue address. */
  venueAddress: string | null;
};

/** Read repeatable locations and optional sitting details from enquiry notes. */
export function parseRequestedDeliveryLocations(notes: unknown): RequestedDeliveryLocation[] {
  if (typeof notes !== "string") return [];
  const locations: RequestedDeliveryLocation[] = [];
  const sections = [...notes.matchAll(/Requested delivery locations:\s*([\s\S]*?)(?:\r?\n\s*\r?\n|$)/gi)];
  for (const section of sections) {
    for (const line of section[1].split(/\r?\n/)) {
      const numbered = line.match(/^\s*\d+\.\s+(.+?)\s*$/);
      if (numbered) {
        const value = numbered[1];
        const separator = value.indexOf(" — ");
        const venueName = separator >= 0 ? value.slice(0, separator).trim() : "";
        const venueAddress = (separator >= 0 ? value.slice(separator + 3) : value).trim();
        if (venueAddress) locations.push({ venueName, venueAddress, guestCount: null, serviceTime: null });
        continue;
      }

      const last = locations[locations.length - 1];
      if (!last) continue;
      const guests = line.match(/^\s*Guests:\s*(\d+)\s*$/i);
      if (guests) {
        const count = Number(guests[1]);
        last.guestCount = Number.isSafeInteger(count) && count > 0 ? count : null;
        continue;
      }
      const serviceTime = line.match(/^\s*Service time:\s*((?:[01]\d|2[0-3]):[0-5]\d)\s*$/i);
      if (serviceTime) last.serviceTime = serviceTime[1];
    }
  }
  return locations.slice(0, 12);
}

/** Build an editable sitting draft from the client's requested plan. */
export function buildRequestedSittingPlan(input: {
  totalGuests: number;
  mainVenueAddress?: string | null;
  mainServiceTime?: string | null;
  locations: RequestedDeliveryLocation[];
}): { ok: true; primaryVenueAddress: string; sittings: RequestedSittingDraft[] } | { ok: false; error: string } {
  const mainAddress = String(input.mainVenueAddress || "").trim();
  const hasMainVenue = !!mainAddress;
  const requested = input.locations.filter(location => location.venueAddress.trim());
  const primaryVenueAddress = mainAddress || requested[0]?.venueAddress.trim() || "";
  const rows = hasMainVenue
    ? [{ venueName: "", venueAddress: mainAddress, guestCount: null, serviceTime: input.mainServiceTime || null }, ...requested]
    : requested;

  if (!rows.length || !primaryVenueAddress) return { ok: false, error: "Add a primary venue or at least one requested location first." };
  if (rows.length > 12) return { ok: false, error: "A booking can include up to 12 sitting locations." };
  if (!Number.isInteger(input.totalGuests) || input.totalGuests < rows.length) {
    return { ok: false, error: `At least ${rows.length} guests are needed to put guests at every location.` };
  }

  const counts = rows.map(row => Number.isInteger(row.guestCount) && Number(row.guestCount) > 0 ? Number(row.guestCount) : null);
  const knownTotal = counts.reduce<number>((sum, count) => sum + (count || 0), 0);
  if (knownTotal > input.totalGuests) {
    return { ok: false, error: `The requested location guest counts exceed the booking total of ${input.totalGuests}.` };
  }

  const missing = counts.flatMap((count, index) => count == null ? [index] : []);
  const remaining = input.totalGuests - knownTotal;
  if (!missing.length && remaining !== 0) {
    return { ok: false, error: `Location guest counts must add up to ${input.totalGuests}.` };
  }
  if (missing.length && remaining < missing.length) {
    return { ok: false, error: "There are not enough unallocated guests to put at least one guest at each remaining location." };
  }
  if (missing.length) {
    const each = Math.floor(remaining / missing.length);
    let extras = remaining % missing.length;
    for (const index of missing) {
      counts[index] = each + (extras > 0 ? 1 : 0);
      if (extras > 0) extras -= 1;
    }
  }

  const defaultTime = String(input.mainServiceTime || "").slice(0, 5);
  return {
    ok: true,
    primaryVenueAddress,
    sittings: rows.map((location, index) => ({
      guestCount: counts[index] || 0,
      serviceTime: String(location.serviceTime || defaultTime).slice(0, 5),
      venueName: location.venueName.trim() || null,
      venueAddress: index === 0 ? null : location.venueAddress.trim(),
    })),
  };
}
