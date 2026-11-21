/**
 * transactionEditMath — Ubah transaksi (permintaan pemilik 21 Nov 2026, migrasi 024). FUNGSI MURNI (dites di transactionEditMath.test.js).
 *
 * Aturan:
 *  - Transaksi lunas boleh diubah LANGSUNG dalam `EDIT_WINDOW_MINUTES` (30) sejak dibayar. Lewat itu staf wajib
 *    MENGAJUKAN ubah ke owner (sheet Persetujuan). Owner boleh kapan saja. Batas yang sama dicek di database
 *    (`ubah_transaksi`, 30 menit): ubah KEDUANYA bersamaan.
 *  - Yang bisa diubah: nama pelanggan, tipe pesanan, metode bayar (+ aplikasi/no. Ojol, uang diterima), jumlah item
 *    (hanya dikurangi) atau hapus item. Tidak bisa: tambah item, ongkir, dan untuk Split Payment hanya nama + tipe.
 *  - Diskon tidak dihitung ulang (nominal tersimpan tetap, total tidak pernah di bawah 0).
 *  - Database yang menghitung ulang subtotal/total/kembalian; fungsi di sini hanya memprediksi hasilnya untuk tampilan
 *    dan menyusun `changes` (hanya kolom yang berubah). Rumusnya HARUS sama dengan `terapkan_ubah_transaksi` di SQL.
 */

export const EDIT_WINDOW_MINUTES = 30;
export const ORDER_TYPES = ['Takeaway', 'Dine-in', 'Delivery', 'Ojol'];
export const EDIT_METHODS = ['Tunai', 'QRIS', 'Transfer', 'Ojol'];

const rp = (n) => { const v = Math.round(Number(n)); return Number.isFinite(v) ? v : 0; };
const digits = (v) => String(v ?? '').replace(/\D/g, '');

export const isSplitSale = (sale) => sale?.payment_method === 'Split Payment';
export const saleTimeMs = (sale) => new Date(sale?.paid_at || sale?.created_at || 0).getTime();

/** Sisa waktu ubah langsung. `minutesLeft` dibulatkan ke atas (0 = habis), `fraction` = bagian yang sudah terpakai (0..1). */
export function editWindow(sale, now = Date.now()) {
  const limitMs = EDIT_WINDOW_MINUTES * 60 * 1000;
  const elapsed = Math.max(0, now - saleTimeMs(sale));
  const left = limitMs - elapsed;
  return {
    open: left > 0,
    minutesLeft: left > 0 ? Math.ceil(left / 60000) : 0,
    fraction: Math.min(1, elapsed / limitMs),
  };
}

/** 'langsung' = boleh ubah sekarang; 'ajukan' = harus lewat persetujuan owner. */
export function editAccess({ sale, isOwner, now = Date.now() }) {
  if (isOwner) return 'langsung';
  return editWindow(sale, now).open ? 'langsung' : 'ajukan';
}

// ---------------------------------------------------------------------------------------------
// Draft (isian form) <-> snapshot (bentuk yang sama dengan snapshot_transaksi() di SQL)
// ---------------------------------------------------------------------------------------------

/** Isi awal form dari satu transaksi (dengan `items` dari useReportData: id, name, variant_name, qty, price). */
export function draftFromSale(sale) {
  return {
    name: sale?.customer_name || '',
    type: sale?.order_type || 'Takeaway',
    method: sale?.payment_method || 'Tunai',
    platform: sale?.ojol_platform || '',
    orderNo: sale?.ojol_order_number || '',
    received: sale?.payment_method === 'Tunai' && sale?.amount_paid != null ? String(rp(sale.amount_paid)) : '',
    items: (sale?.items || []).map((it) => ({
      id: it.id, name: it.name, variant: it.variant_name || '', price: rp(it.price), qty: rp(it.qty), origQty: rp(it.qty), gone: false,
    })),
    by: '',
    reason: '',
  };
}

/** Snapshot transaksi apa adanya (sebelum diubah). */
export function snapshotFromSale(sale) {
  return {
    customer_name: sale?.customer_name || null,
    order_type: sale?.order_type || null,
    payment_method: sale?.payment_method || null,
    ojol_platform: sale?.ojol_platform || null,
    ojol_order_number: sale?.ojol_order_number || null,
    amount_paid: sale?.amount_paid == null ? null : rp(sale.amount_paid),
    change_amount: sale?.change_amount == null ? null : rp(sale.change_amount),
    subtotal: rp(sale?.subtotal),
    total: rp(sale?.total),
    items: (sale?.items || []).map((it) => ({ id: it.id, name: it.name, variant_name: it.variant_name || null, qty: rp(it.qty), price: rp(it.price) })),
  };
}

const liveItems = (draft) => draft.items.filter((i) => !i.gone);
export const itemsChanged = (draft) => draft.items.some((i) => i.gone || i.qty !== i.origQty);

/** Subtotal dan total hasil ubah, sama dengan rumus di SQL (diskon tersimpan tetap; ongkir hanya untuk Delivery). */
export function calcDraft(draft, sale) {
  const changed = itemsChanged(draft);
  const subtotal = changed ? liveItems(draft).reduce((a, i) => a + i.price * i.qty, 0) : rp(sale?.subtotal);
  const fee = draft.type === 'Delivery' ? rp(sale?.delivery_fee) : 0;
  const feeChanged = fee !== rp(sale?.delivery_fee);
  const total = changed || feeChanged
    ? Math.max(0, subtotal - rp(sale?.voucher_discount) - rp(sale?.manual_discount_amount)) + fee
    : rp(sale?.total);
  return { subtotal, total, fee };
}

/** Prediksi snapshot sesudah diubah (untuk ringkasan perubahan di form). */
export function snapshotFromDraft(draft, sale) {
  const { subtotal, total } = calcDraft(draft, sale);
  const split = isSplitSale(sale);
  const method = split ? sale.payment_method : draft.method;
  let paid = null, change = null;
  if (split) { paid = sale.amount_paid == null ? null : rp(sale.amount_paid); change = sale.change_amount == null ? null : rp(sale.change_amount); }
  else if (method === 'Tunai') {
    const typed = draft.received === '' ? null : rp(digits(draft.received));
    paid = typed ?? (sale?.payment_method === 'Tunai' && sale?.amount_paid != null ? rp(sale.amount_paid) : null);
    change = paid == null ? null : paid - total;
  }
  return {
    customer_name: draft.name.trim() || null,
    order_type: draft.type,
    payment_method: method,
    ojol_platform: method === 'Ojol' ? (draft.platform || null) : null,
    ojol_order_number: method === 'Ojol' ? (draft.orderNo.trim() || null) : null,
    amount_paid: paid,
    change_amount: change,
    subtotal,
    total,
    items: liveItems(draft).map((i) => ({ id: i.id, name: i.name, variant_name: i.variant || null, qty: i.qty, price: i.price })),
  };
}

/** `changes` untuk RPC: hanya kolom yang berubah (bentuknya dibaca terapkan_ubah_transaksi). */
export function draftChanges(draft, sale) {
  const out = {};
  const split = isSplitSale(sale);
  if (draft.name.trim() !== (sale?.customer_name || '')) out.customer_name = draft.name.trim();
  if (draft.type !== sale?.order_type) out.order_type = draft.type;
  if (!split) {
    const methodChanged = draft.method !== sale?.payment_method;
    if (methodChanged) out.payment_method = draft.method;
    if (draft.method === 'Ojol') {
      if (methodChanged || draft.platform !== (sale?.ojol_platform || '')) out.ojol_platform = draft.platform;
      if (methodChanged || draft.orderNo.trim() !== (sale?.ojol_order_number || '')) out.ojol_order_number = draft.orderNo.trim();
    }
    if (draft.method === 'Tunai') {
      const typed = draft.received === '' ? null : rp(digits(draft.received));
      if (typed != null && (methodChanged || typed !== (sale?.amount_paid == null ? null : rp(sale.amount_paid)))) out.amount_paid = typed;
    }
    const items = draft.items.filter((i) => i.gone || i.qty !== i.origQty).map((i) => ({ id: i.id, qty: i.gone ? 0 : i.qty }));
    if (items.length) out.items = items;
  }
  return out;
}

export const hasChanges = (changes) => Object.keys(changes || {}).length > 0;

/** Pesan galat untuk tombol simpan (null = boleh). Pesan "Belum ada perubahan." dipakai untuk menonaktifkan tombol. */
export function validateDraft(draft, sale) {
  const changes = draftChanges(draft, sale);
  if (!hasChanges(changes)) return 'Belum ada perubahan.';
  if (!isSplitSale(sale)) {
    if (liveItems(draft).length === 0) return 'Transaksi harus punya minimal satu item.';
    if (draft.method === 'Ojol' && !draft.platform) return 'Pilih aplikasi Ojol.';
    if (draft.method === 'Tunai') {
      const after = snapshotFromDraft(draft, sale);
      // Transaksi Tunai lama tanpa uang diterima (impor) boleh tetap kosong; pindah dari metode lain ke Tunai wajib mengisi.
      if (after.amount_paid == null) { if (sale?.payment_method !== 'Tunai') return 'Isi uang diterima.'; }
      else if (after.amount_paid < after.total) return 'Uang diterima kurang dari total.';
    }
  }
  return null;
}

/** Validasi form Ajukan Ubah (alasan + nama wajib). Mengembalikan nilai rapi atau melempar Error berpesan Indonesia. */
export function validateEditRequest({ reason, requestedBy } = {}) {
  const r = String(reason || '').trim();
  const by = String(requestedBy || '').trim();
  if (!r) throw new Error('Isi alasan kenapa transaksi ini diubah.');
  if (!by) throw new Error('Pilih namamu dulu.');
  return { reason: r, requestedBy: by };
}

// ---------------------------------------------------------------------------------------------
// Ringkasan sebelum -> sesudah (form, kartu Persetujuan, riwayat perubahan)
// ---------------------------------------------------------------------------------------------

const dash = (v) => (v == null || v === '' ? '-' : String(v));
const itemLabel = (it) => (it.variant_name ? `${it.name} (${it.variant_name})` : it.name);

/**
 * Selisih dua snapshot jadi baris { label, from, to } siap tampil. `fmt` = formatRupiah milik app.
 * Item dicocokkan lewat id: jumlah berubah = "2 pcs -> 1 pcs", hilang = "dihapus". Total ditaruh setelah item.
 */
export function describeSnapshots(before, after, fmt = (n) => `Rp ${rp(n).toLocaleString('id-ID')}`) {
  const b = before || {}, a = after || {};
  const out = [];
  const same = (x, y) => (x ?? null) === (y ?? null);
  if (!same(b.customer_name, a.customer_name)) out.push({ label: 'Pelanggan', from: b.customer_name || 'Umum', to: a.customer_name || 'Umum' });
  if (!same(b.order_type, a.order_type)) out.push({ label: 'Tipe pesanan', from: dash(b.order_type), to: dash(a.order_type) });
  if (!same(b.payment_method, a.payment_method)) out.push({ label: 'Metode bayar', from: dash(b.payment_method), to: dash(a.payment_method) });
  if (!same(b.ojol_platform, a.ojol_platform)) out.push({ label: 'Aplikasi Ojol', from: dash(b.ojol_platform), to: dash(a.ojol_platform) });
  if (!same(b.ojol_order_number, a.ojol_order_number)) out.push({ label: 'No. Order Ojol', from: dash(b.ojol_order_number), to: dash(a.ojol_order_number) });
  const after_ = new Map((a.items || []).map((i) => [i.id, i]));
  for (const it of b.items || []) {
    const now = after_.get(it.id);
    if (!now) out.push({ label: itemLabel(it), from: `${it.qty} pcs`, to: 'dihapus' });
    else if (now.qty !== it.qty) out.push({ label: itemLabel(it), from: `${it.qty} pcs`, to: `${now.qty} pcs` });
  }
  if (rp(b.total) !== rp(a.total)) out.push({ label: 'Total', from: fmt(b.total), to: fmt(a.total) });
  if (!same(b.amount_paid, a.amount_paid) && a.amount_paid != null) {
    out.push({ label: 'Uang diterima', from: b.amount_paid == null ? '-' : fmt(b.amount_paid), to: fmt(a.amount_paid) });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Baris database -> bentuk tampilan
// ---------------------------------------------------------------------------------------------

const STATUS = ['menunggu', 'disetujui', 'ditolak'];

export const mapEditRequest = (r) => ({
  id: r.id, transactionId: r.transaction_id, number: r.display_number || '', customer: r.customer_name || '',
  orderType: r.order_type || '', paymentMethod: r.payment_method || '', total: rp(r.total), at: r.transaction_at || '',
  changes: r.changes || {}, before: r.before || {}, after: r.after || {}, reason: r.reason || '', requestedBy: r.requested_by || '',
  deviceName: r.device_name || '', status: STATUS.includes(r.status) ? r.status : 'menunggu',
  rejectReason: r.reject_reason || '', decidedBy: r.decided_by || '', createdAt: r.created_at || '',
});

export const mapEditLog = (r) => ({
  id: r.id, transactionId: r.transaction_id, number: r.display_number || '', by: r.edited_by || '', via: r.via === 'persetujuan' ? 'persetujuan' : 'langsung',
  reason: r.reason || '', deviceName: r.device_name || '', before: r.before || {}, after: r.after || {}, createdAt: r.created_at || '',
});

/** Catatan perubahan -> Set id transaksi yang pernah diubah (penanda pensil di Riwayat). */
export const editedIds = (logs) => new Set((logs || []).map((l) => l.transactionId));

/** Catatan perubahan satu transaksi, terbaru dulu. */
export const logsFor = (logs, transactionId) =>
  (logs || []).filter((l) => l.transactionId === transactionId).sort((x, y) => (x.createdAt < y.createdAt ? 1 : x.createdAt > y.createdAt ? -1 : 0));
