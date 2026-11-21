import { describe, it, expect } from 'vitest';
import {
  EDIT_WINDOW_MINUTES, editWindow, editAccess, draftFromSale, snapshotFromSale, snapshotFromDraft, calcDraft, draftChanges, hasChanges,
  validateDraft, validateEditRequest, describeSnapshots, mapEditRequest, mapEditLog, editedIds, logsFor, isSplitSale,
} from './transactionEditMath';

const NOW = new Date('2026-11-20T11:43:00.000Z').getTime();
const minsAgo = (m) => new Date(NOW - m * 60000).toISOString();

const sale = (over = {}) => ({
  id: 't1', display_number: '9F3A21C7', order_type: 'Takeaway', customer_name: 'Budi', status: 'paid',
  subtotal: 50000, voucher_discount: 0, manual_discount_amount: 5000, delivery_fee: 0, total: 45000,
  payment_method: 'Tunai', amount_paid: 50000, change_amount: 5000, ojol_platform: null, ojol_order_number: null,
  paid_at: minsAgo(12), created_at: minsAgo(13),
  items: [
    { id: 'i1', name: 'Ayam Geprek', variant_name: 'Level 2', qty: 2, price: 18000 },
    { id: 'i2', name: 'Es Teh', variant_name: null, qty: 2, price: 5000 },
    { id: 'i3', name: 'Nasi Putih', variant_name: null, qty: 1, price: 4000 },
  ],
  ...over,
});

describe('batas waktu', () => {
  it('batasnya 30 menit', () => expect(EDIT_WINDOW_MINUTES).toBe(30));
  it('dalam batas: terbuka, sisa menit dibulatkan ke atas', () => {
    const w = editWindow(sale(), NOW);
    expect(w.open).toBe(true);
    expect(w.minutesLeft).toBe(18);
    expect(w.fraction).toBeCloseTo(0.4, 5);
  });
  it('tepat 30 menit atau lebih: tertutup', () => {
    expect(editWindow(sale({ paid_at: minsAgo(30) }), NOW).open).toBe(false);
    expect(editWindow(sale({ paid_at: minsAgo(31) }), NOW)).toMatchObject({ open: false, minutesLeft: 0, fraction: 1 });
  });
  it('dihitung dari waktu BAYAR (paid_at), bukan waktu dibuat', () => {
    expect(editWindow(sale({ paid_at: minsAgo(5), created_at: minsAgo(90) }), NOW).open).toBe(true);
  });
  it('tanpa paid_at memakai created_at', () => {
    expect(editWindow(sale({ paid_at: null, created_at: minsAgo(40) }), NOW).open).toBe(false);
  });
  it('staf: langsung dalam batas, ajukan setelahnya; owner selalu langsung', () => {
    expect(editAccess({ sale: sale(), isOwner: false, now: NOW })).toBe('langsung');
    expect(editAccess({ sale: sale({ paid_at: minsAgo(45) }), isOwner: false, now: NOW })).toBe('ajukan');
    expect(editAccess({ sale: sale({ paid_at: minsAgo(45) }), isOwner: true, now: NOW })).toBe('langsung');
  });
});

describe('draft dan hitungan', () => {
  it('draft awal = isi transaksi, tanpa perubahan', () => {
    const d = draftFromSale(sale());
    expect(d).toMatchObject({ name: 'Budi', type: 'Takeaway', method: 'Tunai', received: '50000' });
    expect(d.items).toHaveLength(3);
    expect(hasChanges(draftChanges(d, sale()))).toBe(false);
    expect(calcDraft(d, sale())).toEqual({ subtotal: 50000, total: 45000, fee: 0 });
    expect(validateDraft(d, sale())).toBe('Belum ada perubahan.');
  });
  it('kurangi jumlah dan hapus item: subtotal dihitung ulang, diskon tetap', () => {
    const d = draftFromSale(sale());
    d.items[1].qty = 1; d.items[2].gone = true;
    expect(calcDraft(d, sale())).toEqual({ subtotal: 41000, total: 36000, fee: 0 });
  });
  it('total tidak pernah di bawah 0', () => {
    const s = sale({ manual_discount_amount: 60000 });
    const d = draftFromSale(s); d.items[0].qty = 1;
    expect(calcDraft(d, s).total).toBe(0);
  });
  it('ongkir ikut hilang kalau tipe bukan Delivery; tetap kalau Delivery', () => {
    const s = sale({ order_type: 'Delivery', delivery_fee: 7000, subtotal: 50000, manual_discount_amount: 0, total: 57000 });
    const d = draftFromSale(s);
    expect(calcDraft(d, s).total).toBe(57000);
    d.type = 'Takeaway';
    expect(calcDraft(d, s)).toEqual({ subtotal: 50000, total: 50000, fee: 0 });
  });
  it('changes hanya memuat kolom yang berubah', () => {
    const d = draftFromSale(sale());
    d.name = ' Budi S ';
    d.items[1].qty = 1; d.items[2].gone = true;
    expect(draftChanges(d, sale())).toEqual({ customer_name: 'Budi S', items: [{ id: 'i2', qty: 1 }, { id: 'i3', qty: 0 }] });
  });
  it('pindah ke QRIS: hanya payment_method; ke Ojol: aplikasi + no. order; ke Tunai: uang diterima', () => {
    const d = draftFromSale(sale()); d.method = 'QRIS';
    expect(draftChanges(d, sale())).toEqual({ payment_method: 'QRIS' });
    d.method = 'Ojol'; d.platform = 'Gofood'; d.orderNo = ' GF-1 ';
    expect(draftChanges(d, sale())).toEqual({ payment_method: 'Ojol', ojol_platform: 'Gofood', ojol_order_number: 'GF-1' });
    const q = sale({ payment_method: 'QRIS', amount_paid: null, change_amount: null });
    const e = draftFromSale(q); e.method = 'Tunai'; e.received = '60000';
    expect(draftChanges(e, q)).toEqual({ payment_method: 'Tunai', amount_paid: 60000 });
  });
  it('snapshot sesudah: kembalian Tunai dihitung ulang, non-Tunai tanpa uang diterima', () => {
    const d = draftFromSale(sale()); d.items[1].qty = 1; d.items[2].gone = true;
    expect(snapshotFromDraft(d, sale())).toMatchObject({ subtotal: 41000, total: 36000, amount_paid: 50000, change_amount: 14000 });
    d.method = 'QRIS';
    expect(snapshotFromDraft(d, sale())).toMatchObject({ payment_method: 'QRIS', amount_paid: null, change_amount: null, ojol_platform: null });
  });
});

describe('validasi', () => {
  it('uang diterima kurang dari total ditolak', () => {
    const d = draftFromSale(sale()); d.received = '40000';
    expect(validateDraft(d, sale())).toBe('Uang diterima kurang dari total.');
  });
  it('total turun tapi uang diterima lama masih cukup: boleh', () => {
    const d = draftFromSale(sale()); d.items[0].qty = 1;
    expect(validateDraft(d, sale())).toBeNull();
  });
  it('pindah ke Tunai wajib isi uang diterima; tunai lama tanpa data boleh kosong', () => {
    const q = sale({ payment_method: 'QRIS', amount_paid: null, change_amount: null });
    const d = draftFromSale(q); d.method = 'Tunai';
    expect(validateDraft(d, q)).toBe('Isi uang diterima.');
    const lama = sale({ amount_paid: null, change_amount: null });
    const e = draftFromSale(lama); e.name = 'Rina';
    expect(validateDraft(e, lama)).toBeNull();
  });
  it('Ojol wajib pilih aplikasi; minimal satu item', () => {
    const d = draftFromSale(sale()); d.method = 'Ojol';
    expect(validateDraft(d, sale())).toBe('Pilih aplikasi Ojol.');
    const e = draftFromSale(sale()); e.items.forEach((i) => { i.gone = true; });
    expect(validateDraft(e, sale())).toBe('Transaksi harus punya minimal satu item.');
  });
  it('Split Payment: hanya nama dan tipe yang masuk changes', () => {
    const s = sale({ payment_method: 'Split Payment', amount_paid: 45000, change_amount: 0 });
    expect(isSplitSale(s)).toBe(true);
    const d = draftFromSale(s); d.name = 'Baru'; d.type = 'Dine-in'; d.method = 'QRIS'; d.items[0].gone = true;
    expect(draftChanges(d, s)).toEqual({ customer_name: 'Baru', order_type: 'Dine-in' });
    expect(snapshotFromDraft(d, s).payment_method).toBe('Split Payment');
  });
  it('form ajukan: alasan dan nama wajib', () => {
    expect(() => validateEditRequest({ reason: ' ', requestedBy: 'Sari' })).toThrow('alasan');
    expect(() => validateEditRequest({ reason: 'typo', requestedBy: '' })).toThrow('namamu');
    expect(validateEditRequest({ reason: ' typo ', requestedBy: ' Sari ' })).toEqual({ reason: 'typo', requestedBy: 'Sari' });
  });
});

describe('describeSnapshots', () => {
  const fmt = (n) => `Rp ${n}`;
  it('menyusun baris sebelum -> sesudah dengan item dan total', () => {
    const before = snapshotFromSale(sale());
    const d = draftFromSale(sale()); d.method = 'QRIS'; d.items[1].qty = 1; d.items[2].gone = true;
    const lines = describeSnapshots(before, snapshotFromDraft(d, sale()), fmt);
    expect(lines).toEqual([
      { label: 'Metode bayar', from: 'Tunai', to: 'QRIS' },
      { label: 'Es Teh', from: '2 pcs', to: '1 pcs' },
      { label: 'Nasi Putih', from: '1 pcs', to: 'dihapus' },
      { label: 'Total', from: 'Rp 45000', to: 'Rp 36000' },
    ]);
  });
  it('nama kosong tampil Umum; uang diterima baru hanya tampil kalau ada nilainya', () => {
    const lines = describeSnapshots({ customer_name: 'Budi', amount_paid: null, total: 1 }, { customer_name: null, amount_paid: 5000, total: 1 }, fmt);
    expect(lines).toEqual([
      { label: 'Pelanggan', from: 'Budi', to: 'Umum' },
      { label: 'Uang diterima', from: '-', to: 'Rp 5000' },
    ]);
  });
  it('tanpa perubahan = kosong; item bervarian memakai label dengan varian', () => {
    const s = snapshotFromSale(sale());
    expect(describeSnapshots(s, s, fmt)).toEqual([]);
    const d = draftFromSale(sale()); d.items[0].qty = 1;
    expect(describeSnapshots(s, snapshotFromDraft(d, sale()), fmt)[0]).toEqual({ label: 'Ayam Geprek (Level 2)', from: '2 pcs', to: '1 pcs' });
  });
});

describe('pemetaan baris database', () => {
  it('mapEditRequest memberi bawaan aman dan status yang valid', () => {
    const r = mapEditRequest({ id: 'r1', transaction_id: 't1', display_number: 'A1', total: '45000', changes: null, status: 'aneh', reason: 'typo', requested_by: 'Sari' });
    expect(r).toMatchObject({ id: 'r1', transactionId: 't1', total: 45000, changes: {}, status: 'menunggu', requestedBy: 'Sari' });
  });
  it('log: terbaru dulu per transaksi dan Set id yang pernah diubah', () => {
    const logs = [
      mapEditLog({ id: 'a', transaction_id: 't1', via: 'langsung', created_at: '2026-11-20T11:44:00Z' }),
      mapEditLog({ id: 'b', transaction_id: 't1', via: 'persetujuan', created_at: '2026-11-20T11:52:00Z' }),
      mapEditLog({ id: 'c', transaction_id: 't2', via: 'lain', created_at: '2026-11-20T11:00:00Z' }),
    ];
    expect(logsFor(logs, 't1').map((l) => l.id)).toEqual(['b', 'a']);
    expect(logs[2].via).toBe('langsung');
    expect([...editedIds(logs)].sort()).toEqual(['t1', 't2']);
  });
});
