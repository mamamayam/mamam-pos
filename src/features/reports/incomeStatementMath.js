import { isKasbon } from '../payroll/payrollCost';
import { OJOL_PLATFORMS } from '../../lib/ojolPlatforms';

/**
 * incomeStatementMath — rumus Income Statement (Laba Rugi bertingkat) di Laporan. FUNGSI MURNI (dites).
 *
 * Susunan (permintaan pemilik 1 Nov 2026):
 *   Pendapatan   = Tunai + QRIS + Transfer + Split Payment + Ojol (dipecah per aplikasi: Shopeefood / Grabfood / Gofood)
 *   HPP          = Stok awal bulan + Belanja bulan ini + Bayar Ayam − Stok akhir bulan − Waste
 *   Laba Kotor   = Pendapatan − HPP
 *   Beban Operasional = Gaji karyawan (kategori "Gaji…" + "Kasbon…", tiap kategori satu baris) + SEMUA kategori pengeluaran lain,
 *                       masing-masing satu baris sesuai nama kategorinya di app (Biaya, Sewa, Listrik, dst.)
 *   Net Profit   = Laba Kotor − Beban Operasional
 *
 * Dasar hitung = catatan pengeluaran yang SUDAH dibayar (uang keluar), sama dengan Laporan lain. Utang yang belum
 * dibayar (ke supplier / karyawan) belum ikut, dan pelunasan utang lama ikut terhitung di bulan pelunasannya.
 *
 * Rincian beban IKUT kategori di app: baris dibuat dari nama kategori pada catatan pengeluaran (dicocokkan tanpa peduli huruf
 * besar/kecil, sama seperti kartu "Pengeluaran per Kategori" di Laporan), jadi kategori baru atau yang diganti namanya otomatis
 * tampil di sini. Hanya TIGA aturan nama yang tetap: "Belanja" dan "Bayar Ayam" = HPP, "Gaji…" dan "Kasbon…" = gaji karyawan.
 * Jadi HPP (belanja + bayar ayam) + Beban Operasional SELALU sama dengan total Pengeluaran Laporan.
 *
 * Stok awal, stok akhir, dan waste: formulirnya belum ada. `stock.{awal,akhir,waste}` = null berarti "belum diisi"
 * (tampil "Menyusul", dihitung 0). Kalau formulirnya sudah ada, cukup kirim angkanya lewat argumen `stock`.
 */

const num = (v) => Number(v) || 0;
const norm = (v) => String(v ?? '').trim().toLowerCase();

/** Aplikasi ojol (`lib/ojolPlatforms.js`, sama dengan tombol di PaymentModal) selalu ditampilkan walau 0, supaya kelihatan mana yang perlu di-boost. */
export { OJOL_PLATFORMS };
const NO_PLATFORM = 'Tanpa aplikasi';

/** Kelompok sebuah kategori pengeluaran: belanja | ayam (HPP) | karyawan (gaji + kasbon) | operasional (semua yang lain). */
export function classifyExpense(category) {
  const c = norm(category);
  if (c === 'belanja') return 'belanja';
  if (c === 'bayar ayam') return 'ayam';
  if (isKasbon(category) || c.startsWith('gaji')) return 'karyawan';
  return 'operasional';
}

// Tambah ke peta per-kategori (kunci tanpa peduli huruf besar/kecil; nama tampil = penulisan pertama; kosong = 'Lainnya').
function addToCategory(map, category, amount) {
  const name = String(category ?? '').trim() || 'Lainnya';
  const key = name.toLowerCase();
  const cur = map.get(key) || { category: name, count: 0, total: 0 };
  cur.count += 1; cur.total += amount; map.set(key, cur);
}
// Daftarkan kategori di peta tanpa catatan (tampil Rp 0): kategori yang ada di app tapi belum dipakai di periode ini.
function ensureCategory(map, category) {
  const name = String(category ?? '').trim();
  if (name && !map.has(name.toLowerCase())) map.set(name.toLowerCase(), { category: name, count: 0, total: 0 });
}
const sortedItems = (map) => [...map.values()].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category));
const sumTotals = (items) => items.reduce((t, i) => t + i.total, 0);

/** Bagian dari total, dalam persen (angka biasa). Total 0 -> 0 (tanpa NaN/Infinity). */
export const percentOf = (part, total) => (num(total) ? (num(part) / num(total)) * 100 : 0);

/** 49 -> '49,0%'; -3.24 -> '-3,2%'. Tanpa Intl supaya hasilnya sama di semua perangkat. */
export function formatPercent(p) {
  const v = Math.round(num(p) * 10) / 10;
  return `${(Object.is(v, -0) ? 0 : v).toFixed(1).replace('.', ',')}%`;
}

function sumOjolPlatforms(sales) {
  const map = new Map(OJOL_PLATFORMS.map((n) => [n.toLowerCase(), { name: n, count: 0, total: 0 }]));
  for (const s of sales) {
    if (s.payment_method !== 'Ojol') continue;
    const raw = String(s.ojol_platform ?? '').trim();
    const key = raw ? raw.toLowerCase() : NO_PLATFORM.toLowerCase();
    const cur = map.get(key) || { name: raw || NO_PLATFORM, count: 0, total: 0 };
    cur.count += 1; cur.total += num(s.total);
    map.set(key, cur);
  }
  // Aplikasi di luar tiga yang dikenal atau "Tanpa aplikasi" hanya tampil kalau ada isinya.
  return [...map.values()]
    .filter((p) => p.total > 0 || p.count > 0 || OJOL_PLATFORMS.includes(p.name))
    .sort((a, b) => b.total - a.total);
}

/**
 * @param {{ sales: object[], expenses: object[], categories?: string[], stock?: { awal?: number|null, akhir?: number|null, waste?: number|null } }} input
 *   `categories` = daftar kategori pengeluaran di app (tabel expense_categories, hook `useReportData`): kategori yang belum punya
 *   catatan di periode ini tetap tampil Rp 0, jadi kategori baru langsung muncul. Kategori yang sudah dihapus dari daftar tapi
 *   masih punya catatan tetap tampil (totalnya harus tetap sama dengan Laporan).
 */
export function buildIncomeStatement({ sales = [], expenses = [], categories = [], stock = {} } = {}) {
  // ── Pendapatan ──
  const byMethod = { Tunai: 0, QRIS: 0, Transfer: 0, 'Split Payment': 0, Ojol: 0, Lainnya: 0 };
  for (const s of sales) {
    const m = Object.hasOwn(byMethod, s.payment_method) ? s.payment_method : 'Lainnya';
    byMethod[m] += num(s.total);
  }
  const platforms = sumOjolPlatforms(sales);
  const pendapatan = {
    tunai: byMethod.Tunai, qris: byMethod.QRIS, transfer: byMethod.Transfer, split: byMethod['Split Payment'],
    lainnya: byMethod.Lainnya,
    ojol: { total: byMethod.Ojol, platforms },
  };
  const totalPendapatan = byMethod.Tunai + byMethod.QRIS + byMethod.Transfer + byMethod['Split Payment'] + byMethod.Ojol + byMethod.Lainnya;

  // ── Pengeluaran per kelompok ──
  let belanja = 0, ayam = 0, totalPengeluaran = 0;
  const karyawan = new Map(), operasional = new Map();
  for (const e of expenses) {
    const amount = num(e.amount);
    totalPengeluaran += amount;
    const group = classifyExpense(e.category);
    if (group === 'belanja') belanja += amount;
    else if (group === 'ayam') ayam += amount;
    else addToCategory(group === 'karyawan' ? karyawan : operasional, e.category, amount);
  }
  for (const name of categories) {
    const group = classifyExpense(name);
    if (group === 'karyawan') ensureCategory(karyawan, name);
    else if (group === 'operasional') ensureCategory(operasional, name);
  }

  // ── HPP ──
  const pending = { stokAwal: stock.awal == null, stokAkhir: stock.akhir == null, waste: stock.waste == null };
  const stokAwal = num(stock.awal), stokAkhir = num(stock.akhir), waste = num(stock.waste);
  const hpp = { stokAwal, belanja, bayarAyam: ayam, stokAkhir, waste, pending, total: stokAwal + belanja + ayam - stokAkhir - waste };
  const labaKotor = totalPendapatan - hpp.total;

  // ── Beban operasional ── (satu baris per kategori, terbesar dulu)
  const gajiItems = sortedItems(karyawan), operasionalItems = sortedItems(operasional);
  const gajiTotal = sumTotals(gajiItems), operasionalTotal = sumTotals(operasionalItems);
  const beban = {
    gaji: { total: gajiTotal, items: gajiItems },
    operasional: { total: operasionalTotal, items: operasionalItems },
    total: gajiTotal + operasionalTotal,
  };

  return { totalPendapatan, pendapatan, hpp, labaKotor, beban, netProfit: labaKotor - beban.total, totalPengeluaran };
}
