/**
 * deleteRequestMath — pengajuan hapus transaksi (migrasi 016) dan pengeluaran (migrasi 018): staf mengajukan,
 * owner memutuskan. Bentuk pengajuannya sama (alasan, pengaju, status), jadi validasi dan indeks dipakai bersama.
 * FUNGSI MURNI (dites di deleteRequestMath.test.js).
 */

export const REQUEST_STATUS = { PENDING: 'menunggu', APPROVED: 'disetujui', REJECTED: 'ditolak' };

const normalizeStatus = (s) => (Object.values(REQUEST_STATUS).includes(s) ? s : REQUEST_STATUS.PENDING);

/** Baris tabel transaction_delete_requests -> bentuk yang dipakai tampilan. */
export const mapDeleteRequest = (r) => ({
  id: r.id, transactionId: r.transaction_id, number: r.display_number || '', customer: r.customer_name || '',
  orderType: r.order_type || '', paymentMethod: r.payment_method || '', total: Number(r.total) || 0,
  at: r.transaction_at || '', items: r.items_summary || '', reason: r.reason || '', requestedBy: r.requested_by || '',
  status: normalizeStatus(r.status), rejectReason: r.reject_reason || '', createdAt: r.created_at || '',
});

/** Baris tabel expense_delete_requests -> bentuk yang dipakai tampilan. `expenseId` = kunci indeks (lihat requestIndex). */
export const mapExpenseDeleteRequest = (r) => ({
  id: r.id, expenseId: r.expense_id, date: r.expense_date || '', category: r.category || '', supplier: r.supplier || '',
  detail: r.detail || '', paymentMethod: r.payment_method || '', amount: Number(r.amount) || 0,
  employeeId: r.employee_id || null, employeeName: r.employee_name || '',
  reason: r.reason || '', requestedBy: r.requested_by || '',
  status: normalizeStatus(r.status), rejectReason: r.reject_reason || '', createdAt: r.created_at || '',
});

/**
 * Validasi form pengajuan. Mengembalikan nilai yang sudah dirapikan atau melempar Error berpesan Indonesia.
 * `noun` = yang dihapus ('transaksi' | 'pengeluaran'), hanya untuk kalimat pesannya.
 */
export function validateDeleteRequest({ reason, requestedBy } = {}, noun = 'transaksi') {
  const r = String(reason || '').trim();
  const by = String(requestedBy || '').trim();
  if (!r) throw new Error(`Isi alasan kenapa ${noun} ini harus dihapus.`);
  if (!by) throw new Error('Pilih namamu dulu.');
  return { reason: r, requestedBy: by };
}

/**
 * Indeks per catatan untuk Riwayat / Pengeluaran: kunci -> pengajuan yang relevan. `keyOf` memilih kuncinya
 * (bawaan transactionId; pengeluaran memakai (r) => r.expenseId).
 * 'menunggu' menang; kalau tidak ada, pengajuan 'ditolak' TERBARU (supaya staf tahu kenapa ditolak).
 * 'disetujui' tidak masuk: transaksinya sudah tidak ada.
 */
export function requestIndex(requests, keyOf = (r) => r.transactionId) {
  const map = new Map();
  for (const r of requests || []) {
    if (r.status === REQUEST_STATUS.APPROVED) continue;
    const key = keyOf(r);
    const cur = map.get(key);
    if (!cur) { map.set(key, r); continue; }
    if (cur.status === REQUEST_STATUS.PENDING) continue;
    if (r.status === REQUEST_STATUS.PENDING || r.createdAt > cur.createdAt) map.set(key, r);
  }
  return map;
}

/** Pengajuan yang menunggu, terlama dulu (yang paling lama menunggu di atas). */
export const pendingDeleteRequests = (requests) =>
  (requests || []).filter((r) => r.status === REQUEST_STATUS.PENDING)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0));
