import { isManualEftAvailable } from "@/lib/publicPaymentOptions";

test("an active online provider suppresses EFT even when bank details exist", () => {
  expect(isManualEftAvailable(true, true)).toBe(false);
});

test("manual EFT remains available when online checkout is unavailable and bank details exist", () => {
  expect(isManualEftAvailable(false, true)).toBe(true);
});

test("EFT stays unavailable when bank details are missing", () => {
  expect(isManualEftAvailable(false, false)).toBe(false);
});
