import { describe, it, expect } from 'vitest';
import {
  summarizeSales, topMenus, summarizeExpenses, expenseDetailText,
  periodRange, dayStartISO, nextDayStartISO, localDateOf, localDateString,
  shiftMonthKey, monthLabel, dayLabel, shortDateLabel, monthRange, monthOptions, dayOptions, lastDaysRange, shiftDate, reportRange, periodLabel, menuListView, TOP_MENU_COUNT,
} from './reportsMath.js';

const it_ = (menu, name, qty, price) => ({ menu_item_id: menu, name, qty, price });
const sale = (total, pm, ot, items = []) => ({ total, payment_method: pm, order_type: ot, items });
const exp = (category, amount) => ({ category, amount });

describe('summarizeSales', () => {
  const sales = [
    sale(40000, 'Tunai', 'Takeaway', [it_('m1', 'Ayam Geprek', 2, 20000)]),
    sale(25000, 'QRIS', 'Dine-in', [it_('m1', 'Ayam Geprek', 1, 20000), it_('m2', 'Es Teh', 1, 5000)]),
    sale(30000, 'Tunai', 'Ojol', [it_('m3', 'Menu Baru', 3, 10000)]),
  ];
  const s = summarizeSales(sales);
  it('total, jumlah, rata-rata', () => { expect(s.count).toBe(3); expect(s.total).toBe(95000); expect(s.average).toBe(31667); });
  it('tidak lagi membawa HPP / laba kotor (laba kotor = penjualan − pengeluaran, dihitung di tampilan)', () => {
    expect(s).not.toHaveProperty('hppTotal'); expect(s).not.toHaveProperty('grossProfit'); expect(s).not.toHaveProperty('itemsWithoutHppQty');
  });
  it('per metode bayar diurutkan dari terbesar', () => {
    expect(s.byPayment).toEqual([{ key: 'Tunai', count: 2, total: 70000 }, { key: 'QRIS', count: 1, total: 25000 }]);
  });
  it('per tipe order', () => { expect(s.byOrderType.map(x => x.key)).toEqual(['Takeaway', 'Ojol', 'Dine-in']); });
  it('kosong: semua nol, tanpa NaN', () => {
    const e = summarizeSales([]);
    expect(e).toMatchObject({ count: 0, total: 0, average: 0 });
  });
  it('transaksi tanpa items / angka teks aman', () => {
    const r = summarizeSales([{ total: '10000', payment_method: null, order_type: null }]);
    expect(r.total).toBe(10000); expect(r.byPayment[0].key).toBe('Lainnya');
  });
});

describe('topMenus', () => {
  it('dikelompokkan per menu, urut porsi terbanyak, dipotong limit', () => {
    const sales = [
      sale(0, 'Tunai', 'T', [it_('m1', 'Ayam', 2, 20000), it_('m2', 'Es Teh', 5, 5000)]),
      sale(0, 'Tunai', 'T', [it_('m1', 'Ayam', 4, 20000)]),
    ];
    expect(topMenus(sales, 10)).toEqual([
      { key: 'm1', name: 'Ayam', qty: 6, revenue: 120000 },
      { key: 'm2', name: 'Es Teh', qty: 5, revenue: 25000 },
    ]);
    expect(topMenus(sales, 1)).toHaveLength(1);
  });
  it('menu yang sudah dihapus (id kosong) dikelompokkan per nama', () => {
    const r = topMenus([sale(0, 'T', 'T', [it_(null, 'Menu Lama', 1, 1000), it_(null, 'Menu Lama', 2, 1000)])]);
    expect(r).toEqual([{ key: 'nama:Menu Lama', name: 'Menu Lama', qty: 3, revenue: 3000 }]);
  });
});

describe('summarizeExpenses (Pengeluaran = SEMUA kategori)', () => {
  const expenses = [exp('Belanja', 600000), exp('Bayar Ayam', 400000), exp('Kasbon', 50000), exp('Gaji', 300000), exp('Belanja', 100000)];
  const s = summarizeExpenses(expenses);
  it('total menjumlah semua kategori, tanpa ada yang dikecualikan (belanja, kasbon, gaji, dll)', () => {
    expect(s.total).toBe(1450000); expect(s.count).toBe(5);
  });
  it('Laba Kotor = penjualan − pengeluaran', () => {
    expect(2000000 - s.total).toBe(550000);
  });
  it('rincian per kategori: digabung, terbesar dulu, ada jumlah catatan', () => {
    expect(s.byCategory).toEqual([
      { category: 'Belanja', count: 2, total: 700000 },
      { category: 'Bayar Ayam', count: 1, total: 400000 },
      { category: 'Gaji', count: 1, total: 300000 },
      { category: 'Kasbon', count: 1, total: 50000 },
    ]);
  });
  it('kategori dicocokkan tanpa peduli huruf besar/kecil & spasi; kategori kosong = Lainnya', () => {
    const r = summarizeExpenses([exp(' belanja ', 100), exp('BELANJA', 50), exp('', 10), exp(null, 5)]);
    expect(r.byCategory).toEqual([{ category: 'belanja', count: 2, total: 150 }, { category: 'Lainnya', count: 2, total: 15 }]);
  });
  it('nominal teks / kosong aman; daftar kosong = nol', () => {
    expect(summarizeExpenses([exp('A', '2500'), exp('B', undefined)]).total).toBe(2500);
    expect(summarizeExpenses([])).toEqual({ count: 0, total: 0, byCategory: [] });
  });
});

describe('expenseDetailText', () => {
  it('toko/pemasok lalu catatan, poin per baris digabung " · "', () => {
    expect(expenseDetailText({ store_or_supplier_name: 'Pak Budi', detail: 'Ayam 20 ekor\n\n  Es batu  ' })).toBe('Pak Budi · Ayam 20 ekor · Es batu');
  });
  it('tanpa toko dan tanpa catatan = kosong', () => {
    expect(expenseDetailText({ store_or_supplier_name: null, detail: null })).toBe('');
    expect(expenseDetailText({})).toBe('');
  });
});

describe('periodRange & batas hari', () => {
  const today = '2026-09-30';
  it('hari ini / kemarin / bulan ini', () => {
    expect(periodRange('hari-ini', {}, today)).toEqual({ fromDate: '2026-09-30', toDate: '2026-09-30' });
    expect(periodRange('kemarin', {}, today)).toEqual({ fromDate: '2026-09-29', toDate: '2026-09-29' });
    expect(periodRange('bulan-ini', {}, today)).toEqual({ fromDate: '2026-09-01', toDate: '2026-09-30' });
  });
  it('kemarin melewati batas bulan & tahun', () => {
    expect(periodRange('kemarin', {}, '2026-10-01').fromDate).toBe('2026-09-30');
    expect(periodRange('kemarin', {}, '2027-01-01').fromDate).toBe('2026-12-31');
  });
  it('semua = tanpa batas; tanggal terpilih: tanpa akhir = satu hari', () => {
    expect(periodRange('semua')).toEqual({ fromDate: null, toDate: null });
    expect(periodRange('tanggal-terpilih', { start: '2026-09-05' })).toEqual({ fromDate: '2026-09-05', toDate: '2026-09-05' });
    expect(periodRange('tanggal-terpilih', { start: '2026-09-05', end: '2026-09-09' })).toEqual({ fromDate: '2026-09-05', toDate: '2026-09-09' });
    expect(periodRange('tanggal-terpilih', {})).toEqual({ fromDate: null, toDate: null });
  });
  it('batas hari: transaksi 23:59 masuk hari itu, 00:00 masuk hari berikutnya (waktu lokal)', () => {
    const start = Date.parse(dayStartISO('2026-09-30')), end = Date.parse(nextDayStartISO('2026-09-30'));
    const lastMinute = new Date(2026, 8, 30, 23, 59, 59).getTime(), midnight = new Date(2026, 9, 1, 0, 0, 0).getTime();
    expect(lastMinute >= start && lastMinute < end).toBe(true);
    expect(midnight >= start && midnight < end).toBe(false);
  });
  it('localDateOf memakai tanggal LOKAL, bukan UTC', () => {
    expect(localDateOf(new Date(2026, 8, 30, 0, 30).toISOString())).toBe('2026-09-30');
    expect(localDateOf(new Date(2026, 8, 30, 23, 30).toISOString())).toBe('2026-09-30');
    expect(localDateString(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('navigasi periode Laporan', () => {
  const today = '2026-10-15';
  it('shiftMonthKey melewati pergantian tahun', () => {
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2026-10', -13)).toBe('2025-09');
  });
  it('label bulan & hari (hari dari tanggal lokal)', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(dayLabel('2026-10-15')).toBe('Kam, 15 Okt 2026');
    expect(shortDateLabel('2026-01-05')).toBe('5 Jan 2026');
  });
  it('monthRange: bulan berjalan sampai hari ini, bulan lalu penuh (termasuk Februari kabisat)', () => {
    expect(monthRange('2026-10', today)).toEqual({ fromDate: '2026-10-01', toDate: '2026-10-15' });
    expect(monthRange('2026-09', today)).toEqual({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    expect(monthRange('2028-02', today)).toEqual({ fromDate: '2028-02-01', toDate: '2028-02-29' });
    expect(monthRange('2026-02', today).toDate).toBe('2026-02-28');
  });
  it('monthOptions: bulan berjalan di atas bertanda, mundur tanpa bulan depan', () => {
    const o = monthOptions(today, 14);
    expect(o).toHaveLength(14);
    expect(o[0]).toEqual({ value: '2026-10', label: 'Oktober 2026', tag: 'Bulan ini' });
    expect(o[1].value).toBe('2026-09'); expect(o[1].tag).toBeUndefined();
    expect(o[13].value).toBe('2025-09');
  });
  it('dayOptions & shiftDate', () => {
    const o = dayOptions(today, 3);
    expect(o.map(x => x.value)).toEqual(['2026-10-15', '2026-10-14', '2026-10-13']);
    expect(o[0].tag).toBe('Hari ini');
    expect(shiftDate('2026-10-01', -1)).toBe('2026-09-30');
  });
  it('lastDaysRange termasuk hari ini', () => {
    expect(lastDaysRange(7, today)).toEqual({ start: '2026-10-09', end: '2026-10-15' });
    expect(lastDaysRange(1, today)).toEqual({ start: today, end: today });
  });
  it('reportRange per mode', () => {
    expect(reportRange({ mode: 'bulan', month: '2026-09' }, today)).toEqual({ fromDate: '2026-09-01', toDate: '2026-09-30' });
    expect(reportRange({ mode: 'hari', day: '2026-10-03' }, today)).toEqual({ fromDate: '2026-10-03', toDate: '2026-10-03' });
    expect(reportRange({ mode: 'semua' }, today)).toEqual({ fromDate: null, toDate: null });
    expect(reportRange({ mode: 'rentang', start: '2026-10-01', end: '2026-10-09' }, today)).toEqual({ fromDate: '2026-10-01', toDate: '2026-10-09' });
  });
  it('rentang: tanpa akhir = satu hari, terbalik ditukar, tanpa awal = null (BUKAN semua data)', () => {
    expect(reportRange({ mode: 'rentang', start: '2026-10-05', end: '' }, today)).toEqual({ fromDate: '2026-10-05', toDate: '2026-10-05' });
    expect(reportRange({ mode: 'rentang', start: '2026-10-09', end: '2026-10-01' }, today)).toEqual({ fromDate: '2026-10-01', toDate: '2026-10-09' });
    expect(reportRange({ mode: 'rentang', start: '', end: '' }, today)).toBeNull();
  });
});

describe('periodLabel (judul Income Statement)', () => {
  it('bulan, hari, semua', () => {
    expect(periodLabel({ mode: 'bulan', month: '2026-10' })).toBe('Oktober 2026');
    expect(periodLabel({ mode: 'hari', day: '2026-10-03' })).toBe('Sab, 3 Okt 2026');
    expect(periodLabel({ mode: 'semua' })).toBe('Semua periode');
  });
  it('rentang: satu hari, dua tanggal, tanggal terbalik ditukar, kosong = teks kosong', () => {
    expect(periodLabel({ mode: 'rentang', start: '2026-10-05', end: '' })).toBe('5 Okt 2026');
    expect(periodLabel({ mode: 'rentang', start: '2026-10-01', end: '2026-10-15' })).toBe('1 Okt 2026 – 15 Okt 2026');
    expect(periodLabel({ mode: 'rentang', start: '2026-10-15', end: '2026-10-01' })).toBe('1 Okt 2026 – 15 Okt 2026');
    expect(periodLabel({ mode: 'rentang', start: '', end: '' })).toBe('');
  });
});

describe('menuListView (tombol Lainnya di Menu Terlaris)', () => {
  const menus = (n) => Array.from({ length: n }, (_, i) => ({ key: `m${i}`, name: `Menu ${i}`, qty: n - i, revenue: 0 }));
  it('batas ringkas = 10', () => { expect(TOP_MENU_COUNT).toBe(10); });
  it('lebih dari 10 menu: ringkas = 10 teratas + tombol "Lainnya" (sisa dihitung); diperluas = semua', () => {
    const m = menus(25);
    const ringkas = menuListView(m, false);
    expect(ringkas.rows).toHaveLength(10); expect(ringkas.rows[0].key).toBe('m0'); expect(ringkas.canToggle).toBe(true); expect(ringkas.hiddenCount).toBe(15);
    const semua = menuListView(m, true);
    expect(semua.rows).toHaveLength(25); expect(semua.canToggle).toBe(true);
  });
  it('10 menu atau kurang: semua tampil dan tidak ada tombol', () => {
    for (const n of [0, 3, 10]) {
      const v = menuListView(menus(n), false);
      expect(v.rows).toHaveLength(n); expect(v.canToggle).toBe(false); expect(v.hiddenCount).toBe(0);
    }
  });
  it('topMenus tanpa batas mengembalikan semua menu terjual, urut porsi terbanyak', () => {
    const sales = Array.from({ length: 15 }, (_, i) => ({ total: 0, items: [{ menu_item_id: `m${i}`, name: `Menu ${i}`, qty: i + 1, price: 1000 }] }));
    const all = topMenus(sales, Infinity);
    expect(all).toHaveLength(15); expect(all[0].qty).toBe(15); expect(all[14].qty).toBe(1);
  });
});
