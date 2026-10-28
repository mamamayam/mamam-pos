import { describe, it, expect } from 'vitest';
import { filterSales, paymentStats, sortSales, isTimeSort, methodOf, splitPartsOf } from './riwayatFilter';

const S = [
  { id: 'a1', display_number: 101, customer_name: 'Budi', order_type: 'Takeaway', payment_method: 'Tunai', total: 30000, paid_at: '2026-10-10T03:00:00Z' },
  { id: 'b2', display_number: 102, customer_name: null, order_type: 'Ojol', payment_method: 'Ojol', total: 50000, paid_at: '2026-10-10T05:00:00Z' },
  { id: 'c3', display_number: 103, customer_name: 'Siti', order_type: 'Dine-in', payment_method: 'QRIS', total: 20000, paid_at: null, created_at: '2026-10-10T04:00:00Z' },
  { id: 'd4', display_number: 104, customer_name: 'Budi Santoso', order_type: 'Takeaway', payment_method: 'Tunai', total: 10000, paid_at: '2026-10-10T06:00:00Z' },
];

describe('riwayatFilter', () => {
  it('filterSales: tipe order dan pencarian (nomor, ID, nama)', () => {
    expect(filterSales(S, {}).length).toBe(4);
    expect(filterSales(S, { type: 'Takeaway' }).map((s) => s.id)).toEqual(['a1', 'd4']);
    expect(filterSales(S, { query: 'budi' }).map((s) => s.id)).toEqual(['a1', 'd4']);
    expect(filterSales(S, { query: '102' }).map((s) => s.id)).toEqual(['b2']);
    expect(filterSales(S, { query: 'C3' }).map((s) => s.id)).toEqual(['c3']);
    expect(filterSales(S, { type: 'Takeaway', query: 'santoso' }).map((s) => s.id)).toEqual(['d4']);
    expect(filterSales(S, { query: '   ' }).length).toBe(4);
  });

  it('paymentStats: jumlah & total per metode, terbesar dulu', () => {
    const st = paymentStats(S);
    expect(st.map((x) => x.key)).toEqual(['Ojol', 'Tunai', 'QRIS']);
    expect(st.find((x) => x.key === 'Tunai')).toEqual({ key: 'Tunai', count: 2, total: 40000 });
    expect(methodOf({})).toBe('Lainnya');
  });

  it('sortSales: waktu pakai paid_at, jatuh ke created_at', () => {
    expect(sortSales(S, 'terbaru').map((s) => s.id)).toEqual(['d4', 'b2', 'c3', 'a1']);
    expect(sortSales(S, 'terlama').map((s) => s.id)).toEqual(['a1', 'c3', 'b2', 'd4']);
    expect(sortSales(S, 'total-desc').map((s) => s.id)).toEqual(['b2', 'a1', 'c3', 'd4']);
    expect(sortSales(S, 'total-asc').map((s) => s.id)).toEqual(['d4', 'c3', 'a1', 'b2']);
    expect(sortSales(S, 'ngawur').map((s) => s.id)).toEqual(['d4', 'b2', 'c3', 'a1']);
  });

  it('sortSales tidak mengubah array asli; isTimeSort', () => {
    const copy = [...S];
    sortSales(S, 'total-asc');
    expect(S).toEqual(copy);
    expect(isTimeSort('terbaru')).toBe(true);
    expect(isTimeSort('total-desc')).toBe(false);
  });

  it('filterSales: filter perangkat dan pencarian nama perangkat', () => {
    const D = [
      { id: 'a1', display_number: 1, device_id: 'dev-1', device_name: 'HP Kasir Depan' },
      { id: 'b2', display_number: 2, device_id: 'dev-2', device_name: 'HP Budi' },
      { id: 'c3', display_number: 3, device_id: null, device_name: null },
    ];
    expect(filterSales(D, { device: 'dev-1' }).map((s) => s.id)).toEqual(['a1']);
    expect(filterSales(D, { device: 'tanpa' }).map((s) => s.id)).toEqual(['c3']);
    expect(filterSales(D, { device: 'semua' }).length).toBe(3);
    expect(filterSales(D, { query: 'kasir depan' }).map((s) => s.id)).toEqual(['a1']);
    expect(filterSales(D, { device: 'dev-2', query: 'budi' }).map((s) => s.id)).toEqual(['b2']);
    expect(filterSales(D, { device: 'dev-2', query: 'kasir' })).toEqual([]);
  });
});

describe('splitPartsOf', () => {
  it('Split Payment: daftar metode + nominal; bukan split / data kosong / rusak = kosong', () => {
    const split = { payment_method: 'Split Payment', split_payments_json: [{ method: 'Tunai', amount: 5000 }, { method: 'QRIS', amount: '5000' }] };
    expect(splitPartsOf(split)).toEqual([{ method: 'Tunai', amount: 5000 }, { method: 'QRIS', amount: 5000 }]);
    expect(splitPartsOf({ payment_method: 'Tunai', split_payments_json: [{ method: 'Tunai', amount: 1 }] })).toEqual([]);
    expect(splitPartsOf({ payment_method: 'Split Payment', split_payments_json: null })).toEqual([]);
    expect(splitPartsOf({ payment_method: 'Split Payment', split_payments_json: [null, { amount: 1 }] })).toEqual([]);
    expect(splitPartsOf(null)).toEqual([]);
  });
});
