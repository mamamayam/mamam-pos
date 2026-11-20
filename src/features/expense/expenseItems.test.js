import { describe, it, expect } from 'vitest';
import {
  emptyRow, rowsFromNote, parseItems, rowsFromItems, pricedRows, filledRows, rowsTotal, isLocked, stripPrices, noteFromRows,
  buildExpenseDetail, itemsTotal, detailLines, itemsColumnMissing, MAX_ITEMS,
} from './expenseItems';

const rows = [
  { t: 'Ayam 5 kg', p: '190000' },
  { t: 'Minyak goreng 2 L', p: '36000' },
  { t: 'Bawang putih 1 kg', p: '38000' },
  { t: 'Plastik kresek', p: '' },
];

describe('baris form', () => {
  it('rowsFromNote memecah teks per baris, membuang yang kosong, minimal satu baris', () => {
    expect(rowsFromNote('Ayam 5 kg\n\n Bumbu \r\nMinyak')).toEqual([{ t: 'Ayam 5 kg', p: '' }, { t: 'Bumbu', p: '' }, { t: 'Minyak', p: '' }]);
    expect(rowsFromNote('')).toEqual([emptyRow()]);
    expect(rowsFromNote(null)).toEqual([emptyRow()]);
  });
  it('total hanya menjumlah baris berharga; baris tanpa harga diabaikan', () => {
    expect(pricedRows(rows)).toHaveLength(3);
    expect(rowsTotal(rows)).toBe(264000);
    expect(filledRows([...rows, emptyRow()])).toHaveLength(4);
  });
  it('harga 0 atau bukan angka dianggap tanpa harga', () => {
    expect(rowsTotal([{ t: 'a', p: '0' }, { t: 'b', p: '' }, { t: 'c', p: 'abc' }])).toBe(0);
  });
  it('terkunci hanya kalau saklar menyala DAN ada minimal satu baris berharga', () => {
    expect(isLocked(true, rows)).toBe(true);
    expect(isLocked(false, rows)).toBe(false);
    expect(isLocked(true, [{ t: 'a', p: '' }])).toBe(false);
  });
  it('stripPrices membuang harga tapi menjaga nama', () => {
    expect(stripPrices(rows).map((r) => r.p)).toEqual(['', '', '', '']);
    expect(stripPrices(rows).map((r) => r.t)).toEqual(rows.map((r) => r.t));
  });
  it('noteFromRows = nama item satu per baris (sama dengan format detail lama)', () => {
    expect(noteFromRows([...rows, emptyRow()])).toBe('Ayam 5 kg\nMinyak goreng 2 L\nBawang putih 1 kg\nPlastik kresek');
  });
});

describe('buildExpenseDetail', () => {
  it('ada harga: Jumlah = total, detail_items memuat SEMUA baris (yang tanpa harga price null), teks detail = nama saja', () => {
    expect(buildExpenseDetail({ priceMode: true, rows, manualAmount: '999' })).toEqual({
      amount: 264000,
      note: 'Ayam 5 kg\nMinyak goreng 2 L\nBawang putih 1 kg\nPlastik kresek',
      items: [
        { name: 'Ayam 5 kg', price: 190000 }, { name: 'Minyak goreng 2 L', price: 36000 },
        { name: 'Bawang putih 1 kg', price: 38000 }, { name: 'Plastik kresek', price: null },
      ],
    });
  });
  it('saklar mati: Jumlah manual, tanpa detail_items, harga yang tersisa di isian diabaikan', () => {
    expect(buildExpenseDetail({ priceMode: false, rows, manualAmount: '300000' })).toMatchObject({ amount: 300000, items: null });
  });
  it('saklar menyala tapi tak satu pun harga: Jumlah manual, tanpa detail_items', () => {
    expect(buildExpenseDetail({ priceMode: true, rows: [{ t: 'Ayam', p: '' }], manualAmount: '150000' })).toEqual({ amount: 150000, note: 'Ayam', items: null });
  });
  it('baris kosong dibuang dari detail_items', () => {
    const r = buildExpenseDetail({ priceMode: true, rows: [{ t: 'Ayam', p: '5000' }, emptyRow()], manualAmount: '' });
    expect(r.items).toEqual([{ name: 'Ayam', price: 5000 }]);
  });
  it('harga tanpa nama ditolak dengan nomor baris', () => {
    expect(() => buildExpenseDetail({ priceMode: true, rows: [{ t: 'Ayam', p: '5000' }, { t: '', p: '2000' }], manualAmount: '' })).toThrow('Baris 2: isi nama item yang berharga.');
  });
  it('batas baris dan batas total', () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, (_, i) => ({ t: `Item ${i}`, p: '1' }));
    expect(() => buildExpenseDetail({ priceMode: true, rows: many, manualAmount: '' })).toThrow(/maksimal/);
    expect(() => buildExpenseDetail({ priceMode: true, rows: [{ t: 'a', p: '1500000000' }, { t: 'b', p: '1500000000' }], manualAmount: '' })).toThrow(/terlalu besar/);
  });
});

describe('baca dari database', () => {
  it('parseItems menerima array atau teks JSON; rusak / tanpa satu pun harga = null', () => {
    const raw = [{ name: 'Ayam', price: 190000 }, { name: 'Kresek', price: null }];
    expect(parseItems(raw)).toEqual(raw);
    expect(parseItems(JSON.stringify(raw))).toEqual(raw);
    expect(parseItems('bukan json')).toBeNull();
    expect(parseItems(null)).toBeNull();
    expect(parseItems({})).toBeNull();
    expect(parseItems([{ name: 'Kresek', price: null }])).toBeNull();
  });
  it('parseItems merapikan harga bukan angka dan baris kosong', () => {
    expect(parseItems([{ name: ' Ayam ', price: '5000' }, { name: '', price: 0 }, { name: 'X', price: -5 }])).toEqual([{ name: 'Ayam', price: 5000 }, { name: 'X', price: null }]);
  });
  it('rowsFromItems mengembalikan baris form, atau null kalau tidak ada rincian harga', () => {
    expect(rowsFromItems([{ name: 'Ayam', price: 190000 }, { name: 'Kresek', price: null }])).toEqual([{ t: 'Ayam', p: '190000' }, { t: 'Kresek', p: '' }]);
    expect(rowsFromItems(null)).toBeNull();
  });
  it('itemsTotal dan detailLines untuk layar Detail', () => {
    const items = [{ name: 'Ayam', price: 190000 }, { name: 'Kresek', price: null }];
    expect(itemsTotal(items)).toBe(190000);
    expect(detailLines('abaikan', items)).toEqual([{ text: 'Ayam', price: 190000 }, { text: 'Kresek', price: null }]);
    expect(detailLines('Bumbu\nMinyak', null)).toEqual([{ text: 'Bumbu', price: null }, { text: 'Minyak', price: null }]);
    expect(detailLines('', null)).toEqual([]);
  });
});

describe('galat kolom belum ada', () => {
  it('mengenali pesan PostgREST soal detail_items', () => {
    expect(itemsColumnMissing({ message: "Could not find the 'detail_items' column of 'expenses' in the schema cache" })).toBe(true);
    expect(itemsColumnMissing({ message: 'duplicate key' })).toBe(false);
    expect(itemsColumnMissing(null)).toBe(false);
  });
});
