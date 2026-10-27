/**
 * stockMath — rumus murni Stok Belanja (dites di stockMath.test.js). Tanpa React, tanpa Supabase.
 *
 * Bentuk data:
 *   master  = [{ id, name, items: [{ id, name, unit, min_qty, required }] }]   (urut tampil)
 *   counts  = { [itemId]: { qty: number|null, skipped: boolean } }              (isian hari ini)
 *   latest  = { [itemId]: { qty: number, day, saved_by, saved_at } }            (stok terakhir TERSIMPAN)
 */

/** Hari bisnis mulai 04.00 WIB (sama dengan stok_hari_bisnis() di migrasi 020): tanggal WIB dikurangi 4 jam. */
export const BUSINESS_DAY_SHIFT_HOURS = 7 - 4;   // WIB = UTC+7, dikurangi 4 jam => geser 3 jam dari UTC

/** Tanggal bisnis `YYYY-MM-DD` untuk waktu `now` (Date atau ms). */
export function businessDate(now = new Date()) {
  const ms = (now instanceof Date ? now.getTime() : Number(now)) + BUSINESS_DAY_SHIFT_HOURS * 3600_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export const STATUS_ORDER = ['habis', 'menipis', 'aman', 'belum'];
export const STATUS_META = {
  habis:   { label: 'Habis',       badge: 'danger'  },
  menipis: { label: 'Menipis',     badge: 'warning' },
  aman:    { label: 'Aman',        badge: 'success' },
  belum:   { label: 'Belum dicek', badge: 'neutral' },
};

/** Habis = 0, Menipis = di atas 0 sampai batas (min), Aman = di atas batas. Tanpa angka = Belum dicek. Batas 0 = tidak pernah Menipis. */
export function stockStatus(qty, min) {
  if (qty === null || qty === undefined || qty === '' || Number.isNaN(Number(qty))) return 'belum';
  const q = Number(qty);
  if (q <= 0) return 'habis';
  return q <= (Number(min) || 0) ? 'menipis' : 'aman';
}

/** Teks isian -> angka >= 0. Koma desimal diterima ("2,5"). Kosong/tidak valid = null. */
export function parseQty(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

/** Angka -> teks tampil dengan koma desimal ("2,5"), tanpa nol di belakang. */
export function formatQty(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '';
  return String(Math.round(Number(n) * 100) / 100).replace('.', ',');
}

/** Satu baris per item (urutan kategori lalu item) dengan stok terakhir tersimpan dan statusnya. */
export function stockRows(master, latest = {}) {
  const rows = [];
  for (const category of master) {
    for (const item of category.items) {
      const last = latest[item.id];
      const qty = last ? Number(last.qty) : null;
      rows.push({ item, category, qty, status: stockStatus(qty, item.min_qty), day: last?.day ?? null, savedBy: last?.saved_by ?? '' });
    }
  }
  return rows;
}

/** Urutkan Habis -> Menipis -> Aman -> Belum dicek; di dalam status, urutan asli dipertahankan. */
export function sortByStatus(rows) {
  const rank = (s) => STATUS_ORDER.indexOf(s);
  return rows.map((r, i) => [r, i]).sort((a, b) => rank(a[0].status) - rank(b[0].status) || a[1] - b[1]).map((x) => x[0]);
}

export function countByStatus(rows) {
  const out = { habis: 0, menipis: 0, aman: 0, belum: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/** Yang perlu dibeli = Habis + Menipis, Habis dulu. */
export function buyList(rows) {
  return sortByStatus(rows.filter((r) => r.status === 'habis' || r.status === 'menipis'));
}

export function buyListText(rows, dateLabel = '') {
  const list = buyList(rows);
  const head = `Daftar belanja${dateLabel ? ` — ${dateLabel}` : ''}`;
  if (!list.length) return `${head}\nTidak ada yang perlu dibeli.`;
  return [head, ...list.map((r) => `- ${r.item.name} (${STATUS_META[r.status].label.toLowerCase()}, sisa ${formatQty(r.qty)} ${r.item.unit})`)].join('\n');
}

const hasQty = (c) => Boolean(c) && c.qty !== null && c.qty !== undefined && !Number.isNaN(Number(c.qty));

/** Item dianggap beres: ada angkanya, atau (hanya kalau opsional) dilewati. */
export const itemOk = (item, c) => hasQty(c) || (!item.required && Boolean(c?.skipped));

/** { filled, total } untuk item WAJIB di satu kategori. */
export function categoryProgress(category, counts = {}) {
  const required = category.items.filter((i) => i.required);
  return { filled: required.filter((i) => hasQty(counts[i.id])).length, total: required.length };
}

export const categoryReady = (category, counts) => {
  const { filled, total } = categoryProgress(category, counts);
  return filled === total;
};

/** Kategori yang ikut menentukan gate = yang punya minimal satu item wajib. */
export const gatingCategories = (master) => master.filter((c) => c.items.some((i) => i.required));

/** Boleh simpan? Semua kategori penentu sudah ditandai selesai dan semua item wajib berisi angka. */
export function saveCheck(master, counts = {}, doneIds = []) {
  const gating = gatingCategories(master);
  if (!gating.length) return { ok: false, reason: 'Belum ada item wajib. Tambahkan di tab Kelola.' };
  const open = gating.filter((c) => !doneIds.includes(c.id));
  if (open.length) return { ok: false, reason: `${open.length} kategori belum ditandai selesai.` };
  const missing = gating.flatMap((c) => c.items.filter((i) => i.required && !hasQty(counts[i.id])));
  if (missing.length) return { ok: false, reason: `${missing.length} item wajib belum diisi.` };
  return { ok: true, reason: '' };
}

/** Geser `id` satu langkah (dir -1 naik, +1 turun) di daftar id. Di ujung / id tak dikenal = tidak berubah. */
export function moveId(ids, id, dir) {
  const from = ids.indexOf(id), to = from + dir;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  const next = ids.slice();
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Ringkas isian satu hari lama (riwayat) jadi hitungan status memakai batas menipis item SEKARANG. Hanya item yang punya angka hari itu. */
export function daySummary(master, dayCounts = []) {
  const filled = {};
  for (const c of dayCounts) {
    if (c.qty !== null && c.qty !== undefined) filled[c.item_id] = { qty: Number(c.qty) };
  }
  return countByStatus(stockRows(master, filled).filter((r) => r.qty !== null));
}

/** "2026-10-25" -> "Min, 25 Okt" (tanggal apa adanya, tanpa geser zona waktu). */
export function dayLabel(day) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getUTCDay()]}, ${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'][d.getUTCMonth()]}`;
}
