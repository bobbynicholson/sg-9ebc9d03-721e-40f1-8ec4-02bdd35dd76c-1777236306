import { buildRequestedSittingPlan, parseRequestedDeliveryLocations } from "@/lib/requestedDeliveryLocations";

describe("parseRequestedDeliveryLocations", () => {
  it("reads named and unnamed locations from enquiry notes", () => {
    expect(parseRequestedDeliveryLocations(
      "Client note\n\nRequested delivery locations:\n1. Cape Town office — 39 Salt River Road\n   Guests: 45\n   Service time: 17:00\n2. Cape of Good Hope, Cape Town\n   Guests: 45\n\nOther details from the form:\nEating time: 17:00",
    )).toEqual([
      { venueName: "Cape Town office", venueAddress: "39 Salt River Road", guestCount: 45, serviceTime: "17:00" },
      { venueName: "", venueAddress: "Cape of Good Hope, Cape Town", guestCount: 45, serviceTime: null },
    ]);
  });

  it("limits imported requests to the 12 locations the quote supports", () => {
    const notes = `Requested delivery locations:\n${Array.from({ length: 13 }, (_, i) => `${i + 1}. Site ${i + 1}, Cape Town`).join("\n")}`;
    expect(parseRequestedDeliveryLocations(notes)).toHaveLength(12);
    expect(parseRequestedDeliveryLocations(null)).toEqual([]);
  });

  it("fills the primary venue with the remaining guests and inherits its time", () => {
    const result = buildRequestedSittingPlan({
      totalGuests: 90,
      mainVenueAddress: "39 Salt River Road",
      mainServiceTime: "17:00",
      locations: [{ venueName: "Peninsula office", venueAddress: "Cape of Good Hope", guestCount: 45, serviceTime: "18:00" }],
    });
    expect(result).toEqual({
      ok: true,
      primaryVenueAddress: "39 Salt River Road",
      sittings: [
        { guestCount: 45, serviceTime: "17:00", venueName: null, venueAddress: null },
        { guestCount: 45, serviceTime: "18:00", venueName: "Peninsula office", venueAddress: "Cape of Good Hope" },
      ],
    });
  });

  it("uses the first requested location as primary and rejects a mismatched total", () => {
    const location = { venueName: "Office 1", venueAddress: "Office 1 address", guestCount: 30, serviceTime: null };
    expect(buildRequestedSittingPlan({ totalGuests: 60, locations: [location] })).toMatchObject({
      ok: false,
      error: "Location guest counts must add up to 60.",
    });
    expect(buildRequestedSittingPlan({ totalGuests: 30, locations: [location] })).toMatchObject({
      ok: true,
      primaryVenueAddress: "Office 1 address",
      sittings: [{ guestCount: 30, venueAddress: null }],
    });
  });
});
