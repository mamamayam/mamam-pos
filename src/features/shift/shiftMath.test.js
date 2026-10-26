import { describe, it, expect } from 'vitest';
import { closedOnDay, diffTone, computeShiftStats, walletRows, courierRows } from './shiftMath';

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

describe('walletRows (rincian Uang di Dompet)', () => {
  const st = { initialCash: 300000, cashSales: 1260000, cashIncomes: 50000, cashExpensesKasir: 85000 };
  it('urutan: pemasukan per sumber, Total Pemasukan, Pengeluaran, Total Saldo Dompet', () => {
    const rows = walletRows(st);
    expect(rows.map(r => r.l)).toEqual(['Uang Kas Awal', 'Penjualan Tunai', 'Pemasukan Lain', 'Total Pemasukan', 'Pengeluaran Kasir', 'Total Saldo Dompet']);
    expect(rows.find(r => r.l === 'Total Pemasukan').v).toBe(1610000);
  });
  it('Total Saldo Dompet sama dengan expectedCash dari computeShiftStats', () => {
    const real = computeShiftStats({
      shift: { opening_balance: 300000 },
      sales: [{ payment_method: 'Tunai', total: 1000000 }],
      expenses: [{ amount: 85000 }],
      incomes: [],
    });
    const rows = walletRows(real);
    expect(rows[rows.length - 1].v).toBe(real.expectedCash);
    expect(rows[rows.length - 1].v).toBe(1215000);
  });
  it('data kosong = semua 0, label saldo awal bisa diganti', () => {
    const rows = walletRows(null, 'Saldo Awal (Modal)');
    expect(rows[0].l).toBe('Saldo Awal (Modal)');
    expect(rows.every(r => r.v === 0)).toBe(true);
  });
});

describe('courierRows (rincian Uang di Kurir)', () => {
  it('Total Saldo Kurir = saldo; pemasukan = saldo + pengeluaran kurir', () => {
    const rows = courierRows([{ balance: 187000 }], 23000);
    expect(rows.map(r => r.l)).toEqual(['Penjualan Dipegang Kurir', 'Total Pemasukan', 'Pengeluaran Kurir', 'Total Saldo Kurir']);
    expect(rows[1].v).toBe(210000);
    expect(rows[2].v).toBe(23000);
    expect(rows[3].v).toBe(187000);
  });
  it('cocok dengan computeShiftStats, termasuk kurir yang saldonya nol', () => {
    const real = computeShiftStats({
      shift: { opening_balance: 0 },
      sales: [
        { payment_method: 'Tunai', total: 100000, cash_holder_employee_id: 'k1', cash_holder_name: 'Andi' },
        { payment_method: 'Tunai', total: 50000, cash_holder_employee_id: 'k2', cash_holder_name: 'Budi' },
      ],
      expenses: [
        { amount: 20000, cash_holder_employee_id: 'k1', cash_holder_name: 'Andi' },
        { amount: 50000, cash_holder_employee_id: 'k2', cash_holder_name: 'Budi' },
      ],
      incomes: [],
    });
    const rows = courierRows(real.couriers, real.cashExpensesKurir);
    expect(rows[3].v).toBe(real.totalHeldByCouriers);
    expect(rows[1].v).toBe(150000);
  });
});
