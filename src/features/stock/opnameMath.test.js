import { describe, it, expect } from 'vitest';
import {
  monthOf, lastDayOfMonth, opnamePhase, reminderFor, withOpname, isFullCount, latestFullByMonth, priceOf, opnameValue,
  opnameGroups, itemsWithoutPrice, recentMonths, statementStock, calendarCells,
} from './opnameMath';

const item = (id, o = {}) => ({ id, name: id.toUpperCase(), unit: 'pcs', required: false, unit_cost: null, ...o });
const master = [
  { id: 'c1', name: 'Ayam', items: [item('a', { required: true, unit_cost: 38000 }), item('b', { unit_cost: 22000 })] },
  { id: 'c2', name: 'Kemasan', items: [item('d')] },
];

describe('tanggal bulan', () => {
  it('monthOf dan lastDayOfMonth (termasuk Februari kabisat)', () => {
    expect(monthOf('2026-10-31')).toBe('2026-10');
    expect(monthOf('bukan tanggal')).toBe('');
    expect(lastDayOfMonth('2026-10')).toBe('2026-10-31');
    expect(lastDayOfMonth('2026-11')).toBe('2026-11-30');
    expect(lastDayOfMonth('2026-02')).toBe('2026-02-28');
    expect(lastDayOfMonth('2028-02')).toBe('2028-02-29');
  });
});

describe('opnamePhase / reminderFor (notif H-1 dan hari H)', () => {
  it('hari terakhir = h, sehari sebelumnya = h1, selain itu null', () => {
    expect(opnamePhase('2026-10-31')).toBe('h');
    expect(opnamePhase('2026-10-30')).toBe('h1');
    expect(opnamePhase('2026-10-29')).toBeNull();
    expect(opnamePhase('2026-11-01')).toBeNull();
    expect(opnamePhase('2026-11-30')).toBe('h');
    expect(opnamePhase('2026-11-29')).toBe('h1');
    expect(opnamePhase('2026-02-27')).toBe('h1');
    expect(opnamePhase('2028-02-28')).toBe('h1');
    expect(opnamePhase('')).toBeNull();
  });
  it('berhenti kalau mode opname sudah nyala atau hari itu sudah punya hitungan penuh', () => {
    expect(reminderFor('2026-10-30')).toBe('h1');
    expect(reminderFor('2026-10-31')).toBe('h');
    expect(reminderFor('2026-10-31', { opnameOn: true })).toBeNull();
    expect(reminderFor('2026-10-31', { fullDays: ['2026-10-31'] })).toBeNull();
    // hitungan penuh kemarin tidak menahan pengingat hari H
    expect(reminderFor('2026-10-31', { fullDays: ['2026-10-30'] })).toBe('h');
    expect(reminderFor('2026-10-15')).toBeNull();
  });
});

describe('withOpname / isFullCount', () => {
  it('opname nyala: semua item wajib; mati: master apa adanya', () => {
    expect(withOpname(master, false)).toBe(master);
    const on = withOpname(master, true);
    expect(on.flatMap((c) => c.items).every((i) => i.required)).toBe(true);
    expect(master[0].items[1].required).toBe(false);   // master asli tidak berubah
  });
  it('hitungan penuh = setiap item punya angka (0 dihitung terisi)', () => {
    expect(isFullCount(master, { a: { qty: 1 }, b: { qty: 0 }, d: { qty: 5 } })).toBe(true);
    expect(isFullCount(master, { a: { qty: 1 }, b: { qty: null, skipped: true }, d: { qty: 5 } })).toBe(false);
    expect(isFullCount(master, { a: { qty: 1 } })).toBe(false);
    expect(isFullCount([], {})).toBe(false);
  });
});

describe('latestFullByMonth', () => {
  it('ambil hari penuh PALING AKHIR di tiap bulan', () => {
    const r = latestFullByMonth([
      { day: '2026-10-28' }, { day: '2026-10-31' }, { day: '2026-10-30' }, { day: '2026-09-30' }, { day: 'x' },
    ]);
    expect(r['2026-10'].day).toBe('2026-10-31');
    expect(r['2026-09'].day).toBe('2026-09-30');
    expect(Object.keys(r)).toHaveLength(2);
  });
});

describe('nilai stok', () => {
  it('salinan harga menang atas harga item sekarang; tanpa salinan memakai harga sekarang', () => {
    expect(priceOf({ unit_cost: 30000 }, { unit_cost: 38000 })).toBe(30000);
    expect(priceOf({ unit_cost: null }, { unit_cost: 38000 })).toBe(38000);
    expect(priceOf({}, {})).toBeNull();
    expect(priceOf({ unit_cost: 0 }, { unit_cost: 38000 })).toBe(0);   // harga 0 yang disalin tetap sah
  });
  it('total = jumlah × harga per item, dibulatkan; item tanpa harga dihitung sebagai missing', () => {
    const items = [{ id: 'a', unit_cost: 38000 }, { id: 'b', unit_cost: 22000 }, { id: 'd', unit_cost: null }];
    const counts = [
      { item_id: 'a', qty: 12.5, unit_cost: null },       // 475.000
      { item_id: 'b', qty: 6, unit_cost: 21000 },         // 126.000 (harga salinan)
      { item_id: 'd', qty: 240 },                          // belum ada harga
    ];
    expect(opnameValue(counts, items)).toEqual({ total: 601000, missing: 1 });
  });
  it('stok 0 atau kosong tidak dihitung dan tidak dianggap kurang harga', () => {
    const items = [{ id: 'd', unit_cost: null }];
    expect(opnameValue([{ item_id: 'd', qty: 0 }, { item_id: 'd', qty: null }], items)).toEqual({ total: 0, missing: 0 });
  });
  it('uang tetap bilangan bulat', () => {
    expect(opnameValue([{ item_id: 'a', qty: 0.333 }], [{ id: 'a', unit_cost: 1000 }]).total).toBe(333);
    expect(Number.isInteger(opnameValue([{ item_id: 'a', qty: 1.2345 }], [{ id: 'a', unit_cost: 777 }]).total)).toBe(true);
  });
});

describe('opnameGroups / itemsWithoutPrice', () => {
  it('rincian per kategori mengikuti urutan master dan hanya item berangka', () => {
    const g = opnameGroups(master, [
      { item_id: 'b', qty: 2 }, { item_id: 'a', qty: 1, unit_cost: 40000 }, { item_id: 'd', qty: 3 },
    ]);
    expect(g.map((x) => x.category.id)).toEqual(['c1', 'c2']);
    expect(g[0].rows.map((r) => [r.item.id, r.price, r.value])).toEqual([['a', 40000, 40000], ['b', 22000, 44000]]);
    expect(g[0].subtotal).toBe(84000);
    expect(g[1].rows[0]).toMatchObject({ price: null, value: 0 });
  });
  it('item tanpa harga dihitung dari master', () => {
    expect(itemsWithoutPrice(master.flatMap((c) => c.items)).map((i) => i.id)).toEqual(['d']);
    expect(itemsWithoutPrice([{ id: 'x', unit_cost: 0 }])).toEqual([]);   // 0 = sengaja gratis, bukan "belum diisi"
  });
});

describe('bulan dan Income Statement', () => {
  it('recentMonths = bulan berjalan lalu mundur', () => {
    expect(recentMonths('2026-11', 3)).toEqual(['2026-11', '2026-10', '2026-09']);
    expect(recentMonths('2026-01', 2)).toEqual(['2026-01', '2025-12']);
  });
  it('statementStock: awal = akhir bulan lalu, akhir = bulan ini; tanpa hitungan = null', () => {
    const values = { '2026-09': 3800000, '2026-10': 4500000 };
    expect(statementStock(values, '2026-10')).toEqual({ awal: 3800000, akhir: 4500000 });
    expect(statementStock(values, '2026-11')).toEqual({ awal: 4500000, akhir: null });
    expect(statementStock(values, '2026-08')).toEqual({ awal: null, akhir: null });
    expect(statementStock({ '2026-09': 0 }, '2026-10')).toEqual({ awal: 0, akhir: null });   // 0 = sudah dihitung nol
  });
});

describe('calendarCells', () => {
  it('Oktober 2026 mulai Kamis: 3 kotak kosong lalu 31 tanggal (minggu mulai Senin)', () => {
    const c = calendarCells('2026-10');
    expect(c.slice(0, 3)).toEqual([null, null, null]);
    expect(c[3]).toBe('2026-10-01');
    expect(c.at(-1)).toBe('2026-10-31');
    expect(c).toHaveLength(34);
  });
  it('bulan yang mulai Senin tanpa kotak kosong; Minggu = 6 kotak kosong', () => {
    expect(calendarCells('2026-06')[0]).toBe('2026-06-01');   // 1 Jun 2026 = Senin
    expect(calendarCells('2026-11').slice(0, 6).every((x) => x === null)).toBe(true);   // 1 Nov 2026 = Minggu
    expect(calendarCells('2026-11')[6]).toBe('2026-11-01');
  });
});
