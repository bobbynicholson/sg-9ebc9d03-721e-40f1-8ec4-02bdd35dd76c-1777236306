import {
  normalizePayType,
  monthlySalaryFraction,
  computeMonthlyPeriodPay,
  computeShiftPeriodPay,
  computeSessionEarnings,
  round2,
} from '@/lib/payroll/payTypes';

describe('normalizePayType', () => {
  it('passes through the two non-hourly models', () => {
    expect(normalizePayType('monthly')).toBe('monthly');
    expect(normalizePayType('shift')).toBe('shift');
  });
  it('defaults everything unrecognised to hourly', () => {
    expect(normalizePayType('hourly')).toBe('hourly');
    expect(normalizePayType(null)).toBe('hourly');
    expect(normalizePayType(undefined)).toBe('hourly');
    expect(normalizePayType('')).toBe('hourly');
    expect(normalizePayType('salary')).toBe('hourly');
  });
});

describe('monthlySalaryFraction', () => {
  it('is exactly 1.0 for a full 31-day calendar month', () => {
    expect(monthlySalaryFraction('2026-07-01', '2026-07-31')).toBeCloseTo(1, 10);
  });
  it('is exactly 1.0 for a full 28-day February', () => {
    expect(monthlySalaryFraction('2026-02-01', '2026-02-28')).toBeCloseTo(1, 10);
  });
  it('is exactly 1.0 for a full 30-day calendar month', () => {
    expect(monthlySalaryFraction('2026-06-01', '2026-06-30')).toBeCloseTo(1, 10);
  });
  it('counts a single day as 1/daysInMonth', () => {
    expect(monthlySalaryFraction('2026-07-15', '2026-07-15')).toBeCloseTo(1 / 31, 10);
    expect(monthlySalaryFraction('2026-02-15', '2026-02-15')).toBeCloseTo(1 / 28, 10);
  });
  it('sums across a month boundary correctly', () => {
    // Last 2 days of Feb (2/28) + first day of March (1/31).
    const frac = monthlySalaryFraction('2026-02-27', '2026-03-01');
    expect(frac).toBeCloseTo(2 / 28 + 1 / 31, 10);
  });
  it('returns 0 for an inverted or empty window', () => {
    expect(monthlySalaryFraction('2026-07-31', '2026-07-01')).toBe(0);
    expect(monthlySalaryFraction('bad', 'worse')).toBe(0);
  });
});

describe('computeMonthlyPeriodPay', () => {
  it('pays the full salary for a full month', () => {
    expect(computeMonthlyPeriodPay(30000, '2026-07-01', '2026-07-31')).toBe(30000);
  });
  it('prorates a half month', () => {
    // 15 of 31 days.
    const pay = computeMonthlyPeriodPay(31000, '2026-07-01', '2026-07-15');
    expect(pay).toBe(round2(31000 * (15 / 31)));
  });
  it('is 0 for a null salary', () => {
    expect(computeMonthlyPeriodPay(null, '2026-07-01', '2026-07-31')).toBe(0);
  });
});

describe('computeShiftPeriodPay', () => {
  it('multiplies flat rate by shift count', () => {
    expect(computeShiftPeriodPay(450, 6)).toBe(2700);
  });
  it('is 0 when either input is missing', () => {
    expect(computeShiftPeriodPay(null, 6)).toBe(0);
    expect(computeShiftPeriodPay(450, 0)).toBe(0);
  });
});

describe('computeSessionEarnings', () => {
  it('hourly = hours x rate', () => {
    expect(computeSessionEarnings('hourly', { hours: 8, hourlyRate: 50 })).toBe(400);
  });
  it('unknown pay type falls back to hourly', () => {
    expect(computeSessionEarnings(null, { hours: 8, hourlyRate: 50 })).toBe(400);
  });
  it('shift = one flat shift rate regardless of hours', () => {
    expect(computeSessionEarnings('shift', { hours: 3, hourlyRate: 50, shiftRate: 450 })).toBe(450);
    expect(computeSessionEarnings('shift', { hours: 12, hourlyRate: 50, shiftRate: 450 })).toBe(450);
  });
  it('monthly = 0 (paid via the period payslip, never per session)', () => {
    expect(computeSessionEarnings('monthly', { hours: 8, hourlyRate: 50, shiftRate: 450 })).toBe(0);
  });
  it('is NaN-safe', () => {
    expect(computeSessionEarnings('hourly', { hours: null, hourlyRate: null })).toBe(0);
    expect(computeSessionEarnings('shift', { hours: 8, hourlyRate: 50, shiftRate: null })).toBe(0);
  });
});

describe('computeSessionEarnings (BCEA hourly context)', () => {
  it('splits daily overtime at 1.5x over the threshold', () => {
    // 11h at R100, 9h threshold: 9*100 + 2*100*1.5 = 900 + 300 = 1200.
    const pay = computeSessionEarnings('hourly', {
      hours: 11, hourlyRate: 100, overtimeThresholdHours: 9,
    });
    expect(pay).toBe(1200);
  });
  it('no overtime when under the threshold', () => {
    expect(computeSessionEarnings('hourly', {
      hours: 8, hourlyRate: 100, overtimeThresholdHours: 9,
    })).toBe(800);
  });
  it('honours an explicit overtime rate over the 1.5x default', () => {
    // 10h, threshold 9, explicit OT rate R250: 9*100 + 1*250 = 1150.
    expect(computeSessionEarnings('hourly', {
      hours: 10, hourlyRate: 100, overtimeThresholdHours: 9, overtimeRate: 250,
    })).toBe(1150);
  });
  it('pays the whole session at 2x on a Sunday/holiday (default)', () => {
    // 8h at R100, Sunday: 8 * 200 = 1600. No overtime split applies.
    expect(computeSessionEarnings('hourly', {
      hours: 8, hourlyRate: 100, overtimeThresholdHours: 9, isSundayOrHoliday: true,
    })).toBe(1600);
  });
  it('honours an explicit Sunday/holiday rate', () => {
    expect(computeSessionEarnings('hourly', {
      hours: 8, hourlyRate: 100, isSundayOrHoliday: true, sundayHolidayRate: 180,
    })).toBe(1440);
  });
  it('falls back to flat hours x rate with no BCEA context', () => {
    expect(computeSessionEarnings('hourly', { hours: 11, hourlyRate: 100 })).toBe(1100);
  });
  it('shift + monthly ignore BCEA context entirely', () => {
    expect(computeSessionEarnings('shift', {
      hours: 11, hourlyRate: 100, shiftRate: 450, overtimeThresholdHours: 9, isSundayOrHoliday: true,
    })).toBe(450);
    expect(computeSessionEarnings('monthly', {
      hours: 11, hourlyRate: 100, overtimeThresholdHours: 9, isSundayOrHoliday: true,
    })).toBe(0);
  });
});
