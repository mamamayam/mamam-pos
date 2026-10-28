/**
 * riwayatFilter — saring, ringkas per metode bayar, dan urutkan transaksi Riwayat.
 * FUNGSI MURNI (dites di riwayatFilter.test.js).
 */

const num = (v) => Number(v) || 0;
export const saleTime = (s) => new Date(s.paid_at || s.created_at).getTime();
export const methodOf = (s) => s.payment_method || 'Lainnya';

/** Rincian Split Payment satu transaksi: [{ method, amount }] (kosong kalau bukan split / datanya tidak ada). */
export function splitPartsOf(sale) {
  if (sale?.payment_method !== 'Split Payment' || !Array.isArray(sale.split_payments_json)) return [];
  return sale.split_payments_json.filter((p) => p && p.method).map((p) => ({ method: p.method, amount: num(p.amount) }));
}

export const SORT_OPTIONS = [
  { key: 'terbaru', label: 'Terbaru Dulu', short: 'Terbaru' },
  { key: 'terlama', label: 'Terlama Dulu', short: 'Terlama' },
  { key: 'total-desc', label: 'Total Terbesar', short: 'Terbesar' },
  { key: 'total-asc', label: 'Total Terkecil', short: 'Terkecil' },
];
export const DEFAULT_SORT = 'terbaru';
/** Urutan yang mengikuti waktu -> daftar boleh dikelompokkan per hari. */
export const isTimeSort = (key) => key === 'terbaru' || key === 'terlama';

/**
 * Tipe order + perangkat + pencarian (belum metode bayar). Cari: nomor order, ID, nama pelanggan, nama perangkat.
 * device: 'semua' | id perangkat | 'tanpa' (transaksi lama sebelum ada pelacakan perangkat).
 */
export function filterSales(sales, { type = 'semua', query = '', device = 'semua' } = {}) {
  const q = String(query).trim().toLowerCase();
  return sales.filter((s) => {
    if (type !== 'semua' && s.order_type !== type) return false;
    if (device === 'tanpa' ? s.device_id : device !== 'semua' && s.device_id !== device) return false;
    if (!q) return true;
    return String(s.display_number).toLowerCase().includes(q)
      || String(s.id).toLowerCase().includes(q)
      || String(s.customer_name || '').toLowerCase().includes(q)
      || String(s.device_name || '').toLowerCase().includes(q);
  });
}

/** Ringkasan per metode bayar, terbesar dulu. -> [{ key, count, total }] */
export function paymentStats(sales) {
  const map = new Map();
  for (const s of sales) {
    const k = methodOf(s);
    const cur = map.get(k) || { key: k, count: 0, total: 0 };
    cur.count += 1; cur.total += num(s.total);
    map.set(k, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function sortSales(list, key) {
  const sorters = {
    terbaru: (a, b) => saleTime(b) - saleTime(a),
    terlama: (a, b) => saleTime(a) - saleTime(b),
    'total-desc': (a, b) => num(b.total) - num(a.total),
    'total-asc': (a, b) => num(a.total) - num(b.total),
  };
  return [...list].sort(sorters[key] || sorters[DEFAULT_SORT]);
}
