import { describe, it, expect } from 'vitest';
import { buildReceiptPdf, wrapText } from './receiptPdf.js';
import { textWidth } from '../payroll/payslipPdf.js';

const rp = (n) => `Rp ${n}`;
const latin1 = (b) => new TextDecoder('latin1').decode(b);
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
const text = (r) => latin1(buildReceiptPdf(r, { formatRupiah: rp }));

describe('buildReceiptPdf', () => {
  it('PDF valid: header, EOF, xref menunjuk tiap objek, satu halaman', () => {
    const s = text(lunas);
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)[1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const offsets = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(6);
    offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    expect(s).toContain('/Count 1');
    const len = Number(/\/Length (\d+)/.exec(s)[1]);
    const body = s.slice(s.indexOf('stream\n') + 7, s.indexOf('\nendstream'));
    expect(body.length).toBe(len);
  });

  it('transaksi lunas: judul struk, info order, item, total, pembayaran tunai dan kembalian', () => {
    const s = text(lunas);
    for (const t of ['(STRUK PEMBELIAN)', '(MAMAM AYAM)', '(#A1B2C3D4)', '(Bu Rina)', '(Dine-in)', '(Tunai)', '(Ayam Geprek)', '(Level 3 ', 'nasi dipisah', '(2 x Rp 18000)', '(Rp 36000)', '(Es Teh)', '(Subtotal \\(3 item\\))', '(TOTAL)', '(Rp 41000)', '(Uang diterima)', '(Rp 50000)', '(Kembalian)', '(Rp 9000)', '(Terima kasih']) {
      expect(s, t).toContain(t);
    }
    expect(s).not.toContain('BELUM DIBAYAR');
    expect(s).not.toContain('TAGIHAN');
  });

  it('pesanan tersimpan: judul tagihan, BELUM DIBAYAR, diskon dengan kode voucher, tanpa blok pembayaran', () => {
    const s = text(belum);
    expect(s).toContain('(TAGIHAN)');
    expect(s).toContain('(BELUM DIBAYAR)');
    expect(s).toContain('TOTAL TAGIHAN');
    expect(s).toContain('Diskon \\(MAMAM10\\)');
    expect(s).toContain('-Rp 4100');
    expect(s).toContain('Rp 36900');
    expect(s).toContain('Disimpan');
    expect(s).toContain('Pesanan ini belum dibayar');
    expect(s).not.toContain('Uang diterima');
    expect(s).not.toContain('Pembayaran');
    expect(s).not.toContain('STRUK PEMBELIAN');
  });

  it('ojol, split, ongkir, diskon manual tampil hanya bila berlaku', () => {
    const polos = text(lunas);
    expect(polos).not.toContain('Ongkir');
    expect(polos).not.toContain('Diskon');
    const s = text({ ...lunas, orderType: 'Delivery', deliveryFee: 4000, manualDiscountAmount: 500, paymentMethod: 'Split Payment', splits: [{ method: 'Tunai', amount: 20000 }, { method: 'QRIS', amount: 24500 }], amountPaid: 44500, change: 0 });
    expect(s).toContain('Ongkir');
    expect(s).toContain('Diskon Tambahan');
    expect(s).toContain('Split 1 - Tunai');
    expect(s).toContain('Split 2 - QRIS');
    const oj = text({ ...lunas, paymentMethod: 'Ojol', ojolPlatform: 'GoFood', ojolOrderNumber: 'GF-123', amountPaid: null, change: null });
    expect(oj).toContain('Ojol \\(GoFood\\)');
    expect(oj).toContain('GF-123');
    expect(oj).not.toContain('Uang diterima');
  });

  it('pelanggan kosong tampil Umum; karakter di luar Latin-1 tidak merusak berkas; kurung di-escape', () => {
    const s = text({ ...lunas, customerName: '', items: [{ name: 'Ayam (pedas) → manis', note: '', qty: 1, price: 1000 }] });
    expect(s).toContain('(Umum)');
    expect(s).toContain('Ayam \\(pedas\\) > manis');
  });

  it('tinggi halaman mengikuti isi; nama panjang dibungkus dan tidak melebihi lebar kertas', () => {
    const tinggi = (r) => Number(/MediaBox \[0 0 226 (\d+)\]/.exec(text(r))[1]);
    const banyak = { ...lunas, items: Array.from({ length: 12 }, (_, i) => ({ name: `Menu ${i}`, note: '', qty: 1, price: 1000 })) };
    expect(tinggi(banyak)).toBeGreaterThan(tinggi(lunas));
    expect(tinggi(lunas)).toBeGreaterThanOrEqual(200);
    const panjang = 'Ayam Geprek Sambal Matah Super Pedas Level Lima Porsi Jumbo Tambah Nasi';
    const lines = wrapText(panjang, 9, 198, true);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) => expect(textWidth(l, 9, true)).toBeLessThanOrEqual(198));
    expect(lines.join(' ')).toBe(panjang);
  });
});

describe('wrapText', () => {
  it('kata tunggal yang terlalu panjang dipotong per huruf, teks kosong tetap satu baris', () => {
    const lines = wrapText('A'.repeat(60), 9, 100);
    expect(lines.length).toBeGreaterThan(1);
    lines.forEach((l) => expect(textWidth(l, 9)).toBeLessThanOrEqual(100));
    expect(lines.join('')).toBe('A'.repeat(60));
    expect(wrapText('', 9, 100)).toEqual(['']);
  });
});
