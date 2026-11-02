import { describe, it, expect } from 'vitest';
import { isLeftoverCategory, initialSelection, findRowId, addExtra, selectedItems, shoppingText } from './shoppingList';
import { dayItems } from './stockMath';

const item = (id, name, unit, min = 0) => ({ id, name, unit, min_qty: min, required: true });
const master = [
  { id: 'c1', name: 'Ayam Matang Sisa', items: [item('m1', 'Mamam', 'porsi'), item('m2', 'Wings', 'pasang')] },
  { id: 'c2', name: 'Ayam Mentah', items: [item('r1', 'BLD', 'gr'), item('r2', 'Wings', 'porsi', 3), item('r3', 'Karkas/Classic', 'porsi', 5)] },
  { id: 'c3', name: 'Packaging', items: [item('p1', 'Lunchbox L', 'pcs', 20), item('p2', 'Lunchbox M', 'pcs', 20), item('p3', 'Sendok', 'pcs', 60)] },
];
const counts = [
  { item_id: 'm1', qty: 0 }, { item_id: 'm2', qty: 0 },
  { item_id: 'r1', qty: 0 }, { item_id: 'r2', qty: 6 }, { item_id: 'r3', qty: 4 },
  { item_id: 'p1', qty: 50 }, { item_id: 'p2', qty: 18 }, { item_id: 'p3', qty: 50 },
];
const groups = dayItems(master, counts).groups;

describe('isLeftoverCategory', () => {
  it('mengenali kategori sisa masak tanpa peduli huruf besar/kecil', () => {
    expect(isLeftoverCategory('Ayam Matang Sisa')).toBe(true);
    expect(isLeftoverCategory('AYAM MATANG SISA')).toBe(true);
    expect(isLeftoverCategory('Ayam Mentah')).toBe(false);
    expect(isLeftoverCategory(undefined)).toBe(false);
  });
});

describe('initialSelection', () => {
  it('mencentang item Habis dan Menipis di kategori belanja saja', () => {
    expect(Object.keys(initialSelection(groups)).sort()).toEqual(['p2', 'p3', 'r1', 'r3']);
  });
  it('yang Aman dan sisa masak tidak dicentang; jumlah awal kosong', () => {
    const sel = initialSelection(groups);
    expect(sel.p1).toBeUndefined();   // Lunchbox L aman
    expect(sel.r2).toBeUndefined();   // Wings mentah aman
    expect(sel.m1).toBeUndefined();   // Mamam matang habis, tapi sisa masak
    expect(sel.r1).toEqual({ on: true, qty: '' });
  });
  it('tanpa data = kosong', () => {
    expect(initialSelection()).toEqual({});
    expect(initialSelection([])).toEqual({});
  });
});

describe('findRowId', () => {
  it('mencari item stok menurut nama tanpa peduli huruf besar/kecil dan spasi ganda', () => {
    expect(findRowId(groups, 'sendok')).toBe('p3');
    expect(findRowId(groups, '  lunchbox   m ')).toBe('p2');
  });
  it('nama tidak dikenal atau kosong = null', () => {
    expect(findRowId(groups, 'Kantong kresek')).toBeNull();
    expect(findRowId(groups, '   ')).toBeNull();
    expect(findRowId(groups, undefined)).toBeNull();
  });
});

describe('addExtra', () => {
  it('menambah item baru yang langsung dicentang, nama dirapikan', () => {
    const next = addExtra([], '  Kantong   kresek ');
    expect(next).toEqual([{ id: 'x:kantong kresek', name: 'Kantong kresek', on: true, qty: '' }]);
  });
  it('nama kosong tidak mengubah apa pun', () => {
    const base = [];
    expect(addExtra(base, '   ')).toBe(base);
    expect(addExtra(base, undefined)).toBe(base);
  });
  it('nama sama (beda huruf besar/kecil) tidak dobel, hanya dicentang lagi', () => {
    const off = addExtra([], 'Kresek').map((e) => ({ ...e, on: false }));
    const next = addExtra(off, 'KRESEK');
    expect(next).toHaveLength(1);
    expect(next[0].on).toBe(true);
  });
});

describe('selectedItems', () => {
  it('mengikuti urutan daftar stok, lalu item tambahan; hanya yang dicentang', () => {
    const sel = { ...initialSelection(groups), r1: { on: true, qty: '5 kg' }, p2: { on: false, qty: '' } };
    const extras = [{ id: 'x:kresek', name: 'Kresek', on: true, qty: '2 pak' }, { id: 'x:plastik', name: 'Plastik', on: false, qty: '' }];
    expect(selectedItems(groups, sel, extras)).toEqual([
      { id: 'r1', name: 'BLD', qty: '5 kg' },
      { id: 'r3', name: 'Karkas/Classic', qty: '' },
      { id: 'p3', name: 'Sendok', qty: '' },
      { id: 'x:kresek', name: 'Kresek', qty: '2 pak' },
    ]);
  });
  it('item aman atau sisa masak bisa dicentang manual dan ikut di urutan master', () => {
    const sel = { ...initialSelection(groups), m1: { on: true, qty: '' }, p1: { on: true, qty: '10' } };
    const names = selectedItems(groups, sel).map((i) => i.name);
    expect(names[0]).toBe('Mamam');
    expect(names).toContain('Lunchbox L');
  });
  it('tanpa pilihan = kosong', () => {
    expect(selectedItems(groups, {}, [])).toEqual([]);
    expect(selectedItems()).toEqual([]);
  });
});

describe('shoppingText', () => {
  it('bernomor, dengan jumlah bila diisi', () => {
    const sel = { ...initialSelection(groups), r1: { on: true, qty: '5 kg' } };
    expect(shoppingText(selectedItems(groups, sel), 'Sel, 3 Nov')).toBe(
      ['*Belanja MamamAyam*', 'Sel, 3 Nov', '', '1. BLD - 5 kg', '2. Karkas/Classic', '3. Lunchbox M', '4. Sendok'].join('\n'),
    );
  });
  it('jumlah hanya spasi dianggap kosong', () => {
    const text = shoppingText([{ id: 'a', name: 'Sendok', qty: '   ' }]);
    expect(text).toContain('1. Sendok');
    expect(text).not.toContain('Sendok -');
  });
  it('tanpa tanggal: baris tanggal tidak ada', () => {
    expect(shoppingText([{ id: 'a', name: 'A', qty: '' }]).split('\n')).toEqual(['*Belanja MamamAyam*', '', '1. A']);
  });
  it('tidak ada yang dipilih: keterangan, bukan teks kosong', () => {
    expect(shoppingText([], 'Sel, 3 Nov')).toContain('Belum ada item dipilih.');
  });
  it('item tambahan dengan jumlah ikut di teks', () => {
    const items = selectedItems([], {}, addExtra([], 'Kantong kresek').map((e) => ({ ...e, qty: '2 pak' })));
    expect(shoppingText(items)).toContain('1. Kantong kresek - 2 pak');
  });
});
