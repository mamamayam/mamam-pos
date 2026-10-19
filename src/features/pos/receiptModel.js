/**
 * receiptModel — bentuk struk yang SAMA untuk tiga sumber, supaya satu pembuat gambar cukup:
 *   - transaksi yang baru selesai (hasil checkout(), popup ReceiptModal)   -> receiptFromCheckout
 *   - transaksi lunas di Riwayat (baris transactions + items)               -> receiptFromSale
 *   - pesanan tersimpan / belum dibayar (orderFromRow di savedOrders.js)    -> receiptFromSaved
 *
 * FUNGSI MURNI, tanpa hitungan harga baru: semua angka diambil apa adanya dari sumbernya.
 * Dites di receiptModel.test.js.
 *
 * Bentuk hasil:
 *   { number, status: 'lunas' | 'belum', when (ISO), customerName, orderType,
 *     paymentMethod, ojolPlatform, ojolOrderNumber, splits: [{ method, amount }], amountPaid, change,
 *     items: [{ name, note, qty, price }],
 *     subtotal, voucherCode, voucherDiscount, manualDiscountAmount, deliveryFee, total }
 */

const n = (v) => Number(v) || 0;

/** Varian + catatan jadi satu baris keterangan, mis. "Level 3 · Catatan: nasi dipisah". */
export const itemNote = (variantName, note) =>
  [variantName, note ? `Catatan: ${note}` : ''].filter(Boolean).join(' · ');

const base = (over) => ({
  number: '', status: 'lunas', when: null, customerName: '', orderType: '',
  paymentMethod: '', ojolPlatform: '', ojolOrderNumber: '', splits: [], amountPaid: null, change: null,
  items: [], subtotal: 0, voucherCode: '', voucherDiscount: 0, manualDiscountAmount: 0, deliveryFee: 0, total: 0,
  ...over,
});

/** Hasil useCheckout.checkout(): `items[].note` SUDAH berisi varian + catatan. */
export function receiptFromCheckout(r) {
  const x = r || {};
  return base({
    number: x.display_number || '',
    when: x.paidAt || null,
    customerName: x.customerName || '',
    orderType: x.orderType || '',
    paymentMethod: x.paymentMethod || '',
    ojolPlatform: x.ojolPlatform || '',
    ojolOrderNumber: x.ojolOrderNumber || '',
    splits: Array.isArray(x.splitPayments) ? x.splitPayments.map((p) => ({ method: p.method, amount: n(p.amount) })) : [],
    amountPaid: x.amount_paid == null ? null : n(x.amount_paid),
    change: x.change_amount == null ? null : n(x.change_amount),
    items: (x.items || []).map((i) => ({ name: i.name, note: i.note || '', qty: n(i.qty), price: n(i.price) })),
    subtotal: n(x.subtotal), voucherDiscount: n(x.voucherDiscount), manualDiscountAmount: n(x.manualDiscountAmount),
    deliveryFee: n(x.deliveryFee), total: n(x.total),
  });
}

/** Baris transaksi lunas dari useReportData (kolom snake_case; items = transaction_items). */
export function receiptFromSale(s) {
  const x = s || {};
  return base({
    number: x.display_number || '',
    when: x.paid_at || x.created_at || null,
    customerName: x.customer_name || '',
    orderType: x.order_type || '',
    paymentMethod: x.payment_method || '',
    ojolPlatform: x.payment_method === 'Ojol' ? (x.ojol_platform || '') : '',
    ojolOrderNumber: x.payment_method === 'Ojol' ? (x.ojol_order_number || '') : '',
    splits: Array.isArray(x.split_payments_json) ? x.split_payments_json.map((p) => ({ method: p.method, amount: n(p.amount) })) : [],
    amountPaid: x.amount_paid == null ? null : n(x.amount_paid),
    change: x.change_amount == null ? null : n(x.change_amount),
    items: (x.items || []).map((i) => ({ name: i.name, note: itemNote(i.variant_name, i.note), qty: n(i.qty), price: n(i.price) })),
    subtotal: n(x.subtotal), voucherDiscount: n(x.voucher_discount), manualDiscountAmount: n(x.manual_discount_amount),
    deliveryFee: n(x.delivery_fee), total: n(x.total),
  });
}

/** Pesanan tersimpan (orderFromRow): belum dibayar, jadi tanpa metode bayar. Waktu = kapan disimpan. */
export function receiptFromSaved(o) {
  const x = o || {};
  return base({
    number: x.number || '',
    status: 'belum',
    when: x.createdAt || null,
    customerName: x.customerName || '',
    orderType: x.orderType || '',
    items: (x.items || []).map((i) => ({ name: i.name, note: itemNote(i.variantName, i.note), qty: n(i.qty), price: n(i.price) })),
    subtotal: n(x.subtotal), voucherCode: x.voucherCode || '', voucherDiscount: n(x.voucherDiscount),
    manualDiscountAmount: n(x.manualDiscountAmount), deliveryFee: n(x.deliveryFee), total: n(x.total),
  });
}

/** Nama berkas aman untuk dibagikan: Struk-<nomor>.png, atau Tagihan-<nomor>.png kalau belum dibayar. */
export function receiptFilename(r) {
  const num = String(r?.number || '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'pesanan';
  return `${r?.status === 'belum' ? 'Tagihan' : 'Struk'}-${num}.png`;
}

/** Judul pada menu share (mis. nama berkas di WhatsApp). */
export const receiptShareTitle = (r) =>
  `${r?.status === 'belum' ? 'Tagihan' : 'Struk'} #${r?.number || ''}${r?.customerName ? ` · ${r.customerName}` : ''}`;
