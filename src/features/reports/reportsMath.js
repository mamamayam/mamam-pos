/**
 * reportsMath — rumus Laporan. FUNGSI MURNI (tanpa React/Supabase).
 *
 * Aturan Laporan (tab Laba Rugi):
 *    Laba Kotor = Total Penjualan − Total Pengeluaran
 *  - Total Penjualan  = transaksi lunas pada periode.
 *  - Total Pengeluaran = SEMUA catatan pengeluaran pada periode, apa pun kategori
 *    dan sumber dananya (tunai / non-tunai): belanja, bayar ayam, kasbon, gaji, dll.
 *    Tidak ada kategori yang dikecualikan, dan HPP menu tidak ikut dihitung.
 */

const num = (v) => Number(v) || 0;

// ── Periode (tanggal lokal) ───────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
export const localDateString = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDaysLocal = (dateStr, n) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateString(new Date(y, m - 1, d + n));
};

/**
 * Rentang tanggal inklusif dari pilihan filter. `semua` -> { fromDate:null, toDate:null }.
 * `tanggal-terpilih` tanpa tanggal akhir = satu hari (tanggal awal).
 */
export function periodRange(mode, custom = {}, today = localDateString()) {
  switch (mode) {
    case 'hari-ini': return { fromDate: today, toDate: today };
    case 'kemarin': { const y = addDaysLocal(today, -1); return { fromDate: y, toDate: y }; }
    case 'bulan-ini': return { fromDate: `${today.slice(0, 7)}-01`, toDate: today };
    case 'tanggal-terpilih': {
      if (!custom.start) return { fromDate: null, toDate: null };
      return { fromDate: custom.start, toDate: custom.end || custom.start };
    }
    default: return { fromDate: null, toDate: null };
  }
}

// ── Navigasi periode Laporan (bulanan / harian / semua / rentang) ─────
// Semua fungsi di bawah memakai tanggal lokal 'YYYY-MM-DD' / kunci bulan 'YYYY-MM'.
const MONTH_NAMES = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const MONTH_SHORT = MONTH_NAMES.map(m => m.slice(0, 3));
const DAY_SHORT = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Geser kunci bulan: shiftMonthKey('2026-01', -1) -> '2025-12'. */
export function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** '2026-09' -> 'September 2026'. */
export const monthLabel = (key) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** '2026-09-30' -> 'Rab, 30 Sep 2026' (nama hari dari tanggal LOKAL, bukan UTC). */
export function dayLabel(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${DAY_SHORT[new Date(y, m - 1, d).getDay()]}, ${d} ${MONTH_SHORT[m - 1]} ${y}`;
}

/** '2026-09-30' -> '30 Sep 2026'. */
export const shortDateLabel = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
};

/**
 * Rentang satu bulan penuh. Bulan berjalan berhenti di hari ini (sama seperti "Bulan Ini"
 * lama); bulan lalu sampai tanggal terakhirnya.
 */
export function monthRange(key, today = localDateString()) {
  const [y, m] = key.split('-').map(Number);
  const last = localDateString(new Date(y, m, 0));
  return { fromDate: `${key}-01`, toDate: key === today.slice(0, 7) ? today : last };
}

/** Pilihan bulan untuk sheet: bulan berjalan dulu, lalu mundur. Tanpa bulan depan (belum ada data). */
export function monthOptions(today = localDateString(), count = 24) {
  const cur = today.slice(0, 7);
  return Array.from({ length: count }, (_, i) => {
    const key = shiftMonthKey(cur, -i);
    return { value: key, label: monthLabel(key), tag: i === 0 ? 'Bulan ini' : undefined };
  });
}

/** Pilihan hari untuk sheet: hari ini dulu, lalu mundur. */
export function dayOptions(today = localDateString(), count = 45) {
  return Array.from({ length: count }, (_, i) => {
    const d = addDaysLocal(today, -i);
    return { value: d, label: dayLabel(d), tag: i === 0 ? 'Hari ini' : undefined };
  });
}

/** Tombol cepat rentang: N hari terakhir termasuk hari ini. */
export const lastDaysRange = (days, today = localDateString()) => ({ start: addDaysLocal(today, -(days - 1)), end: today });

/** Geser tanggal 'YYYY-MM-DD' sejumlah hari (untuk tombol < > pada mode Harian). */
export const shiftDate = (dateStr, n) => addDaysLocal(dateStr, n);

/**
 * Pilihan filter Laporan -> rentang tanggal inklusif.
 *   sel = { mode: 'bulan'|'hari'|'semua'|'rentang', month:'YYYY-MM', day:'YYYY-MM-DD', start, end }
 * `rentang` tanpa tanggal awal = null (belum bisa dihitung; layar minta pilih tanggal dulu,
 * BUKAN jatuh ke "semua data"). Tanggal terbalik (akhir < awal) ditukar otomatis.
 */
export function reportRange(sel, today = localDateString()) {
  switch (sel.mode) {
    case 'bulan': return monthRange(sel.month, today);
    case 'hari': return { fromDate: sel.day, toDate: sel.day };
    case 'semua': return { fromDate: null, toDate: null };
    case 'rentang': {
      if (!sel.start) return null;
      const end = sel.end || sel.start;
      return sel.end && end < sel.start ? { fromDate: end, toDate: sel.start } : { fromDate: sel.start, toDate: end };
    }
    default: return { fromDate: null, toDate: null };
  }
}

/**
 * Teks periode untuk judul Income Statement: 'Oktober 2026' / 'Rab, 30 Sep 2026' / 'Semua periode' /
 * '1 Okt 2026 – 15 Okt 2026'. Rentang tanpa tanggal awal = '' (layar belum menampilkan apa pun).
 */
export function periodLabel(sel) {
  switch (sel.mode) {
    case 'bulan': return monthLabel(sel.month);
    case 'hari': return dayLabel(sel.day);
    case 'semua': return 'Semua periode';
    case 'rentang': {
      const r = reportRange(sel);
      if (!r) return '';
      return r.fromDate === r.toDate ? shortDateLabel(r.fromDate) : `${shortDateLabel(r.fromDate)} – ${shortDateLabel(r.toDate)}`;
    }
    default: return '';
  }
}

/** Awal hari lokal (00:00) sebagai ISO UTC — untuk filter kolom timestamptz. */
export const dayStartISO = (dateStr) => { const [y, m, d] = dateStr.split('-').map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString(); };
/** Awal hari BERIKUTNYA — dipakai sebagai batas atas eksklusif (< ). */
export const nextDayStartISO = (dateStr) => dayStartISO(addDaysLocal(dateStr, 1));

/** Tanggal lokal 'YYYY-MM-DD' dari timestamp ISO. */
export const localDateOf = (iso) => localDateString(new Date(iso));

// ── Ringkasan penjualan ───────────────────────────────────────────────
const itemsOf = (sale) => (Array.isArray(sale.items) ? sale.items : []);

export function summarizeSales(sales) {
  let total = 0;
  const byPayment = new Map(), byOrderType = new Map();
  const add = (map, key, amount) => {
    const k = key || 'Lainnya';
    const cur = map.get(k) || { key: k, count: 0, total: 0 };
    cur.count += 1; cur.total += amount; map.set(k, cur);
  };
  for (const s of sales) {
    const t = num(s.total);
    total += t;
    add(byPayment, s.payment_method, t);
    add(byOrderType, s.order_type, t);
  }
  const count = sales.length;
  const sortDesc = (m) => [...m.values()].sort((a, b) => b.total - a.total);
  return {
    count, total, average: count ? Math.round(total / count) : 0,
    byPayment: sortDesc(byPayment), byOrderType: sortDesc(byOrderType),
  };
}

/** Menu terlaris: dikelompokkan per menu_item_id (atau nama kalau id kosong). */
export function topMenus(sales, limit = 10) {
  const map = new Map();
  for (const s of sales) for (const it of itemsOf(s)) {
    const key = it.menu_item_id || `nama:${it.name}`;
    const cur = map.get(key) || { key, name: it.name, qty: 0, revenue: 0 };
    cur.qty += num(it.qty); cur.revenue += num(it.price) * num(it.qty);
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty || b.revenue - a.revenue).slice(0, limit);
}

/** Jumlah menu yang tampil di kartu Menu Terlaris sebelum tombol "Lainnya" ditekan. */
export const TOP_MENU_COUNT = 10;

/**
 * Daftar Menu Terlaris untuk tampilan: `menus` = SEMUA menu terjual (dari `topMenus(sales, Infinity)`, sudah urut).
 * Ringkas = TOP_MENU_COUNT teratas; `expanded` = semua. `canToggle` = tombol Lainnya/Ringkas perlu ada (hanya kalau ada
 * lebih dari TOP_MENU_COUNT menu), `hiddenCount` = jumlah menu yang belum tampil saat ringkas.
 */
export function menuListView(menus, expanded, limit = TOP_MENU_COUNT) {
  const canToggle = menus.length > limit;
  return { rows: expanded || !canToggle ? menus : menus.slice(0, limit), canToggle, hiddenCount: Math.max(0, menus.length - limit) };
}

// ── Ringkasan pengeluaran ─────────────────────────────────────────────
/**
 * Total semua pengeluaran + rincian per kategori (terbesar dulu). Kategori
 * dicocokkan tanpa peduli huruf besar/kecil & spasi; kategori kosong = 'Lainnya'.
 */
export function summarizeExpenses(expenses) {
  let total = 0;
  const byCat = new Map();
  for (const e of expenses) {
    const amount = num(e.amount);
    total += amount;
    const name = String(e.category ?? '').trim() || 'Lainnya';
    const key = name.toLowerCase();
    const cur = byCat.get(key) || { category: name, count: 0, total: 0 };
    cur.count += 1; cur.total += amount; byCat.set(key, cur);
  }
  return { count: expenses.length, total, byCategory: [...byCat.values()].sort((a, b) => b.total - a.total) };
}

/**
 * Keterangan satu baris untuk daftar pengeluaran: toko/pemasok lalu catatan.
 * Catatan disimpan satu poin per baris, jadi digabung dengan " · ".
 */
export function expenseDetailText(e) {
  const lines = String(e.detail ?? '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
  const supplier = String(e.store_or_supplier_name ?? '').trim();
  return [supplier, ...lines].filter(Boolean).join(' · ');
}
