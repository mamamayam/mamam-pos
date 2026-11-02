import { describe, it, expect } from 'vitest';
import { suggestShoppingItems, addCustomItem, checkedCount, shoppingText, isLeftoverCategory } from './shoppingList';
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

describe('suggestShoppingItems', () => {
  it('hanya Habis dan Menipis; yang Aman tidak ikut', () => {
    const names = suggestShoppingItems(groups).map((i) => i.name);
    expect(names).not.toContain('Lunchbox L');
    expect(names).toEqual(expect.arrayContaining(['BLD', 'Karkas/Classic', 'Lunchbox M', 'Sendok']));
  });
  it('item belanja dicentang dan didahulukan; sisa masak di bawah dan tidak dicentang', () => {
    const list = suggestShoppingItems(groups);
    const bought = list.filter((i) => i.checked).map((i) => i.id);
    expect(bought).toEqual(['r1', 'r3', 'p2', 'p3']);
    const tail = list.slice(bought.length);
    expect(tail.map((i) => i.id)).toEqual(['m1', 'm2']);
    expect(tail.every((i) => !i.checked)).toBe(true);
  });
  it('Wings mentah yang Aman tidak ikut walau namanya sama dengan Wings matang yang habis', () => {
    const wings = suggestShoppingItems(groups).filter((i) => i.name === 'Wings');
    expect(wings).toHaveLength(1);
    expect(wings[0].category).toBe('Ayam Matang Sisa');
  });
  it('tanpa data = daftar kosong', () => {
    expect(suggestShoppingItems()).toEqual([]);
    expect(suggestShoppingItems([])).toEqual([]);
  });
});

describe('addCustomItem', () => {
  const base = suggestShoppingItems(groups);
  it('menambah item baru yang langsung dicentang', () => {
    const next = addCustomItem(base, '  Kantong   kresek ');
    const added = next[next.length - 1];
    expect(added).toMatchObject({ name: 'Kantong kresek', checked: true, custom: true, qty: '' });
    expect(next).toHaveLength(base.length + 1);
  });
  it('nama kosong tidak mengubah apa pun', () => {
    expect(addCustomItem(base, '   ')).toBe(base);
    expect(addCustomItem(base, undefined)).toBe(base);
  });
  it('nama yang sudah ada hanya dicentang, tidak dobel', () => {
    const next = addCustomItem(base, 'sendok');
    expect(next).toHaveLength(base.length);
    expect(next.find((i) => i.id === 'p3').checked).toBe(true);
    const leftover = addCustomItem(base, 'mamam');
    expect(leftover.find((i) => i.id === 'm1').checked).toBe(true);
  });
  it('nama sama dua kali tidak dobel', () => {
    const once = addCustomItem(base, 'Kresek');
    expect(addCustomItem(once, 'KRESEK')).toHaveLength(once.length);
  });
});

describe('shoppingText', () => {
  it('hanya item tercentang, bernomor, dengan jumlah bila diisi', () => {
    const list = suggestShoppingItems(groups).map((i) => (i.id === 'r1' ? { ...i, qty: '5 kg' } : i));
    expect(shoppingText(list, 'Sel, 3 Nov')).toBe(
      ['*Belanja MamamAyam*', 'Sel, 3 Nov', '', '1. BLD - 5 kg', '2. Karkas/Classic', '3. Lunchbox M', '4. Sendok'].join('\n'),
    );
  });
  it('item yang tidak dicentang tidak ikut; jumlah hanya spasi dianggap kosong', () => {
    const list = suggestShoppingItems(groups).map((i) => (i.id === 'p2' ? { ...i, checked: false } : i.id === 'p3' ? { ...i, qty: '   ' } : i));
    const text = shoppingText(list);
    expect(text).not.toContain('Lunchbox M');
    expect(text).toContain('3. Sendok');
    expect(text).not.toContain('Sendok -');
  });
  it('tanpa tanggal: baris tanggal tidak ada', () => {
    expect(shoppingText([{ id: 'a', name: 'A', checked: true, qty: '' }]).split('\n')).toEqual(['*Belanja MamamAyam*', '', '1. A']);
  });
  it('tidak ada yang dicentang: keterangan kosong, bukan daftar kosong', () => {
    const none = suggestShoppingItems(groups).map((i) => ({ ...i, checked: false }));
    expect(shoppingText(none, 'Sel, 3 Nov')).toContain('Belum ada item dipilih.');
  });
  it('item tambahan dengan jumlah ikut di teks', () => {
    const list = addCustomItem([], 'Kantong kresek').map((i) => ({ ...i, qty: '2 pak' }));
    expect(shoppingText(list)).toContain('1. Kantong kresek - 2 pak');
  });
});

describe('checkedCount', () => {
  it('menghitung item tercentang', () => {
    const list = suggestShoppingItems(groups);
    expect(checkedCount(list)).toBe(4);
    expect(checkedCount([])).toBe(0);
  });
});
