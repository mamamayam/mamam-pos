import { describe, it, expect } from 'vitest';
import {
  businessDate, stockStatus, parseQty, formatQty, stockRows, sortByStatus, countByStatus, filterRows, shareText,
  itemOk, dayLabel, categoryProgress, categoryReady, gatingCategories, saveCheck, moveId, daySummary,
} from './stockMath';

const item = (id, o = {}) => ({ id, name: id.toUpperCase(), unit: 'pcs', min_qty: 0, required: true, ...o });
const master = [
  { id: 'c1', name: 'Minuman', items: [item('a', { min_qty: 5 }), item('b', { min_qty: 2 }), item('c', { required: false })] },
  { id: 'c2', name: 'Kulkas', items: [item('d', { min_qty: 3 })] },
  { id: 'c3', name: 'Opsional', items: [item('e', { required: false })] },
];

describe('businessDate (hari bisnis mulai 04.00 WIB)', () => {
  it('siang WIB = tanggal yang sama', () => expect(businessDate(new Date('2026-10-26T05:00:00Z'))).toBe('2026-10-26'));   // 12.00 WIB
  it('lewat tengah malam WIB masih hari kemarin', () => expect(businessDate(new Date('2026-10-26T18:30:00Z'))).toBe('2026-10-26')); // 01.30 WIB 27 Okt
  it('03.59 WIB masih kemarin, 04.00 WIB hari baru', () => {
    expect(businessDate(new Date('2026-10-26T20:59:00Z'))).toBe('2026-10-26');   // 03.59 WIB
    expect(businessDate(new Date('2026-10-26T21:00:00Z'))).toBe('2026-10-27');   // 04.00 WIB
  });
  it('menerima milidetik', () => expect(businessDate(Date.parse('2026-12-31T21:00:00Z'))).toBe('2027-01-01'));
});

describe('stockStatus', () => {
  it('Habis / Menipis / Aman / Belum', () => {
    expect(stockStatus(0, 5)).toBe('habis');
    expect(stockStatus(1, 5)).toBe('menipis');
    expect(stockStatus(5, 5)).toBe('menipis');   // sama dengan batas = Menipis
    expect(stockStatus(6, 5)).toBe('aman');
    expect(stockStatus(null, 5)).toBe('belum');
    expect(stockStatus(undefined, 5)).toBe('belum');
  });
  it('batas 0: hanya Habis atau Aman', () => {
    expect(stockStatus(0, 0)).toBe('habis');
    expect(stockStatus(1, 0)).toBe('aman');
  });
  it('desimal', () => expect(stockStatus(0.5, 1)).toBe('menipis'));
});

describe('parseQty / formatQty', () => {
  it('parse', () => {
    expect(parseQty('12')).toBe(12);
    expect(parseQty('2,5')).toBe(2.5);
    expect(parseQty(' 0 ')).toBe(0);
    expect(parseQty('')).toBeNull();
    expect(parseQty('-1')).toBeNull();
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('1.2.3')).toBeNull();
  });
  it('format', () => { expect(formatQty(2.5)).toBe('2,5'); expect(formatQty(3)).toBe('3'); expect(formatQty(null)).toBe(''); });
});

describe('ringkasan stok', () => {
  const latest = { a: { qty: 0 }, b: { qty: 2 }, c: { qty: 9 }, d: { qty: 10, day: '2026-10-25', saved_by: 'Dewi' } };
  const rows = stockRows(master, latest);
  it('satu baris per item, urutan master', () => expect(rows.map((r) => r.item.id)).toEqual(['a', 'b', 'c', 'd', 'e']));
  it('status per item', () => expect(rows.map((r) => r.status)).toEqual(['habis', 'menipis', 'aman', 'aman', 'belum']));
  it('metadata hari dan penyimpan', () => { expect(rows[3].day).toBe('2026-10-25'); expect(rows[3].savedBy).toBe('Dewi'); });
  it('sortByStatus stabil', () => expect(sortByStatus(rows).map((r) => r.item.id)).toEqual(['a', 'b', 'c', 'd', 'e']));
  it('sortByStatus mengurutkan', () => {
    const r = stockRows(master, { a: { qty: 50 }, b: { qty: 0 }, d: { qty: 1 } });
    expect(sortByStatus(r).map((x) => x.item.id)).toEqual(['b', 'd', 'a', 'c', 'e']);
  });
  it('countByStatus', () => expect(countByStatus(rows)).toEqual({ habis: 1, menipis: 1, aman: 2, belum: 1 }));
  it('filterRows', () => {
    expect(filterRows(rows, 'semua')).toHaveLength(5);
    expect(filterRows(rows, 'menipis').map((r) => r.item.id)).toEqual(['b']);
    expect(filterRows(rows, 'habis').map((r) => r.item.id)).toEqual(['a']);
    expect(filterRows(rows, 'belum').map((r) => r.item.id)).toEqual(['e']);
  });
  it('shareText: hanya item sesuai filter, dikelompokkan per kategori', () => {
    expect(shareText(rows, 'menipis', 'Sen, 26 Okt')).toBe('Stok Belanja — Menipis (Sen, 26 Okt) · 1 item\n\nMinuman\n- B: 2 pcs');
    expect(shareText(rows, 'habis')).toBe('Stok Belanja — Habis · 1 item\n\nMinuman\n- A: 0 pcs');
    expect(shareText(rows, 'belum')).toBe('Stok Belanja — Belum dicek · 1 item\n\nOpsional\n- E');
  });
  it('shareText semua: semua item per kategori dengan status', () => {
    expect(shareText(rows, 'semua')).toBe(
      'Stok Belanja — Semua item · 5 item\n\nMinuman\n- A: 0 pcs (habis)\n- B: 2 pcs (menipis)\n- C: 9 pcs (aman)\n\nKulkas\n- D: 10 pcs (aman)\n\nOpsional\n- E',
    );
  });
  it('shareText tanpa item', () => {
    expect(shareText(rows, 'habis').includes('Menipis')).toBe(false);
    expect(shareText(stockRows(master, { a: { qty: 99 } }), 'habis')).toBe('Stok Belanja — Habis\nTidak ada item.');
  });
});

describe('kelengkapan isian', () => {
  it('itemOk: angka, atau dilewati hanya untuk opsional', () => {
    expect(itemOk(master[0].items[0], { qty: 0 })).toBe(true);
    expect(itemOk(master[0].items[0], { qty: null, skipped: true })).toBe(false);   // wajib tidak boleh dilewati
    expect(itemOk(master[0].items[2], { qty: null, skipped: true })).toBe(true);
    expect(itemOk(master[0].items[2], undefined)).toBe(false);
  });
  it('categoryProgress menghitung item wajib saja', () => {
    expect(categoryProgress(master[0], { a: { qty: 1 }, c: { qty: 4 } })).toEqual({ filled: 1, total: 2 });
    expect(categoryReady(master[0], { a: { qty: 1 }, b: { qty: 0 } })).toBe(true);
    expect(categoryReady(master[2], {})).toBe(true);   // tanpa item wajib = langsung siap
  });
  it('gatingCategories', () => expect(gatingCategories(master).map((c) => c.id)).toEqual(['c1', 'c2']));
  it('saveCheck', () => {
    const full = { a: { qty: 1 }, b: { qty: 1 }, d: { qty: 1 } };
    expect(saveCheck(master, full, ['c1', 'c2'])).toEqual({ ok: true, reason: '' });
    expect(saveCheck(master, full, ['c1']).reason).toMatch(/1 kategori belum/);
    expect(saveCheck(master, { a: { qty: 1 }, d: { qty: 1 } }, ['c1', 'c2']).reason).toMatch(/1 item wajib/);
    expect(saveCheck([{ id: 'x', name: 'X', items: [item('z', { required: false })] }], {}, []).ok).toBe(false);
  });
});

describe('moveId', () => {
  it('geser naik / turun', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveId(['a', 'b', 'c'], 'b', 1)).toEqual(['a', 'c', 'b']);
  });
  it('ujung dan id asing tidak berubah', () => {
    const ids = ['a', 'b'];
    expect(moveId(ids, 'a', -1)).toBe(ids);
    expect(moveId(ids, 'b', 1)).toBe(ids);
    expect(moveId(ids, 'z', 1)).toBe(ids);
  });
});

describe('daySummary (riwayat)', () => {
  it('hanya menghitung item yang punya isian hari itu', () => {
    const s = daySummary(master, [{ item_id: 'a', qty: 0 }, { item_id: 'b', qty: 1 }, { item_id: 'd', qty: 20 }, { item_id: 'c', qty: null }]);
    expect(s).toEqual({ habis: 1, menipis: 1, aman: 1, belum: 0 });
  });
});

describe('dayLabel', () => {
  it('format singkat', () => { expect(dayLabel('2026-10-25')).toBe('Min, 25 Okt'); expect(dayLabel('2027-01-01')).toBe('Jum, 1 Jan'); });
  it('tidak valid = kosong', () => { expect(dayLabel('')).toBe(''); expect(dayLabel('x')).toBe(''); });
});
