import { describe, it, expect } from 'vitest';
import { receiptFromCheckout, receiptFromSale, receiptFromSaved, receiptFilename, receiptShareTitle, itemNote } from './receiptModel.js';

describe('itemNote', () => {
  it('varian + catatan, kosong kalau tidak ada', () => {
    expect(itemNote('Level 3', 'nasi dipisah')).toBe('Level 3 · Catatan: nasi dipisah');
    expect(itemNote('', 'tanpa sambal')).toBe('Catatan: tanpa sambal');
    expect(itemNote('Level 3', '')).toBe('Level 3');
    expect(itemNote('', '')).toBe('');
  });
});

describe('receiptFromCheckout', () => {
  const r = {
    id: 'tx1', display_number: 'A1B2C3D4', paidAt: '2026-10-19T05:00:00Z', subtotal: 41000, voucherDiscount: 4100, manualDiscountAmount: 0, deliveryFee: 0, total: 36900,
    paymentMethod: 'Tunai', amount_paid: 50000, change_amount: 13100, orderType: 'Dine-in', customerName: 'Bu Rina', ojolPlatform: '', ojolOrderNumber: '', splitPayments: null,
    items: [{ name: 'Ayam Geprek', qty: 2, price: 18000, note: 'Level 3 · Catatan: nasi dipisah' }, { name: 'Es Teh', qty: 1, price: 5000, note: '' }],
  };
  it('memetakan semua angka apa adanya dan status lunas', () => {
    const x = receiptFromCheckout(r);
    expect(x).toMatchObject({ number: 'A1B2C3D4', status: 'lunas', when: '2026-10-19T05:00:00Z', customerName: 'Bu Rina', orderType: 'Dine-in', paymentMethod: 'Tunai', amountPaid: 50000, change: 13100, subtotal: 41000, voucherDiscount: 4100, total: 36900 });
    expect(x.items).toEqual([{ name: 'Ayam Geprek', note: 'Level 3 · Catatan: nasi dipisah', qty: 2, price: 18000 }, { name: 'Es Teh', note: '', qty: 1, price: 5000 }]);
    expect(x.splits).toEqual([]);
  });
  it('split payment dibawa; hasil kosong tidak melempar', () => {
    const x = receiptFromCheckout({ ...r, paymentMethod: 'Split Payment', splitPayments: [{ method: 'Tunai', amount: 20000 }, { method: 'QRIS', amount: '16900' }] });
    expect(x.splits).toEqual([{ method: 'Tunai', amount: 20000 }, { method: 'QRIS', amount: 16900 }]);
    expect(receiptFromCheckout(null).items).toEqual([]);
  });
});

describe('receiptFromSale (baris Riwayat)', () => {
  const s = {
    id: 'tx2', display_number: 'ZZ99', paid_at: '2026-10-18T10:30:00Z', created_at: '2026-10-18T10:00:00Z', order_type: 'Ojol', customer_name: null,
    payment_method: 'Ojol', ojol_platform: 'GoFood', ojol_order_number: 'GF-123', split_payments_json: null,
    subtotal: '30000', voucher_discount: 0, manual_discount_amount: 1000, delivery_fee: 0, total: '29000',
    items: [{ name: 'Ayam Geprek', variant_name: 'Level 5', note: 'extra sambal', qty: 1, price: 30000 }],
  };
  it('memakai paid_at, mengubah angka teks jadi number, dan menyusun catatan item', () => {
    const x = receiptFromSale(s);
    expect(x.status).toBe('lunas');
    expect(x.when).toBe('2026-10-18T10:30:00Z');
    expect(x).toMatchObject({ number: 'ZZ99', customerName: '', paymentMethod: 'Ojol', ojolPlatform: 'GoFood', ojolOrderNumber: 'GF-123', subtotal: 30000, manualDiscountAmount: 1000, total: 29000 });
    expect(x.items[0]).toEqual({ name: 'Ayam Geprek', note: 'Level 5 · Catatan: extra sambal', qty: 1, price: 30000 });
  });
  it('tanpa paid_at jatuh ke created_at; platform ojol tidak bocor ke metode lain', () => {
    expect(receiptFromSale({ ...s, paid_at: null }).when).toBe('2026-10-18T10:00:00Z');
    expect(receiptFromSale({ ...s, payment_method: 'QRIS' })).toMatchObject({ ojolPlatform: '', ojolOrderNumber: '' });
  });
  it('uang dibayarkan dan kembalian dibawa dari kolom amount_paid / change_amount (null tetap null)', () => {
    const x = receiptFromSale({ ...s, payment_method: 'Tunai', amount_paid: '50000', change_amount: 21000 });
    expect(x).toMatchObject({ amountPaid: 50000, change: 21000 });
    expect(receiptFromSale({ ...s, amount_paid: null, change_amount: null })).toMatchObject({ amountPaid: null, change: null });
    expect(receiptFromSale({ ...s, payment_method: 'Tunai', amount_paid: 29000, change_amount: 0 }).change).toBe(0);
  });
  it('split payment dari split_payments_json', () => {
    const x = receiptFromSale({ ...s, payment_method: 'Split Payment', split_payments_json: [{ method: 'Tunai', amount: 10000 }, { method: 'QRIS', amount: 19000 }] });
    expect(x.splits).toHaveLength(2);
  });
});

describe('receiptFromSaved (pesanan tersimpan)', () => {
  const o = {
    id: 'tx3', number: 'A1B2C3D4', createdAt: '2026-10-19T04:58:00Z', customerName: 'Bu Rina', orderType: 'Delivery', voucherCode: 'MAMAM10',
    items: [{ name: 'Ayam Geprek', variantName: 'Level 3', note: 'nasi dipisah', qty: 2, price: 18000 }],
    subtotal: 36000, voucherDiscount: 3600, manualDiscountAmount: 0, deliveryFee: 4000, total: 36400,
  };
  it('berstatus belum dibayar, tanpa metode bayar, waktu = saat disimpan', () => {
    const x = receiptFromSaved(o);
    expect(x).toMatchObject({ status: 'belum', number: 'A1B2C3D4', when: '2026-10-19T04:58:00Z', paymentMethod: '', voucherCode: 'MAMAM10', deliveryFee: 4000, total: 36400 });
    expect(x.items[0].note).toBe('Level 3 · Catatan: nasi dipisah');
  });
});

describe('nama berkas dan judul share', () => {
  it('Struk untuk lunas, Tagihan untuk belum dibayar, nomor dibersihkan', () => {
    expect(receiptFilename({ number: 'A1B2C3D4', status: 'lunas' })).toBe('Struk-A1B2C3D4.png');
    expect(receiptFilename({ number: 'A1B2C3D4', status: 'belum' })).toBe('Tagihan-A1B2C3D4.png');
    expect(receiptFilename({ number: ' #12/3 ', status: 'lunas' })).toBe('Struk-12-3.png');
    expect(receiptFilename({ number: '', status: 'lunas' })).toBe('Struk-pesanan.png');
  });
  it('judul memuat nomor dan nama pelanggan', () => {
    expect(receiptShareTitle({ number: 'A1', status: 'lunas', customerName: 'Bu Rina' })).toBe('Struk #A1 · Bu Rina');
    expect(receiptShareTitle({ number: 'A1', status: 'belum' })).toBe('Tagihan #A1');
  });
});
