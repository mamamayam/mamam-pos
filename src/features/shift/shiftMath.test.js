import { describe, it, expect } from 'vitest';
import { closedOnDay, diffTone, computeShiftStats } from './shiftMath';

// Hari lokal sederhana untuk tes: ambil 10 karakter pertama ('YYYY-MM-DD').
const dayOf = (iso) => String(iso).slice(0, 10);

describe('closedOnDay', () => {
  const history = [
    { id: 'c', closed_at: '2026-10-23T14:00:00' },
    { id: 'a', closed_at: '2026-10-22T09:00:00' },
    { id: 'b', closed_at: '2026-10-23T08:00:00' },
    { id: 'x', closed_at: null },
  ];
  it('hanya penutupan pada hari itu, urut paling awal dulu', () => {
    expect(closedOnDay(history, '2026-10-23', dayOf).map(s => s.id)).toEqual(['b', 'c']);
  });
  it('hari tanpa penutupan = daftar kosong', () => {
    expect(closedOnDay(history, '2026-10-21', dayOf)).toEqual([]);
  });
  it('riwayat kosong / tidak ada = daftar kosong', () => {
    expect(closedOnDay([], '2026-10-23', dayOf)).toEqual([]);
    expect(closedOnDay(undefined, '2026-10-23', dayOf)).toEqual([]);
  });
});

describe('diffTone', () => {
  it('minus, lebih, pas', () => {
    expect(diffTone(-15000)).toBe('minus');
    expect(diffTone(10000)).toBe('lebih');
    expect(diffTone(0)).toBe('pas');
    expect(diffTone(null)).toBe('pas');
  });
});

describe('Uang di Dompet = expectedCash (kurir terpisah)', () => {
  it('pengeluaran kurir tidak mengurangi laci; total cash = laci + kurir', () => {
    const st = computeShiftStats({
      shift: { opening_balance: 300000 },
      sales: [
        { payment_method: 'Tunai', total: 1000000 },
        { payment_method: 'Tunai', total: 150000, cash_holder_employee_id: 'k1', cash_holder_name: 'Andi' },
      ],
      expenses: [
        { amount: 85000, payment_method: 'Tunai', direction: 'pengeluaran' },
        { amount: 40000, payment_method: 'Tunai', direction: 'pengeluaran', cash_holder_employee_id: 'k1', cash_holder_name: 'Andi' },
      ],
      incomes: [],
    });
    expect(st.expectedCash).toBe(300000 + 1000000 - 85000);
    expect(st.totalHeldByCouriers).toBe(110000);
    expect(st.totalCashBisnis).toBe(st.expectedCash + 110000);
  });
});
