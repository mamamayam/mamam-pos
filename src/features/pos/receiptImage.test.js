import { describe, it, expect } from 'vitest';
import { layoutReceipt, wrapText, W } from './receiptImage.js';

// Lebar teks palsu: tiap huruf = 0,55 x ukuran (cukup untuk menguji pembungkusan dan posisi tanpa canvas).
const measure = (t, size) => String(t).length * size * 0.55;
const rp = (n) => `Rp ${n}`;
const items = [
  { name: 'Ayam Geprek', note: 'Level 3 · Catatan: nasi dipisah', qty: 2, price: 18000 },
  { name: 'Es Teh', note: '', qty: 1, price: 5000 },
];
const lunas = {
  number: 'A1B2C3D4', status: 'lunas', when: '2026-10-19T05:00:00Z', customerName: 'Bu Rina', orderType: 'Dine-in', paymentMethod: 'Tunai',
  ojolPlatform: '', ojolOrderNumber: '', splits: [], amountPaid: 50000, change: 9000, items,
  subtotal: 41000, voucherCode: '', voucherDiscount: 0, manualDiscountAmount: 0, deliveryFee: 0, total: 41000,
};
const belum = { ...lunas, status: 'belum', paymentMethod: '', amountPaid: null, change: null, voucherCode: 'MAMAM10', voucherDiscount: 4100, total: 36900 };

const layout = (r) => layoutReceipt(r, { formatRupiah: rp, measure });
const texts = (r) => layout(r).ops.filter((o) => o.t === 'text').map((o) => o.text);
const has = (r, t) => texts(r).includes(t);
const hasLike = (r, part) => texts(r).some((t) => t.includes(part));

describe('layoutReceipt', () => {
  it('transaksi lunas: judul struk, info order, item, total, uang diterima dan kembalian', () => {
    for (const t of ['STRUK PEMBELIAN', 'MAMAM AYAM', '#A1B2C3D4', 'Bu Rina', 'Dine-in', 'Tunai', 'Ayam Geprek', 'Es Teh', '2 x Rp 18000', 'Rp 36000',
      'Subtotal (3 item)', 'TOTAL', 'Rp 41000', 'Uang diterima', 'Rp 50000', 'Kembalian', 'Rp 9000', 'Terima kasih sudah memesan!']) {
      expect(has(lunas, t), t).toBe(true);
    }
    expect(hasLike(lunas, 'nasi dipisah')).toBe(true);
    expect(hasLike(lunas, 'BELUM DIBAYAR')).toBe(false);
    expect(has(lunas, 'TAGIHAN')).toBe(false);
  });

  it('kembalian Rp 0 (uang pas) tetap tampil; tanpa data kembalian (transaksi lama) baris Kembalian dilewati', () => {
    expect(has({ ...lunas, amountPaid: 41000, change: 0 }, 'Kembalian')).toBe(true);
    expect(has({ ...lunas, amountPaid: 41000, change: 0 }, 'Rp 0')).toBe(true);
    const lama = { ...lunas, amountPaid: 50000, change: null };
    expect(has(lama, 'Uang diterima')).toBe(true);
    expect(has(lama, 'Kembalian')).toBe(false);
    const kosong = { ...lunas, amountPaid: null, change: null };
    expect(has(kosong, 'Uang diterima')).toBe(false);
    expect(has(kosong, 'Kembalian')).toBe(false);
  });

  it('QRIS / Transfer / Ojol: tanpa uang diterima dan kembalian', () => {
    for (const m of ['QRIS', 'Transfer', 'Ojol']) {
      const r = { ...lunas, paymentMethod: m, amountPaid: null, change: null };
      expect(has(r, 'Uang diterima'), m).toBe(false);
      expect(has(r, 'Kembalian'), m).toBe(false);
    }
  });

  it('pesanan tersimpan: judul tagihan, BELUM DIBAYAR, diskon dengan kode voucher, tanpa blok pembayaran', () => {
    expect(has(belum, 'TAGIHAN')).toBe(true);
    expect(has(belum, 'BELUM DIBAYAR')).toBe(true);
    expect(has(belum, 'TOTAL TAGIHAN')).toBe(true);
    expect(has(belum, 'Diskon (MAMAM10)')).toBe(true);
    expect(has(belum, '-Rp 4100')).toBe(true);
    expect(has(belum, 'Rp 36900')).toBe(true);
    expect(has(belum, 'Disimpan')).toBe(true);
    expect(has(belum, 'Pesanan ini belum dibayar.')).toBe(true);
    for (const t of ['Uang diterima', 'Kembalian', 'Pembayaran', 'STRUK PEMBELIAN']) expect(has(belum, t), t).toBe(false);
  });

  it('ojol, split (dibayar + kembalian), ongkir, diskon manual tampil hanya bila berlaku', () => {
    expect(hasLike(lunas, 'Ongkir')).toBe(false);
    expect(hasLike(lunas, 'Diskon')).toBe(false);
    const s = { ...lunas, orderType: 'Delivery', deliveryFee: 4000, manualDiscountAmount: 500, paymentMethod: 'Split Payment', splits: [{ method: 'Tunai', amount: 20000 }, { method: 'QRIS', amount: 24500 }], amountPaid: 44500, change: 0 };
    for (const t of ['Ongkir', 'Diskon Tambahan', 'Split 1 - Tunai', 'Split 2 - QRIS', 'Dibayar', 'Kembalian']) expect(has(s, t), t).toBe(true);
    const oj = { ...lunas, paymentMethod: 'Ojol', ojolPlatform: 'GoFood', ojolOrderNumber: 'GF-123', amountPaid: null, change: null };
    expect(has(oj, 'Ojol (GoFood)')).toBe(true);
    expect(has(oj, 'GF-123')).toBe(true);
  });

  it('pelanggan kosong tampil Umum', () => {
    expect(has({ ...lunas, customerName: '' }, 'Umum')).toBe(true);
  });

  it('tinggi gambar mengikuti isi; semua teks ada di dalam gambar dan tidak melewati margin', () => {
    const banyak = { ...lunas, items: Array.from({ length: 12 }, (_, i) => ({ name: `Menu ${i}`, note: '', qty: 1, price: 1000 })) };
    expect(layout(banyak).height).toBeGreaterThan(layout(lunas).height);
    expect(layout(lunas).height).toBeGreaterThanOrEqual(260);
    expect(layout(lunas).width).toBe(W);
    const panjang = { ...lunas, items: [{ name: 'Ayam Geprek Sambal Matah Super Pedas Level Lima Porsi Jumbo Tambah Nasi', note: 'tanpa timun dan tanpa kol, sambal dipisah, bungkus rapi ya kak', qty: 1, price: 1000 }] };
    const { ops, height } = layout(panjang);
    expect(ops.filter((o) => o.t === 'text' && o.size === 13 && o.bold).length).toBeGreaterThan(1); // nama item panjang dibungkus
    for (const o of ops.filter((x) => x.t === 'text')) {
      const w = measure(o.text, o.size);
      const left = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x;
      const right = left + w;
      expect(left, o.text).toBeGreaterThanOrEqual(0);
      expect(right, o.text).toBeLessThanOrEqual(W);
      expect(o.y, o.text).toBeLessThanOrEqual(height);
    }
  });
});

describe('wrapText', () => {
  it('bungkus per kata; kata tunggal terlalu panjang dipotong per huruf; teks kosong tetap satu baris', () => {
    const panjang = 'Ayam Geprek Sambal Matah Super Pedas Level Lima Porsi Jumbo Tambah Nasi';
    const lines = wrapText(panjang, 13, 200, measure, true);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) => expect(measure(l, 13)).toBeLessThanOrEqual(200));
    expect(lines.join(' ')).toBe(panjang);
    const cut = wrapText('A'.repeat(60), 13, 100, measure);
    expect(cut.length).toBeGreaterThan(1);
    cut.forEach((l) => expect(measure(l, 13)).toBeLessThanOrEqual(100));
    expect(cut.join('')).toBe('A'.repeat(60));
    expect(wrapText('', 13, 100, measure)).toEqual(['']);
  });
});
