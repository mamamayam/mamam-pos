import { describe, it, expect } from 'vitest';
import { findRowId, addExtra, selectedGroups, countSelected, shoppingText } from './shoppingList';
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
  { item_id: 'p1', qty: 50 }, { item_id: 'p2', qty: 18 }, { item_id: 'p3', qty: 2.5 },
];
const groups = dayItems(master, counts).groups;
const pick = (...ids) => Object.fromEntries(ids.map((id) => [id, true]));

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
    expect(addExtra([], '  Kantong   kresek ')).toEqual([{ id: 'x:kantong kresek', name: 'Kantong kresek', on: true }]);
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

describe('selectedGroups', () => {
  it('tidak ada centang otomatis: tanpa pilihan = kosong', () => {
    expect(selectedGroups(groups, {}, [])).toEqual([]);
    expect(selectedGroups()).toEqual([]);
  });
  it('dikelompokkan per kategori sesuai urutan daftar; tiap item membawa sisa stoknya', () => {
    const out = selectedGroups(groups, pick('p3', 'r1', 'r3'));
    expect(out).toEqual([
      [{ id: 'r1', name: 'BLD', stock: '0 gr' }, { id: 'r3', name: 'Karkas/Classic', stock: '4 porsi' }],
      [{ id: 'p3', name: 'Sendok', stock: '2,5 pcs' }],
    ]);
  });
  it('kategori tanpa item terpilih tidak muncul; item aman atau sisa masak bisa dicentang manual', () => {
    const out = selectedGroups(groups, pick('m1', 'p1'));
    expect(out).toHaveLength(2);
    expect(out[0][0].name).toBe('Mamam');
    expect(out[1][0].name).toBe('Lunchbox L');
  });
  it('item tambahan jadi kelompok terakhir tanpa keterangan stok; yang tidak dicentang tidak ikut', () => {
    const extras = [{ id: 'x:kresek', name: 'Kresek', on: true }, { id: 'x:plastik', name: 'Plastik', on: false }];
    const out = selectedGroups(groups, pick('r1'), extras);
    expect(out).toHaveLength(2);
    expect(out[1]).toEqual([{ id: 'x:kresek', name: 'Kresek', stock: null }]);
  });
  it('hanya item tambahan: satu kelompok saja', () => {
    expect(selectedGroups([], {}, addExtra([], 'Kresek'))).toEqual([[{ id: 'x:kresek', name: 'Kresek', stock: null }]]);
  });
});

describe('countSelected', () => {
  it('menjumlahkan item di semua kelompok', () => {
    expect(countSelected(selectedGroups(groups, pick('r1', 'r3', 'p3')))).toBe(3);
    expect(countSelected([])).toBe(0);
  });
});

describe('shoppingText', () => {
  it('tiap item membawa sisa stok; kategori dipisah satu baris kosong tanpa nama kategori', () => {
    const text = shoppingText(selectedGroups(groups, pick('r1', 'r3', 'p2', 'p3')), 'Sel, 3 Nov');
    expect(text).toBe([
      '*Belanja MamamAyam*',
      'Sel, 3 Nov',
      '',
      '1. BLD (sisa 0 gr)',
      '2. Karkas/Classic (sisa 4 porsi)',
      '',
      '1. Lunchbox M (sisa 18 pcs)',
      '2. Sendok (sisa 2,5 pcs)',
    ].join('\n'));
  });
  it('nama kategori tidak ikut ke teks', () => {
    const text = shoppingText(selectedGroups(groups, pick('r1', 'p3')));
    expect(text).not.toContain('Ayam Mentah');
    expect(text).not.toContain('Packaging');
  });
  it('antar kelompok tepat satu baris kosong (enter dua kali), tidak lebih', () => {
    const text = shoppingText(selectedGroups(groups, pick('r1', 'p3')));
    expect(text).not.toMatch(/\n\n\n/);
    expect(text.split('\n\n')).toHaveLength(3);   // judul, kelompok 1, kelompok 2
  });
  it('item tambahan dipisah sendiri di akhir dan tanpa keterangan sisa', () => {
    const text = shoppingText(selectedGroups(groups, pick('r1'), addExtra([], 'Kantong kresek')));
    expect(text.endsWith('1. BLD (sisa 0 gr)\n\n1. Kantong kresek')).toBe(true);
    expect(text).not.toContain('Kantong kresek (sisa');
  });
  it('tanpa tanggal: baris tanggal tidak ada', () => {
    expect(shoppingText(selectedGroups(groups, pick('p3'))).split('\n')).toEqual(['*Belanja MamamAyam*', '', '1. Sendok (sisa 2,5 pcs)']);
  });
  it('tidak ada yang dipilih: keterangan, bukan teks kosong', () => {
    expect(shoppingText([], 'Sel, 3 Nov')).toContain('Belum ada item dipilih.');
  });
});
