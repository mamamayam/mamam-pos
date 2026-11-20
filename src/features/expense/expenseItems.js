/**
 * expenseItems — rincian harga per item pada Pengeluaran (permintaan pemilik 20 Nov 2026). FUNGSI MURNI (dites).
 *
 * Baris Detail pengeluaran boleh diberi harga. Disimpan di expenses.detail_items (jsonb, migrasi 023):
 *   [{ "name": "Ayam 5 kg", "price": 190000 }, { "name": "Plastik kresek", "price": null }]
 * price = harga BARIS itu (bukan harga satuan), integer rupiah; null = baris tanpa harga (tidak ikut dijumlah).
 *
 * Teks `detail` tetap diisi nama item satu per baris seperti sebelumnya, jadi Riwayat, Laporan, pengajuan hapus, dan
 * layar lain yang membaca `detail` tidak berubah. `amount` = jumlah harga baris berharga selama ada minimal satu;
 * tanpa satu pun harga, Jumlah diisi manual seperti biasa dan detail_items tidak dikirim (null).
 *
 * Isian form: rows = [{ t: nama, p: harga berupa teks digit }]; harga datang dari NominalInput (keypad), selalu digit.
 */
export const MAX_ITEMS = 100;
const MAX_AMOUNT = 2000000000;   // batas kolom integer Postgres

const int = (v) => { const n = Number(String(v ?? '').replace(/[^\d]/g, '')); return Number.isFinite(n) ? n : 0; };
const name = (v) => String(v ?? '').trim();
// Harga dari database: hanya bilangan bulat tak negatif (angka atau teks digit); selain itu 0 = tanpa harga.
// (`int` di atas untuk isian keypad, yang membuang semua non-digit, jadi tidak dipakai untuk data tersimpan.)
const storedPrice = (v) => { const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v; return Number.isInteger(n) && n > 0 ? n : 0; };

export const emptyRow = () => ({ t: '', p: '' });

/** Baris form dari teks detail (satu poin per baris, tanpa harga); minimal satu baris. */
export function rowsFromNote(note) {
  const lines = String(note || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  return (lines.length ? lines : ['']).map((t) => ({ t, p: '' }));
}

/** Baca kolom jsonb dengan aman. null = tidak ada rincian harga (kosong, rusak, atau tak satu pun baris berharga). */
export function parseItems(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!Array.isArray(v)) return null;
  const list = v
    .map((r) => ({ name: name(r?.name), price: storedPrice(r?.price) }))
    .filter((r) => r.name || r.price > 0)
    .map((r) => ({ name: r.name, price: r.price > 0 ? r.price : null }));
  return list.some((r) => r.price) ? list : null;
}

/** Baris form dari rincian tersimpan; null kalau catatan itu tidak punya rincian harga. */
export function rowsFromItems(raw) {
  const list = parseItems(raw);
  return list ? list.map((i) => ({ t: i.name, p: i.price ? String(i.price) : '' })) : null;
}

export const pricedRows = (rows) => (rows || []).filter((r) => int(r?.p) > 0);
export const filledRows = (rows) => (rows || []).filter((r) => name(r?.t) || int(r?.p) > 0);
export const rowsTotal = (rows) => pricedRows(rows).reduce((s, r) => s + int(r.p), 0);
/** Jumlah terkunci (dihitung otomatis) hanya kalau saklar harga menyala DAN ada minimal satu baris berharga. */
export const isLocked = (priceMode, rows) => Boolean(priceMode) && pricedRows(rows).length > 0;
export const stripPrices = (rows) => (rows || []).map((r) => ({ t: r?.t ?? '', p: '' }));
export const noteFromRows = (rows) => (rows || []).map((r) => name(r?.t)).filter(Boolean).join('\n');

/**
 * Isian form -> { amount, note, items } siap simpan. Melempar Error berpesan Indonesia kalau ada baris berharga tanpa nama.
 * items = null kalau tidak ada rincian harga (saklar mati, atau tak satu pun baris berharga).
 */
export function buildExpenseDetail({ priceMode, rows, manualAmount }) {
  const note = noteFromRows(rows);
  if (!isLocked(priceMode, rows)) return { amount: int(manualAmount), note, items: null };
  const items = [];
  (rows || []).forEach((r, i) => {
    const n = name(r?.t); const price = int(r?.p);
    if (!n && !price) return;
    if (!n) throw new Error(`Baris ${i + 1}: isi nama item yang berharga.`);
    items.push({ name: n, price: price > 0 ? price : null });
  });
  if (items.length > MAX_ITEMS) throw new Error(`Detail maksimal ${MAX_ITEMS} baris.`);
  const amount = rowsTotal(rows);
  if (amount > MAX_AMOUNT) throw new Error('Total harga item terlalu besar.');
  return { amount, note, items };
}

/** Jumlah harga baris berharga dari rincian tersimpan. */
export const itemsTotal = (items) => (items || []).reduce((s, r) => s + (Number(r?.price) || 0), 0);

/** Baris untuk layar Detail: [{ text, price|null }]. Tanpa rincian harga = poin dari teks detail, tanpa harga. */
export function detailLines(note, items) {
  if (items && items.length) return items.map((i) => ({ text: i.name || '(tanpa nama)', price: i.price || null }));
  return String(note || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean).map((text) => ({ text, price: null }));
}

/** Galat simpan karena kolom detail_items belum ada (migrasi 023 belum dijalankan). */
export const itemsColumnMissing = (e) => Boolean(e) && /detail_items/i.test(e.message || '');

export const ITEMS_MIGRATION_HINT = 'Harga per item butuh migrasi 023 (supabase/migrations/023_pengeluaran_rincian_harga.sql). Jalankan dulu di SQL Editor, atau matikan saklar "Harga per item".';
