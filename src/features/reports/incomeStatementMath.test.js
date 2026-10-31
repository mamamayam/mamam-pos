import { describe, it, expect } from 'vitest';
import { buildIncomeStatement, classifyExpense, percentOf, formatPercent, OJOL_PLATFORMS } from './incomeStatementMath.js';
import { summarizeSales, summarizeExpenses } from './reportsMath.js';
import { OJOL_PLATFORMS as SHARED_PLATFORMS } from '../../lib/ojolPlatforms.js';

const sale = (total, payment_method, ojol_platform = null) => ({ total, payment_method, ojol_platform });
const exp = (category, amount) => ({ category, amount });

describe('classifyExpense', () => {
  it.each([
    ['Belanja', 'belanja'], ['  belanja ', 'belanja'], ['Bayar Ayam', 'ayam'], ['bayar ayam', 'ayam'],
    ['Gaji mingguan', 'karyawan'], ['Gaji', 'karyawan'],
    ['Kasbon', 'karyawan'], ['Kasbon harian', 'karyawan'], ['Kasbon Gaji Mingguan', 'karyawan'],
    // Kategori lain TIDAK dipetakan satu per satu: semuanya operasional, tampil per nama kategori di app.
    ['Biaya sewa', 'operasional'], ['Sewa Ruko', 'operasional'], ['Biaya Listrik', 'operasional'],
    ['Biaya', 'operasional'], ['Transport', 'operasional'], ['', 'operasional'], [null, 'operasional'], [undefined, 'operasional'],
  ])('%s -> %s', (category, expected) => { expect(classifyExpense(category)).toBe(expected); });
});

describe('percentOf / formatPercent', () => {
  it('persen dari total, total 0 aman', () => {
    expect(percentOf(25, 100)).toBe(25);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf('x', 100)).toBe(0);
  });
  it('format Indonesia satu desimal, koma, tanda minus, tanpa -0', () => {
    expect(formatPercent(49)).toBe('49,0%');
    expect(formatPercent(34.14)).toBe('34,1%');
    expect(formatPercent(100)).toBe('100,0%');
    expect(formatPercent(-3.24)).toBe('-3,2%');
    expect(formatPercent(-0.01)).toBe('0,0%');
    expect(formatPercent(NaN)).toBe('0,0%');
  });
});

describe('buildIncomeStatement — angka Laporan Oktober 2026 (screenshot pemilik)', () => {
  // Satu catatan per baris cukup: yang diuji jumlahnya per kelompok.
  const sales = [
    sale(15613000, 'Tunai'), sale(7182000, 'QRIS'), sale(3233000, 'Transfer'), sale(10000, 'Split Payment'),
    sale(2900000, 'Ojol', 'Shopeefood'), sale(1900000, 'Ojol', 'Grabfood'), sale(1016000, 'Ojol', 'Gofood'),
  ];
  const expenses = [
    exp('Belanja', 10855500), exp('Bayar Ayam', 5858000), exp('Gaji mingguan', 1860567),
    exp('Kasbon Gaji Mingguan', 1081500), exp('Kasbon', 385000), exp('Kasbon harian', 345001),
    exp('Biaya listrik', 150000), exp('Biaya', 139000),
  ];
  const r = buildIncomeStatement({ sales, expenses });

  it('pendapatan: per metode bayar + ojol per aplikasi', () => {
    expect(r.pendapatan).toMatchObject({ tunai: 15613000, qris: 7182000, transfer: 3233000, split: 10000, lainnya: 0 });
    expect(r.pendapatan.ojol.total).toBe(5816000);
    expect(r.pendapatan.ojol.platforms.map((p) => [p.name, p.total])).toEqual([['Shopeefood', 2900000], ['Grabfood', 1900000], ['Gofood', 1016000]]);
    expect(r.totalPendapatan).toBe(31854000);
  });
  it('HPP = belanja + bayar ayam (stok & waste belum diisi = 0, ditandai pending)', () => {
    expect(r.hpp).toMatchObject({ belanja: 10855500, bayarAyam: 5858000, stokAwal: 0, stokAkhir: 0, waste: 0, total: 16713500 });
    expect(r.hpp.pending).toEqual({ stokAwal: true, stokAkhir: true, waste: true });
  });
  it('laba kotor, beban operasional (satu baris per kategori, terbesar dulu), net profit', () => {
    expect(r.labaKotor).toBe(15140500);
    expect(r.beban.gaji.total).toBe(3672068);
    expect(r.beban.gaji.items.map((i) => [i.category, i.total])).toEqual([
      ['Gaji mingguan', 1860567], ['Kasbon Gaji Mingguan', 1081500], ['Kasbon', 385000], ['Kasbon harian', 345001],
    ]);
    expect(r.beban.operasional.total).toBe(289000);
    expect(r.beban.operasional.items.map((i) => [i.category, i.total])).toEqual([['Biaya listrik', 150000], ['Biaya', 139000]]);
    expect(r.beban.total).toBe(3961068);
    expect(r.netProfit).toBe(11179432);
  });
  it('HPP + beban operasional = total Pengeluaran Laporan (tidak ada yang hilang)', () => {
    expect(r.hpp.belanja + r.hpp.bayarAyam + r.beban.total).toBe(r.totalPengeluaran);
    expect(r.totalPengeluaran).toBe(summarizeExpenses(expenses).total);
    expect(r.totalPendapatan).toBe(summarizeSales(sales).total);
  });
});

describe('buildIncomeStatement — stok awal / akhir / waste', () => {
  it('rumus HPP: stok awal + belanja + bayar ayam − stok akhir − waste', () => {
    const r = buildIncomeStatement({
      sales: [sale(1000000, 'Tunai')],
      expenses: [exp('Belanja', 400000), exp('Bayar Ayam', 100000)],
      stock: { awal: 200000, akhir: 150000, waste: 20000 },
    });
    expect(r.hpp.total).toBe(200000 + 400000 + 100000 - 150000 - 20000);
    expect(r.hpp.pending).toEqual({ stokAwal: false, stokAkhir: false, waste: false });
    expect(r.labaKotor).toBe(1000000 - 530000);
  });
  it('stok 0 yang SUDAH diisi bukan "menyusul"; yang null tetap pending', () => {
    const r = buildIncomeStatement({ stock: { awal: 0, akhir: null } });
    expect(r.hpp.pending).toEqual({ stokAwal: false, stokAkhir: true, waste: true });
  });
});

describe('buildIncomeStatement — pendapatan ojol', () => {
  it('nama aplikasi dicocokkan tanpa peduli huruf besar/kecil dan spasi', () => {
    const r = buildIncomeStatement({ sales: [sale(1000, 'Ojol', 'GoFood'), sale(2000, 'Ojol', ' gofood '), sale(500, 'Ojol', 'SHOPEEFOOD')] });
    const by = Object.fromEntries(r.pendapatan.ojol.platforms.map((p) => [p.name, p]));
    expect(by.Gofood).toMatchObject({ total: 3000, count: 2 });
    expect(by.Shopeefood.total).toBe(500);
    expect(r.pendapatan.ojol.total).toBe(3500);
  });
  it('tiga aplikasi selalu tampil (walau 0), diurutkan dari terbesar', () => {
    const r = buildIncomeStatement({ sales: [sale(900, 'Ojol', 'Gofood')] });
    expect(r.pendapatan.ojol.platforms.map((p) => p.name)).toEqual(['Gofood', ...OJOL_PLATFORMS.filter((n) => n !== 'Gofood')]);
    expect(r.pendapatan.ojol.platforms.slice(1).every((p) => p.total === 0)).toBe(true);
  });
  it('ojol tanpa nama aplikasi (data lama) tampil sebagai "Tanpa aplikasi" dan totalnya tetap cocok', () => {
    const r = buildIncomeStatement({ sales: [sale(700, 'Ojol', null), sale(300, 'Ojol', 'Grabfood')] });
    expect(r.pendapatan.ojol.platforms.find((p) => p.name === 'Tanpa aplikasi').total).toBe(700);
    expect(r.pendapatan.ojol.platforms.reduce((s, p) => s + p.total, 0)).toBe(r.pendapatan.ojol.total);
  });
  it('aplikasi di luar tiga yang dikenal ikut tampil dengan namanya', () => {
    const r = buildIncomeStatement({ sales: [sale(400, 'Ojol', 'Maxim')] });
    expect(r.pendapatan.ojol.platforms.find((p) => p.name === 'Maxim').total).toBe(400);
  });
  it('metode bayar kosong/tak dikenal masuk "lainnya" supaya total pendapatan tetap sama dengan Laporan', () => {
    const sales = [sale(100, 'Tunai'), sale(50, null), sale(25, 'Kartu')];
    const r = buildIncomeStatement({ sales });
    expect(r.pendapatan.lainnya).toBe(75);
    expect(r.totalPendapatan).toBe(summarizeSales(sales).total);
  });
});

describe('buildIncomeStatement — beban operasional ikut kategori di app', () => {
  it('kategori apa pun yang bukan HPP / gaji / kasbon tampil dengan namanya sendiri, total tetap cocok', () => {
    const expenses = [exp('Belanja', 100), exp('Transport', 40), exp('Sewa Ruko', 300), exp('Gaji', 200), exp('Kasbon', 20)];
    const r = buildIncomeStatement({ expenses });
    expect(r.beban.operasional.items.map((i) => [i.category, i.total])).toEqual([['Sewa Ruko', 300], ['Transport', 40]]);
    expect(r.beban.gaji.total).toBe(220);
    expect(r.beban.total).toBe(560);
    expect(r.hpp.belanja + r.hpp.bayarAyam + r.beban.total).toBe(r.totalPengeluaran);
  });
  it('nama kategori dicocokkan tanpa peduli huruf besar/kecil dan spasi (sama seperti kartu Pengeluaran per Kategori)', () => {
    const r = buildIncomeStatement({ expenses: [exp('Sewa', 100), exp(' sewa ', 50), exp('SEWA', 25)] });
    expect(r.beban.operasional.items).toEqual([{ category: 'Sewa', count: 3, total: 175 }]);
  });
  it('kategori kosong = "Lainnya"', () => {
    const r = buildIncomeStatement({ expenses: [exp('', 10), exp(null, 5)] });
    expect(r.beban.operasional.items).toEqual([{ category: 'Lainnya', count: 2, total: 15 }]);
  });
  it('kategori di daftar app yang belum dipakai di periode ini tetap tampil Rp 0 (kategori baru langsung muncul)', () => {
    const r = buildIncomeStatement({
      expenses: [exp('Biaya', 100)],
      categories: ['Belanja', 'Bayar Ayam', 'Biaya', 'Sewa', 'Listrik', 'Gaji mingguan', 'Kasbon'],
    });
    expect(r.beban.operasional.items.map((i) => [i.category, i.total, i.count])).toEqual([['Biaya', 100, 1], ['Listrik', 0, 0], ['Sewa', 0, 0]]);
    expect(r.beban.gaji.items.map((i) => [i.category, i.total])).toEqual([['Gaji mingguan', 0], ['Kasbon', 0]]);
    expect(r.beban.total).toBe(100);
  });
  it('Belanja dan Bayar Ayam di daftar app tidak ikut jadi baris beban (mereka HPP); tidak ada baris dobel', () => {
    const r = buildIncomeStatement({ expenses: [exp('Sewa', 10)], categories: ['Belanja', 'bayar ayam', 'sewa', 'SEWA'] });
    expect(r.beban.operasional.items).toEqual([{ category: 'Sewa', count: 1, total: 10 }]);
  });
  it('kategori yang sudah dihapus dari daftar app tapi masih punya catatan tetap tampil (total harus sama dengan Laporan)', () => {
    const expenses = [exp('Kategori Lama', 70), exp('Belanja', 30)];
    const r = buildIncomeStatement({ expenses, categories: ['Belanja'] });
    expect(r.beban.operasional.items).toEqual([{ category: 'Kategori Lama', count: 1, total: 70 }]);
    expect(r.hpp.belanja + r.hpp.bayarAyam + r.beban.total).toBe(r.totalPengeluaran);
  });
  it('kategori yang diganti nama di app: nama baru (di daftar) dan nama lama (di catatan) sama-sama tampil, total tetap cocok', () => {
    const r = buildIncomeStatement({ expenses: [exp('Listrik', 40)], categories: ['Token Listrik'] });
    expect(r.beban.operasional.items.map((i) => [i.category, i.total])).toEqual([['Listrik', 40], ['Token Listrik', 0]]);
    expect(r.beban.total).toBe(40);
  });
  it('rugi: net profit negatif tetap dihitung', () => {
    const r = buildIncomeStatement({ sales: [sale(100, 'Tunai')], expenses: [exp('Belanja', 60), exp('Sewa', 80)] });
    expect(r.labaKotor).toBe(40);
    expect(r.netProfit).toBe(-40);
  });
  it('angka teks / kosong aman, tanpa NaN', () => {
    const r = buildIncomeStatement({ sales: [{ total: '1000', payment_method: 'Tunai' }], expenses: [{ category: 'Belanja', amount: '250' }, { category: 'Biaya', amount: null }] });
    expect(r.totalPendapatan).toBe(1000); expect(r.hpp.belanja).toBe(250); expect(r.netProfit).toBe(750);
    const e = buildIncomeStatement();
    expect(e.totalPendapatan).toBe(0); expect(e.netProfit).toBe(0);
    expect(e.beban).toEqual({ gaji: { total: 0, items: [] }, operasional: { total: 0, items: [] }, total: 0 });
  });
});

describe('daftar aplikasi ojol dipakai bersama PaymentModal', () => {
  it('Income Statement memakai daftar yang sama dengan tombol di PaymentModal (lib/ojolPlatforms)', () => {
    expect(OJOL_PLATFORMS).toBe(SHARED_PLATFORMS);
    const r = buildIncomeStatement({ sales: [] });
    expect(r.pendapatan.ojol.platforms.map((p) => p.name).sort()).toEqual([...SHARED_PLATFORMS].sort());
  });
});
