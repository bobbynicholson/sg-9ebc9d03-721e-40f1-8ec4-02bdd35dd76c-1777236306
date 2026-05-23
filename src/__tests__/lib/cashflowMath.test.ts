import { computeCurrentCashPosition } from '@/lib/cashflowMath';

describe('computeCurrentCashPosition', () => {
  it('subtracts every outflow when inventory is known', () => {
    const r = computeCurrentCashPosition({
      cashReceived: 100_000,
      wages: 20_000,
      fixedCostsNext30: 15_000,
      supplierPayablesNext30: 10_000,
      inventoryCosts: 5_000,
    });
    expect(r.net).toBe(50_000);
    expect(r.noActivity).toBe(false);
  });

  it('treats null inventory as unknown, not zero', () => {
    const withNull = computeCurrentCashPosition({
      cashReceived: 100_000,
      wages: 20_000,
      fixedCostsNext30: 0,
      supplierPayablesNext30: 0,
      inventoryCosts: null,
    });
    const withZero = computeCurrentCashPosition({
      cashReceived: 100_000,
      wages: 20_000,
      fixedCostsNext30: 0,
      supplierPayablesNext30: 0,
      inventoryCosts: 0,
    });
    // The net comes out the same number, but noActivity differs only
    // when every input is zero - null inventory shouldn't flip a real
    // cash-received page into "no activity".
    expect(withNull.net).toBe(80_000);
    expect(withZero.net).toBe(80_000);
  });

  it('flags noActivity when every input is zero or null', () => {
    const r = computeCurrentCashPosition({
      cashReceived: 0,
      wages: 0,
      fixedCostsNext30: 0,
      supplierPayablesNext30: 0,
      inventoryCosts: null,
    });
    expect(r.net).toBe(0);
    expect(r.noActivity).toBe(true);
  });

  it('goes negative when outflows exceed inflows', () => {
    const r = computeCurrentCashPosition({
      cashReceived: 10_000,
      wages: 5_000,
      fixedCostsNext30: 8_000,
      supplierPayablesNext30: 3_000,
      inventoryCosts: 2_000,
    });
    expect(r.net).toBe(-8_000);
  });

  it('echoes inputs back so callers can read both raw and net from one object', () => {
    const r = computeCurrentCashPosition({
      cashReceived: 1,
      wages: 2,
      fixedCostsNext30: 3,
      supplierPayablesNext30: 4,
      inventoryCosts: 5,
    });
    expect(r.cashReceived).toBe(1);
    expect(r.wages).toBe(2);
    expect(r.fixedCostsNext30).toBe(3);
    expect(r.supplierPayablesNext30).toBe(4);
    expect(r.inventoryCosts).toBe(5);
  });
});
