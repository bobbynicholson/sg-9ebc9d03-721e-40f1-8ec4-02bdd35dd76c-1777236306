import {
  recipeBatchesForOrderLine,
  recipeCostPerSoldUnit,
} from "@/lib/recipeScaling";

describe("recipe scaling for order lines", () => {
  // Callum Pics 93/94: 1 x Lamb Spit (on-site), recipe base 25 servings,
  // 1 whole lamb + 1 sauce per batch. The shortfall list showed 0.04.
  it("treats one package unit as one full recipe batch", () => {
    expect(
      recipeBatchesForOrderLine({ orderQuantity: 1, baseServings: 25, soldAsPackage: true }),
    ).toBe(1);
    expect(
      recipeBatchesForOrderLine({ orderQuantity: 2, baseServings: 25, soldAsPackage: true }),
    ).toBe(2);
  });

  it("scales per-serving items by base servings (whipped cream stays 0.75)", () => {
    // 12 desserts, 2-serving recipe, 0.125 cream per batch = 0.75 units.
    const batches = recipeBatchesForOrderLine({ orderQuantity: 12, baseServings: 2 });
    expect(batches * 0.125).toBeCloseTo(0.75);
    // Baby potatoes: 12 servings from a 10-serving batch = 1.2 batches.
    expect(recipeBatchesForOrderLine({ orderQuantity: 12, baseServings: 10 })).toBeCloseTo(1.2);
  });

  it("degrades safely on missing or zero base servings", () => {
    expect(recipeBatchesForOrderLine({ orderQuantity: 3, baseServings: 0 })).toBe(3);
    expect(recipeBatchesForOrderLine({ orderQuantity: 3, baseServings: null })).toBe(3);
    expect(recipeBatchesForOrderLine({ orderQuantity: 0, baseServings: 10 })).toBe(0);
    expect(recipeBatchesForOrderLine({ orderQuantity: Number.NaN, baseServings: 10 })).toBe(0);
  });

  // Callum Pics 95/96: base_price 4750 is for the whole package, so the
  // margin preview must compare it against the whole-batch recipe cost,
  // not cost/25.
  it("uses the whole-batch cost for package items and per-serving otherwise", () => {
    expect(
      recipeCostPerSoldUnit({ totalCost: 3640, costPerServing: 145.6, soldAsPackage: true }),
    ).toBe(3640);
    expect(
      recipeCostPerSoldUnit({ totalCost: 42, costPerServing: 21, soldAsPackage: false }),
    ).toBe(21);
  });
});
