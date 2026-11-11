import { effectiveSittingVenue, normaliseServiceSittings } from "@/lib/serviceSittings";

test("normalizes separate sitting addresses without changing guest allocations", () => {
  const result = normaliseServiceSittings([
    { guestCount: 20, serviceTime: "11:00", venueName: "Office A", venueAddress: "10 Main Road", venueLat: -33.92, venueLng: 18.42 },
    { guestCount: 35, serviceTime: "12:00", venueName: "Office B", venueAddress: "20 Loop Street", venueLat: -33.91, venueLng: 18.43 },
    { guestCount: 45, serviceTime: "13:00", venueName: "Office C", venueAddress: "30 Long Street" },
  ], 100);

  expect(result.error).toBeUndefined();
  expect(result.value?.map(row => [row.guestCount, row.venueName, row.venueAddress])).toEqual([
    [20, "Office A", "10 Main Road"],
    [35, "Office B", "20 Loop Street"],
    [45, "Office C", "30 Long Street"],
  ]);
  expect(result.value?.reduce((sum, row) => sum + row.guestCount, 0)).toBe(100);
});

test("legacy sittings inherit their parent venue while explicit locations override it", () => {
  const parent = { venue_name: "Head Office", venue_address: "1 Main Road", venue_lat: -33.92, venue_lng: 18.42 };
  expect(effectiveSittingVenue({ venue_address: null, venue_lat: null, venue_lng: null }, parent)).toEqual({
    venueName: "Head Office", venueAddress: "1 Main Road", venueLat: -33.92, venueLng: 18.42,
  });
  expect(effectiveSittingVenue({ venue_name: null, venue_address: "2 Loop Street", venue_lat: -33.91, venue_lng: 18.43 }, parent)).toEqual({
    venueName: "Head Office", venueAddress: "2 Loop Street", venueLat: -33.91, venueLng: 18.43,
  });
});

test("rejects incomplete or out-of-range sitting map coordinates", () => {
  expect(normaliseServiceSittings([{ guestCount: 20, serviceTime: "11:00", venueAddress: "Address", venueLat: -33.92 }], 20).error).toMatch(/map location/i);
  expect(normaliseServiceSittings([{ guestCount: 20, serviceTime: "11:00", venueAddress: "Address", venueLat: 120, venueLng: 18.42 }], 20).error).toMatch(/map location/i);
});
