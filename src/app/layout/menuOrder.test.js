import { describe, it, expect } from 'vitest';
import {
  orderMenus, moveId, itemAtPoint, normalizeLayout, resolveMenuLayout, togglePin, moveCompact, moveExpanded,
  readMenuLayout, saveMenuLayout, clearMenuOrder, DEFAULT_PINNED_COUNT,
} from './menuOrder';

const items = ['a', 'b', 'c', 'd'].map((id) => ({ id, label: id.toUpperCase() }));
const ids = (list) => list.map((i) => i.id);
const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('orderMenus', () => {
  it('tanpa urutan tersimpan = urutan bawaan', () => {
    expect(ids(orderMenus(items, null))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(orderMenus(items, []))).toEqual(['a', 'b', 'c', 'd']);
  });
  it('mengikuti urutan tersimpan', () => {
    expect(ids(orderMenus(items, ['d', 'b', 'a', 'c']))).toEqual(['d', 'b', 'a', 'c']);
  });
  it('menu baru (belum tersimpan) ditaruh di belakang; id yang sudah tidak ada diabaikan; id ganda dibuang', () => {
    expect(ids(orderMenus(items, ['c', 'x', 'a', 'c']))).toEqual(['c', 'a', 'b', 'd']);
  });
  it('menu yang disembunyikan izin (tidak ada di items) tidak muncul walau ada di daftar tersimpan', () => {
    expect(ids(orderMenus(items.slice(0, 2), ['d', 'b', 'a']))).toEqual(['b', 'a']);
  });
});

describe('moveId', () => {
  it('pindah ke depan dan ke belakang, sisanya bergeser', () => {
    expect(moveId(['a', 'b', 'c', 'd'], 'd', 'a')).toEqual(['d', 'a', 'b', 'c']);
    expect(moveId(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });
  it('id sama / tak dikenal = tidak berubah', () => {
    const base = ['a', 'b', 'c'];
    expect(moveId(base, 'a', 'a')).toBe(base);
    expect(moveId(base, 'z', 'a')).toBe(base);
    expect(moveId(base, 'a', 'z')).toBe(base);
  });
  it('tidak mengubah array asli', () => {
    const base = ['a', 'b', 'c'];
    moveId(base, 'c', 'a');
    expect(base).toEqual(['a', 'b', 'c']);
  });
});

describe('itemAtPoint', () => {
  const rects = { a: { left: 0, right: 100, top: 0, bottom: 100 }, b: { left: 110, right: 210, top: 0, bottom: 100 } };
  it('mengenali elemen di bawah titik, null kalau di celah / di luar', () => {
    expect(itemAtPoint(rects, 50, 50)).toBe('a');
    expect(itemAtPoint(rects, 150, 20)).toBe('b');
    expect(itemAtPoint(rects, 105, 50)).toBeNull();
    expect(itemAtPoint(rects, 500, 500)).toBeNull();
  });
});

describe('normalizeLayout', () => {
  it('array lama = urutan penuh dengan ringkas bawaan; objek baru dibaca apa adanya; sampah = null', () => {
    expect(normalizeLayout(['b', 'a'])).toEqual({ pinned: null, full: ['b', 'a'] });
    expect(normalizeLayout({ pinned: ['a'], full: ['b', 'a'] })).toEqual({ pinned: ['a'], full: ['b', 'a'] });
    expect(normalizeLayout({ pinned: ['a', 5], full: null })).toEqual({ pinned: ['a'], full: null });
    expect(normalizeLayout({ pinned: [], full: null })).toEqual({ pinned: [], full: null });   // semua di Lainnya = pilihan sah
    expect(normalizeLayout(null)).toBeNull();
    expect(normalizeLayout('rusak')).toBeNull();
    expect(normalizeLayout({ x: 1 })).toBeNull();
  });
});

describe('resolveMenuLayout', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => ({ id, label: id.toUpperCase() }));
  it('tanpa tata letak: ringkas = menu pertama sebanyak bawaan, diperluas = urutan bawaan', () => {
    const r = resolveMenuLayout(many, null);
    expect(ids(r.compact)).toEqual(['a', 'b', 'c', 'd', 'e'].slice(0, DEFAULT_PINNED_COUNT));
    expect(ids(r.expanded)).toEqual(ids(many));
    expect(ids(r.hidden)).toEqual(['f', 'g', 'h']);
  });
  it('format lama (hanya full): ringkas = menu pertama dari urutan lama', () => {
    const r = resolveMenuLayout(many, { pinned: null, full: ['h', 'g', 'a'] });
    expect(ids(r.compact)).toEqual(['h', 'g', 'a', 'b', 'c']);
    expect(ids(r.expanded)).toEqual(['h', 'g', 'a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('pinned diatur sendiri: ringkas mengikuti urutannya; full belum diatur = ringkas dulu lalu sisanya (urutan atas tidak berubah)', () => {
    const r = resolveMenuLayout(many, { pinned: ['g', 'b'], full: null });
    expect(ids(r.compact)).toEqual(['g', 'b']);
    expect(ids(r.expanded)).toEqual(['g', 'b', 'a', 'c', 'd', 'e', 'f', 'h']);
    expect(ids(r.hidden)).toEqual(['a', 'c', 'd', 'e', 'f', 'h']);
  });
  it('pinned dan full diatur terpisah: dua urutan berbeda', () => {
    const r = resolveMenuLayout(many, { pinned: ['c', 'a'], full: ['h', 'a', 'c', 'b', 'd', 'e', 'f', 'g'] });
    expect(ids(r.compact)).toEqual(['c', 'a']);
    expect(ids(r.expanded)).toEqual(['h', 'a', 'c', 'b', 'd', 'e', 'f', 'g']);
    expect(ids(r.hidden)).toEqual(['h', 'b', 'd', 'e', 'f', 'g']);
  });
  it('pinned kosong = semua di Lainnya; semua di-pin = hidden kosong', () => {
    expect(resolveMenuLayout(many, { pinned: [], full: null }).compact).toEqual([]);
    expect(resolveMenuLayout(many, { pinned: ids(many), full: null }).hidden).toEqual([]);
  });
  it('menu tak berizin / sudah tak ada diabaikan, menu baru masuk Lainnya', () => {
    const few = many.slice(0, 4);
    const r = resolveMenuLayout(few, { pinned: ['z', 'd', 'a', 'a'], full: ['z', 'd'] });
    expect(ids(r.compact)).toEqual(['d', 'a']);
    expect(ids(r.expanded)).toEqual(['d', 'a', 'b', 'c']);   // full: d, lalu menu yang tak tersimpan di belakang
    expect(ids(r.hidden)).toEqual(['b', 'c']);
  });
});

describe('mengedit tata letak', () => {
  const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, label: id.toUpperCase() }));
  it('togglePin: lepas pin memindah ke Lainnya, pin baru di akhir ringkas; urutan diperluas yang sudah diatur tidak berubah', () => {
    const l1 = togglePin(many, null, 'b');
    expect(l1).toEqual({ pinned: ['a', 'c', 'd', 'e'], full: null });
    const l2 = togglePin(many, l1, 'g');
    expect(l2.pinned).toEqual(['a', 'c', 'd', 'e', 'g']);
    const custom = { pinned: ['a'], full: ['g', 'f', 'a', 'b', 'c', 'd', 'e'] };
    expect(togglePin(many, custom, 'f').full).toEqual(custom.full);
  });
  it('moveCompact hanya mengubah urutan ringkas, bukan urutan diperluas yang sudah diatur', () => {
    const custom = { pinned: ['a', 'b', 'c'], full: ['g', 'f', 'e', 'd', 'c', 'b', 'a'] };
    const next = moveCompact(many, custom, 'c', 'a');
    expect(next.pinned).toEqual(['c', 'a', 'b']);
    expect(next.full).toEqual(custom.full);
  });
  it('moveExpanded mengunci ringkas dulu supaya menu atas tidak ikut bergeser', () => {
    const next = moveExpanded(many, null, 'g', 'a');
    expect(next.pinned).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(next.full).toEqual(['g', 'a', 'b', 'c', 'd', 'e', 'f']);
    const r = resolveMenuLayout(many, next);
    expect(ids(r.compact)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(ids(r.expanded)).toEqual(['g', 'a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('urutan ringkas dan diperluas bisa berbeda sekaligus', () => {
    let l = moveCompact(many, null, 'e', 'a');          // ringkas: e a b c d
    l = moveExpanded(many, l, 'f', 'e');                // diperluas: f e a b c d g
    const r = resolveMenuLayout(many, l);
    expect(ids(r.compact)).toEqual(['e', 'a', 'b', 'c', 'd']);
    expect(ids(r.expanded)).toEqual(['f', 'e', 'a', 'b', 'c', 'd', 'g']);
  });
});

describe('simpan / baca per peran', () => {
  it('terpisah per peran, bisa dihapus, tahan data rusak, dan membaca format array lama', () => {
    const s = fakeStorage();
    expect(readMenuLayout('owner', s)).toBeNull();
    saveMenuLayout('owner', { pinned: ['b'], full: ['b', 'a'] }, s);
    saveMenuLayout('staff', { pinned: null, full: ['c'] }, s);
    expect(readMenuLayout('owner', s)).toEqual({ pinned: ['b'], full: ['b', 'a'] });
    expect(readMenuLayout('staff', s)).toEqual({ pinned: null, full: ['c'] });
    clearMenuOrder('owner', s);
    expect(readMenuLayout('owner', s)).toBeNull();
    s.setItem('mamam-pos-menu-order:staff', '{rusak');
    expect(readMenuLayout('staff', s)).toBeNull();
    s.setItem('mamam-pos-menu-order:owner', JSON.stringify(['x', 'y']));   // format lama
    expect(readMenuLayout('owner', s)).toEqual({ pinned: null, full: ['x', 'y'] });
  });
});
