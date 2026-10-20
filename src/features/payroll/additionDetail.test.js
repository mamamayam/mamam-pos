import { describe, it, expect } from 'vitest';
import {
  DETAIL_KIND, CUSTOM_CUT, DEFAULT_CUT_PRICES, detailKindForCategory, emptyRow, startDetail, withCutType, rowAmount, detailTotal,
  cleanDetail, detailForForm, detailLabel, detailSubRows, parseDetail, buildAttachments, sanitizeCutPrices, validateCutPrices, fmtTgl,
} from './additionDetail';

describe('detailKindForCategory', () => {
  it('Ongkir dan Potong Ayam, tanpa peduli huruf besar/spasi; kategori lain tidak punya rincian', () => {
    expect(detailKindForCategory('Ongkir')).toBe('ongkir');
    expect(detailKindForCategory(' ongkir ')).toBe('ongkir');
    expect(detailKindForCategory('Potong Ayam')).toBe('potong_ayam');
    expect(detailKindForCategory('potong  ayam')).toBe('potong_ayam');
    expect(detailKindForCategory('Bonus')).toBeNull();
    expect(detailKindForCategory('Potong Ayam Besar')).toBeNull();
    expect(detailKindForCategory('')).toBeNull();
  });
});

describe('baris form', () => {
  it('emptyRow / startDetail', () => {
    expect(emptyRow('ongkir')).toEqual({ customer: '', amount: '' });
    expect(emptyRow('potong_ayam')).toEqual({ type: 'Bld', name: '', qty: '1', price: '3000' });
    expect(emptyRow('potong_ayam', [])).toEqual({ type: CUSTOM_CUT, name: '', qty: '1', price: '' });
    expect(startDetail('ongkir').rows).toHaveLength(1);
  });

  it('withCutType: harga ikut jenis; Lainnya mengosongkan harga dan membuka nama', () => {
    const base = emptyRow('potong_ayam');
    expect(withCutType(base, 'Sayap', [{ name: 'Sayap', price: 3500 }])).toMatchObject({ type: 'Sayap', price: '3500', name: '' });
    expect(withCutType(base, CUSTOM_CUT)).toMatchObject({ type: CUSTOM_CUT, price: '' });
    expect(withCutType({ ...base, type: CUSTOM_CUT, name: 'Kepala' }, CUSTOM_CUT)).toMatchObject({ name: 'Kepala' });
  });

  it('rowAmount / detailTotal', () => {
    expect(rowAmount('ongkir', { amount: '5000' })).toBe(5000);
    expect(rowAmount('potong_ayam', { qty: '10', price: '3000' })).toBe(30000);
    expect(detailTotal({ kind: 'ongkir', rows: [{ amount: '5000' }, { amount: '4000' }, { amount: '' }] })).toBe(9000);
    expect(detailTotal({ kind: 'potong_ayam', rows: [{ qty: '10', price: '3000' }, { qty: 4, price: 3000 }] })).toBe(42000);
    expect(detailTotal(null)).toBe(0);
  });
});

describe('cleanDetail', () => {
  it('ongkir: buang baris kosong, rapikan nama, ubah ke integer', () => {
    const d = cleanDetail({ kind: 'ongkir', rows: [{ customer: '  Pak   Hendra ', amount: '5.000' }, { customer: '', amount: '' }, { customer: 'Bu Rina', amount: '4000' }] });
    expect(d).toEqual({ kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: 5000 }, { customer: 'Bu Rina', amount: 4000 }] });
  });

  it('potong ayam: jenis preset, Lainnya memakai nama sendiri', () => {
    const d = cleanDetail({ kind: 'potong_ayam', rows: [
      { type: 'Bld', name: '', qty: '10', price: '3000' },
      { type: CUSTOM_CUT, name: 'Kepala ayam', qty: '2', price: '4500' },
    ] });
    expect(d.rows).toEqual([{ name: 'Bld', qty: 10, price: 3000 }, { name: 'Kepala ayam', qty: 2, price: 4500 }]);
  });

  it('pesan error berbahasa Indonesia dan menyebut nomor baris', () => {
    expect(cleanDetail(null)).toBeNull();
    expect(() => cleanDetail({ kind: 'ongkir', rows: [] })).toThrow('minimal satu baris');
    expect(() => cleanDetail({ kind: 'ongkir', rows: [{ customer: '', amount: '5000' }] })).toThrow('Baris 1: isi nama customer');
    expect(() => cleanDetail({ kind: 'ongkir', rows: [{ customer: 'A', amount: '1000' }, { customer: 'B', amount: '0' }] })).toThrow('Baris 2: isi jumlah ongkir');
    expect(() => cleanDetail({ kind: 'potong_ayam', rows: [{ type: CUSTOM_CUT, name: '', qty: '1', price: '3000' }] })).toThrow('isi nama potongan');
    expect(() => cleanDetail({ kind: 'potong_ayam', rows: [{ type: 'Bld', qty: '0', price: '3000' }] })).toThrow('jumlah harus lebih dari 0');
    expect(() => cleanDetail({ kind: 'potong_ayam', rows: [{ type: 'Bld', qty: '2', price: '0' }] })).toThrow('isi harga');
    expect(() => cleanDetail({ kind: 'aneh', rows: [{}] })).toThrow('tidak dikenal');
    expect(() => cleanDetail({ kind: 'ongkir', rows: Array.from({ length: 101 }, () => ({ customer: 'A', amount: '1000' })) })).toThrow('maksimal 100');
  });
});

describe('label dan baris kecil', () => {
  const ong = { kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: 5000 }, { customer: 'Bu Rina', amount: 4000 }] };
  const pot = { kind: 'potong_ayam', rows: [{ name: 'Bld', qty: 10, price: 3000 }, { name: 'Sayap', qty: 4, price: 3000 }, { name: 'Kepala ayam', qty: 2, price: 4500 }] };

  it('detailLabel', () => {
    expect(detailLabel(ong)).toBe('Ongkir (2 customer)');
    expect(detailLabel(pot)).toBe('Potong Ayam (16 potong)');
    expect(detailLabel(null)).toBe('');
  });

  it('detailSubRows', () => {
    expect(detailSubRows(ong)).toEqual([{ text: 'Pak Hendra', amount: 5000 }, { text: 'Bu Rina', amount: 4000 }]);
    expect(detailSubRows(pot)).toEqual([
      { text: 'Bld 10 × 3.000', amount: 30000 }, { text: 'Sayap 4 × 3.000', amount: 12000 }, { text: 'Kepala ayam 2 × 4.500', amount: 9000 },
    ]);
  });
});

describe('parseDetail', () => {
  it('menerima objek atau teks JSON; bentuk salah = null', () => {
    const d = { kind: 'ongkir', rows: [{ customer: 'A', amount: 1000 }] };
    expect(parseDetail(d)).toEqual(d);
    expect(parseDetail(JSON.stringify(d))).toEqual(d);
    expect(parseDetail(null)).toBeNull();
    expect(parseDetail('{rusak')).toBeNull();
    expect(parseDetail({ kind: 'ongkir' })).toBeNull();
    expect(parseDetail({ kind: 'lain', rows: [{}] })).toBeNull();
    expect(parseDetail({ kind: 'potong_ayam', rows: [{ name: '', qty: 0 }] })).toBeNull();
  });
});

describe('buildAttachments', () => {
  const adds = [
    { id: '3', date: '2026-10-08', detail: { kind: 'ongkir', rows: [{ customer: 'Mas Dani', amount: 6000 }] } },
    { id: '1', date: '2026-10-06', detail: { kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: 5000 }, { customer: 'Bu Rina', amount: 4000 }] } },
    { id: '2', date: '2026-10-07', detail: { kind: 'potong_ayam', rows: [{ name: 'Bld', qty: 10, price: 3000 }, { name: 'Kepala ayam', qty: 2, price: 4500 }] } },
    { id: '4', date: '2026-10-09', detail: null },
  ];

  it('mengelompokkan per kategori, urut tanggal, dengan total', () => {
    const a = buildAttachments(adds);
    expect(a.ongkir.rows.map((r) => [r.date, r.customer, r.amount])).toEqual([['2026-10-06', 'Pak Hendra', 5000], ['2026-10-06', 'Bu Rina', 4000], ['2026-10-08', 'Mas Dani', 6000]]);
    expect(a.ongkir.total).toBe(15000);
    expect(a.potong.rows.map((r) => r.subtotal)).toEqual([30000, 9000]);
    expect(a.potong.total).toBe(39000);
  });

  it('tanpa rincian sama sekali = null; hanya satu kategori = kategori lain null', () => {
    expect(buildAttachments([{ date: '2026-10-01', detail: null }])).toBeNull();
    expect(buildAttachments([])).toBeNull();
    expect(buildAttachments(null)).toBeNull();
    expect(buildAttachments([adds[1]]).potong).toBeNull();
  });
});

describe('harga potong ayam', () => {
  it('sanitizeCutPrices: rusak/kosong = bawaan; buang dobel, Lainnya, harga 0', () => {
    expect(sanitizeCutPrices(undefined)).toEqual([...DEFAULT_CUT_PRICES]);
    expect(sanitizeCutPrices([])).toEqual([...DEFAULT_CUT_PRICES]);
    expect(sanitizeCutPrices([{ name: 'Bld', price: 3500 }, { name: 'bld', price: 1 }, { name: 'Lainnya', price: 5 }, { name: 'X', price: 0 }, { name: 'Dada', price: '4000' }]))
      .toEqual([{ name: 'Bld', price: 3500 }, { name: 'Dada', price: 4000 }]);
  });

  it('validateCutPrices', () => {
    expect(validateCutPrices([]).ok).toBe(false);
    expect(validateCutPrices([{ name: '', price: 3000 }]).message).toContain('isi nama');
    expect(validateCutPrices([{ name: 'Lainnya', price: 3000 }]).message).toContain('otomatis');
    expect(validateCutPrices([{ name: 'Bld', price: 3000 }, { name: 'bld', price: 3000 }]).message).toContain('dobel');
    expect(validateCutPrices([{ name: 'Bld', price: 0 }]).message).toContain('harga');
    expect(validateCutPrices([{ name: ' Bld ', price: '3.500' }])).toEqual({ ok: true, list: [{ name: 'Bld', price: 3500 }] });
  });
});

describe('fmtTgl', () => {
  it('6 Okt', () => { expect(fmtTgl('2026-10-06')).toBe('6 Okt'); expect(fmtTgl('')).toBe(''); });
});

describe('detailForForm (mode ubah: rincian dari database ke isian form)', () => {
  const stored = { kind: 'potong_ayam', rows: [{ name: 'Sayap', qty: 2, price: 3000 }, { name: 'karkas', qty: 1, price: 3500 }, { name: 'Kepala ayam', qty: 4, price: 500 }] };
  it('nama yang cocok daftar harga jadi jenisnya (tanpa peduli huruf besar/kecil); selain itu Lainnya + nama bebas', () => {
    const f = detailForForm(stored, DEFAULT_CUT_PRICES);
    expect(f.rows[0]).toMatchObject({ type: 'Sayap', name: '', qty: 2, price: 3000 });
    expect(f.rows[1]).toMatchObject({ type: 'Karkas', name: '', qty: 1, price: 3500 });   // harga catatan lama tetap
    expect(f.rows[2]).toMatchObject({ type: CUSTOM_CUT, name: 'Kepala ayam', qty: 4, price: 500 });
  });
  it('jenis yang sudah dihapus dari Pengaturan tetap tampil sebagai Lainnya dengan namanya', () => {
    const f = detailForForm({ kind: 'potong_ayam', rows: [{ name: 'Sayap', qty: 1, price: 3000 }] }, [{ name: 'Bld', price: 3000 }]);
    expect(f.rows[0]).toMatchObject({ type: CUSTOM_CUT, name: 'Sayap' });
  });
  it('hasilnya tetap bisa disimpan ulang: nama, jumlah, harga sama dengan aslinya', () => {
    expect(cleanDetail(detailForForm(stored, DEFAULT_CUT_PRICES))).toEqual({ kind: 'potong_ayam', rows: stored.rows.map((r, i) => (i === 1 ? { ...r, name: 'Karkas' } : r)) });
  });
  it('baris yang sudah punya type, rincian ongkir, dan null tidak berubah (objek sama)', () => {
    const formDetail = startDetail('potong_ayam');
    expect(detailForForm(formDetail)).toBe(formDetail);
    const ongkir = { kind: 'ongkir', rows: [{ customer: 'Budi', amount: 5000 }] };
    expect(detailForForm(ongkir)).toBe(ongkir);
    expect(detailForForm(null)).toBe(null);
  });
});
