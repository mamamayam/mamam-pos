/**
 * listFilters — helper murni untuk layar daftar (Riwayat, Pengeluaran): label periode,
 * judul hari, dan pengelompokan per hari. FUNGSI MURNI (dites di listFilters.test.js).
 */

export const PERIOD_OPTIONS = [
  { key: 'hari-ini', label: 'Hari Ini' },
  { key: 'kemarin', label: 'Kemarin' },
  { key: 'bulan-ini', label: 'Bulan Ini' },
  { key: 'semua', label: 'Semua' },
  { key: 'tanggal-terpilih', label: 'Tanggal Terpilih' },
];

const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

// 'YYYY-MM-DD' dibaca sebagai tanggal LOKAL (bukan UTC) supaya tidak bergeser sehari.
const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };

/** '2026-10-10' -> '10 Okt' */
export const dayShort = (s) => { const d = parseDay(s); return `${d.getDate()} ${BULAN[d.getMonth()]}`; };

/** '2026-10-10' -> 'Sabtu, 10 Okt' */
export const dayHeading = (s) => { const d = parseDay(s); return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`; };

/** Nama bulan singkat (Jan..Des) untuk pemilih bulan dan label periode. */
export const MONTH_SHORT = BULAN;

const pad2 = (n) => String(n).padStart(2, '0');

/** Rentang satu bulan penuh: (2026, 9) -> { start: '2026-10-01', end: '2026-10-31' }. `month` 0-11. */
export function monthRange(year, month) {
  const last = new Date(year, month + 1, 0).getDate();
  return { start: `${year}-${pad2(month + 1)}-01`, end: `${year}-${pad2(month + 1)}-${pad2(last)}` };
}

/** Kebalikan monthRange: rentang yang tepat satu bulan penuh -> { year, month }, selain itu null. */
export function fullMonthOf(start, end) {
  if (!start || !end) return null;
  const d = parseDay(start);
  const { start: s, end: e } = monthRange(d.getFullYear(), d.getMonth());
  return String(start).slice(0, 10) === s && String(end).slice(0, 10) === e ? { year: d.getFullYear(), month: d.getMonth() } : null;
}

/** Bulan (year, month 0-11) yang belum tiba menurut `now` ({ year, month })? Tidak bisa dipilih. */
export const isFutureMonth = (year, month, now) => year > now.year || (year === now.year && month > now.month);

/** Teks chip periode: nama pilihan, "Okt 2026" untuk satu bulan penuh, atau rentang tanggal untuk "Tanggal Terpilih". */
export function periodLabel(mode, custom = {}) {
  if (mode === 'tanggal-terpilih' && custom.start) {
    const fm = fullMonthOf(custom.start, custom.end);
    if (fm) return `${BULAN[fm.month]} ${fm.year}`;
    return custom.end && custom.end !== custom.start
      ? `${dayShort(custom.start)} – ${dayShort(custom.end)}`
      : dayShort(custom.start);
  }
  return (PERIOD_OPTIONS.find((p) => p.key === mode) || PERIOD_OPTIONS[0]).label;
}

/**
 * Kelompokkan daftar (yang SUDAH terurut) per hari tanpa mengubah urutan.
 * -> [{ day, items }]  (day = 'YYYY-MM-DD')
 */
export function groupByDay(list, dayOf) {
  const groups = [];
  const index = new Map();
  for (const item of list) {
    const day = dayOf(item);
    let g = index.get(day);
    if (!g) { g = { day, items: [] }; index.set(day, g); groups.push(g); }
    g.items.push(item);
  }
  return groups;
}

/** Jumlahkan nilai per hari -> Map(day -> total). */
export function sumByDay(list, dayOf, valueOf) {
  const map = new Map();
  for (const item of list) {
    const day = dayOf(item);
    map.set(day, (map.get(day) || 0) + (Number(valueOf(item)) || 0));
  }
  return map;
}
