import { describe, it, expect } from 'vitest';
import {
  CUSTOM_WASTE, emptyWasteRow, rowName, wasteRowOk, priceFor, toStoredRows, wasteTotals, formQty, wasteCheck, describeWaste,
  wasteByJenis, wasteByPenyaluran, sumWaste, jenisWithoutPrice, wasteUnpriced,
} from './wasteMath';

const jenis = [{ name: 'Dada', price: 9000 }, { name: 'Paha atas', price: 8000 }, { name: 'Sayap', price: 0 }];
const row = (type, qty, name = '') => ({ type, qty, name });

describe('baris waste', () => {
  it('nama tampil: jenis, atau nama bebas untuk Lainnya', () => {
    expect(rowName(row('Dada', '2'))).toBe('Dada');
    expect(rowName(row(CUSTOM_WASTE, '1', ' Kepala ayam '))).toBe('Kepala ayam');
    expect(rowName(emptyWasteRow())).toBe('');
  });
  it('baris sah = ada nama dan porsi lebih dari 0 (koma desimal diterima)', () => {
    expect(wasteRowOk(row('Dada', '2'))).toBe(true);
    expect(wasteRowOk(row('Dada', '2,5'))).toBe(true);
    expect(wasteRowOk(row('Dada', '0'))).toBe(false);
    expect(wasteRowOk(row('Dada', ''))).toBe(false);
    expect(wasteRowOk(row('Dada', 'abc'))).toBe(false);
    expect(wasteRowOk(row(CUSTOM_WASTE, '1', ''))).toBe(false);
    expect(wasteRowOk(row('', '3'))).toBe(false);
  });
});

describe('harga dan total', () => {
  it('harga disalin dari daftar jenis; Lainnya dan jenis tak dikenal = 0', () => {
    expect(priceFor(row('Dada', '1'), jenis)).toBe(9000);
    expect(priceFor(row(CUSTOM_WASTE, '1', 'x'), jenis)).toBe(0);
    expect(priceFor(row('Hilang', '1'), jenis)).toBe(0);
    expect(priceFor(row('Dada', '1'), [{ name: 'Dada', price: -5 }])).toBe(0);
  });
  it('toStoredRows hanya baris sah, qty angka, harga tersalin', () => {
    const out = toStoredRows([row('Dada', '3'), row('Paha atas', '2,5'), row('Sayap', ''), row(CUSTOM_WASTE, '1', 'Kepala ayam')], jenis);
    expect(out).toEqual([
      { type: 'Dada', name: '', qty: 3, price: 9000 },
      { type: 'Paha atas', name: '', qty: 2.5, price: 8000 },
      { type: CUSTOM_WASTE, name: 'Kepala ayam', qty: 1, price: 0 },
    ]);
  });
  it('total porsi dan nilai: round(jumlah × harga) per baris, integer', () => {
    const t = wasteTotals([{ type: 'Dada', qty: 3, price: 9000 }, { type: 'Paha atas', qty: 2.5, price: 8000 }, { type: 'Sayap', qty: 0.333, price: 1000 }]);
    expect(t).toEqual({ qty: 5.833, value: 27000 + 20000 + 333 });
    expect(Number.isInteger(t.value)).toBe(true);
    expect(wasteTotals([])).toEqual({ qty: 0, value: 0 });
  });
  it('formQty menjumlah hanya baris sah', () => {
    expect(formQty([row('Dada', '3'), row('Sayap', '1,5'), row('Dada', '')])).toBe(4.5);
  });
});

describe('wasteCheck', () => {
  const ok = [row('Dada', '2')];
  it('lengkap = boleh simpan', () => {
    expect(wasteCheck({ rows: ok, penyaluran: 'Dibuang', by: 'Budi' })).toEqual({ ok: true, reason: '' });
  });
  it('menyebut apa yang kurang', () => {
    expect(wasteCheck({ rows: [emptyWasteRow()], penyaluran: '', by: '' }).reason).toBe('isi jenis dan porsi, pilih penyaluran, pilih nama');
    expect(wasteCheck({ rows: ok, penyaluran: '', by: 'Budi' }).reason).toBe('pilih penyaluran');
    expect(wasteCheck({ rows: ok, penyaluran: 'Dibuang', by: '' }).reason).toBe('pilih nama');
  });
  it('baris setengah terisi menahan simpan (porsi tanpa nama Lainnya)', () => {
    const r = wasteCheck({ rows: [row('Dada', '2'), row(CUSTOM_WASTE, '1', '')], penyaluran: 'Dibuang', by: 'Budi' });
    expect(r.ok).toBe(false);
  });
  it('baris kosong sepenuhnya diabaikan', () => {
    expect(wasteCheck({ rows: [row('Dada', '2'), emptyWasteRow('Sayap')], penyaluran: 'Dibuang', by: 'Budi' }).ok).toBe(true);
  });
});

describe('rekap', () => {
  const catatan = [
    { penyaluran: 'Dimakan karyawan', total_qty: 6, total_value: 43000, rows: [{ type: 'Dada', qty: 4, price: 9000 }, { type: 'Paha atas', qty: 2, price: 8000 }] },
    { penyaluran: 'Dibuang', total_qty: 3, total_value: 15000, rows: [{ type: 'Sayap', qty: 3, price: 5000 }] },
    { penyaluran: 'Dimakan karyawan', total_qty: 2, total_value: 18000, rows: [{ type: 'Dada', qty: 2, price: 9000 }] },
  ];
  it('sumWaste', () => { expect(sumWaste(catatan)).toEqual({ value: 76000, qty: 11, count: 3 }); expect(sumWaste([])).toEqual({ value: 0, qty: 0, count: 0 }); });
  it('wasteByJenis urut nilai terbesar', () => {
    expect(wasteByJenis(catatan).map((x) => [x.name, x.qty, x.value])).toEqual([['Dada', 6, 54000], ['Paha atas', 2, 16000], ['Sayap', 3, 15000]]);
  });
  it('wasteByPenyaluran urut porsi terbanyak', () => {
    expect(wasteByPenyaluran(catatan).map((x) => [x.name, x.qty, x.value])).toEqual([['Dimakan karyawan', 8, 61000], ['Dibuang', 3, 15000]]);
  });
  it('describeWaste dan peringatan harga', () => {
    expect(describeWaste([{ type: 'Dada', qty: 4, price: 1 }, { type: 'Paha atas', qty: 2.5, price: 1 }])).toBe('Dada 4 · Paha atas 2,5');
    expect(describeWaste([row('Dada', '3'), row(CUSTOM_WASTE, '1,5', 'Kepala ayam')])).toBe('Dada 3 · Kepala ayam 1,5');
    expect(jenisWithoutPrice(jenis).map((j) => j.name)).toEqual(['Sayap']);
    expect(wasteUnpriced(catatan[0])).toBe(false);
    expect(wasteUnpriced({ rows: [{ type: CUSTOM_WASTE, qty: 1, price: 0 }] })).toBe(true);
  });
});
