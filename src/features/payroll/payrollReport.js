import { parseIsoDate, findStuckBolong, timeToMinutes } from './payrollEngine';
import { buildAttachments, parseDetail } from './additionDetail';

/**
 * payrollReport — susunan data "Laporan Gaji" satu karyawan (periode mingguan DAN bulanan). FUNGSI MURNI (dites).
 *
 * Dipakai tampilan (PayrollReport.jsx) dan slip PDF (payslipPdf.js), jadi angka di layar dan di PDF selalu sama.
 * Semua angka berasal dari hasil payrollEngine; tidak ada aturan hitung gaji baru di sini.
 *
 *  - Total Pendapatan = upah + lembur + bonus full time + tambahan (+ "Sisa Bulan Lalu" kalau TOKO berutang).
 *  - Total Potongan   = kasbon + potongan lain (+ "Hutang Bulan Lalu" kalau KARYAWAN berutang).
 *  - Gaji Bersih      = Total Pendapatan - Total Potongan (sama dengan netPay engine).
 *
 * Saldo awal bulan (hanya bulanan) disimpan bertanda: positif = karyawan berutang ke toko (mengurangi gaji),
 * negatif = toko berutang / kurang bayar (menambah gaji). Tampilan dan formulir memakai JENIS yang eksplisit
 * (openingToForm / openingFromForm), jadi pemilik tidak perlu mengetik tanda minus.
 *
 * Upah dan lembur per hari hanyalah PEMBAGIAN dari total periode (aturan B membulatkan per periode, bukan per hari):
 * jumlah harian selalu sama persis dengan totalnya.
 */

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const fmtDay = (iso) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
export const fmtHM = (min) => `${Math.floor(min / 60)}j ${String(min % 60).padStart(2, '0')}m`;

export const STATUS_LABEL = { hadir: 'Hadir', libur: 'Libur', belumAbsen: 'Belum absen', belumPulang: 'Belum pulang', perluKlarifikasi: 'Perlu klarifikasi' };
export const STATUS_VARIANT = { hadir: 'success', libur: 'neutral', belumAbsen: 'neutral', belumPulang: 'warning', perluKlarifikasi: 'danger' };

// Potongan berkategori "Kasbon" dipisah jadi baris sendiri di rincian gaji.
export const isKasbon = (d) => String(d.category || '').trim().toLowerCase() === 'kasbon';

/** Judul satu catatan: "Kategori" saja kalau keterangan kosong/sama, selain itu "Kategori (Keterangan)". */
export const itemTitle = (item) => {
  const label = String(item.label || '').trim();
  // Keterangan otomatis dari rincian ("Ongkir (2 customer)") sudah memuat nama kategori.
  if (item.detail && label && label.toLowerCase().startsWith(String(item.category || '').trim().toLowerCase())) return label;
  return !label || label === item.category ? String(item.category || '') : `${item.category} (${label})`;
};

/**
 * Label baris Pendapatan di ringkasan (layar bulanan dan slip PDF memakai yang sama, supaya teksnya selalu seragam).
 * Baris lain (Bonus Full Time, Sisa Bulan Lalu) memakai label bawaan dari buildPayrollReport.
 */
export const summaryIncomeLabel = (report, row) => ({
  upah: `Upah Dasar (${fmtHM(report.workedMinutes)})`,
  lembur: `Uang Lembur (${report.overtimeBlocks} blok)`,
  tambahan: 'Tambahan (+)',
}[row.key] || row.label);

/** Jumlah hari di periode (inklusif): bulan = 28..31, minggu = 7. */
export const daysInPeriod = (period) => Math.round((parseIsoDate(period.end) - parseIsoDate(period.start)) / 86400000) + 1;

// ── Pembagian total ke hari ──────────────────────────────────────────
/**
 * Bagi `total` (bilangan bulat) ke hari secara proporsional terhadap `weights`; sisa pembulatan diberikan ke
 * hari dengan sisa terbesar (seri: hari lebih awal). Jumlah hasil SELALU = total.
 */
export function allocateProportional(total, weights) {
  const sum = weights.reduce((s, w) => s + w, 0);
  if (!sum || !total) return weights.map(() => 0);
  const out = weights.map((w) => Math.floor((total * w) / sum));
  let left = total - out.reduce((s, v) => s + v, 0);
  weights.map((w, i) => [(total * w) % sum, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, left).forEach(([, i]) => { out[i] += 1; left -= 1; });
  return out;
}

/**
 * Hanya untuk periode tertutup LAMA (dulu lembur dibulatkan dari TOTAL periode). Tiap hari mendapat blok penuh
 * miliknya sendiri; blok tambahan (hasil menggabung sisa menit antar hari) diberikan ke hari dengan sisa menit
 * terbesar. Jumlah blok hasil SELALU = totalBlocks. Periode baru: blok sudah dihitung per hari di engine.
 */
export function allocateBlocks(totalBlocks, minutes) {
  const out = minutes.map((m) => Math.floor(m / 30));
  const extra = totalBlocks - out.reduce((s, v) => s + v, 0);
  if (extra > 0) {
    minutes.map((m, i) => [m % 30, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1])
      .slice(0, extra).forEach(([, i]) => { out[i] += 1; });
  }
  return out;
}

// ── Saldo awal bulan: jenis eksplisit <-> angka bertanda di database ─
/** Angka bertanda (database) -> isian formulir { kind: 'toko' | 'karyawan' | null, amount: string }. */
export const openingToForm = (balance) => {
  const n = Number(balance) || 0;
  return { kind: n < 0 ? 'toko' : n > 0 ? 'karyawan' : null, amount: n ? String(Math.abs(n)) : '' };
};

/** Isian formulir -> angka bertanda untuk database. Nominal kosong/0 = tidak ada saldo. */
export function openingFromForm({ kind, amount }) {
  const n = Number(amount || 0);
  if (!Number.isInteger(n) || n < 0) throw new Error('Nominal saldo awal harus angka bulat.');
  if (n === 0) return 0;
  if (kind === 'karyawan') return n;
  if (kind === 'toko') return -n;
  throw new Error('Pilih dulu: toko atau karyawan yang berutang.');
}

// ── Jam masuk/pulang per hari (dari log absensi) ─────────────────────
/** { 'YYYY-MM-DD': { masuk, pulang, stuck } } untuk satu karyawan. Hari tanpa jam masuk tidak dimasukkan. */
export function buildClocks(logs, employeeId) {
  const byDate = {};
  for (const l of logs || []) {
    if (l.employeeId !== employeeId || !l.time) continue;
    (byDate[l.date] ||= []).push(l);
  }
  const clocks = {};
  for (const [date, ls] of Object.entries(byDate)) {
    const first = (type) => ls.filter((l) => l.type === type).sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time))[0]?.time || null;
    const masuk = first('masuk');
    if (masuk) clocks[date] = { masuk, pulang: first('pulang'), stuck: findStuckBolong(ls)?.time || null };
  }
  return clocks;
}

/**
 * @param payroll  hasil computePayroll untuk satu karyawan (atau payroll_json periode tertutup)
 * @param opts.formatRupiah  pemformat rupiah (dipakai di label lembur)
 * @param opts.withOpening   periode bulanan: sertakan Saldo awal. Default true.
 * @param opts.periodDays    jumlah hari di periode (daysInPeriod) untuk "Hari Kerja Masuk x/y"
 * @param opts.clocks        hasil buildClocks (kosong untuk periode tertutup: jam tidak lagi dibaca)
 */
export function buildPayrollReport(payroll, { formatRupiah, withOpening = true, periodDays = null, clocks = {} }) {
  const a = payroll.attendance;
  const deductions = payroll.deductions || [];
  const additions = payroll.additions || [];
  const opening = withOpening ? (payroll.openingBalance || 0) : 0;
  const kurangBayar = opening < 0 ? -opening : 0;   // toko berutang -> menambah gaji
  const hutang = opening > 0 ? opening : 0;         // karyawan berutang -> mengurangi gaji

  const income = [
    { key: 'upah', label: `Upah (${fmtHM(a.totalWorkedMinutes)} / ${a.hadirDays} hari kerja)`, amount: a.wagePay },
    { key: 'lembur', label: `Lembur (${a.overtimeBlocks30Min} blok)`, amount: a.overtimePay },
    { key: 'bonus', label: `Bonus Full Time (${a.fullTimeDays} hari)`, amount: a.fullTimeBonusPay },
    { key: 'tambahan', label: 'Tambahan', amount: payroll.additionsTotal },
    ...(kurangBayar ? [{ key: 'saldo', label: 'Sisa Bulan Lalu (Kurang Bayar)', amount: kurangBayar }] : []),
  ];
  const totalIncome = (payroll.totalPenghasilan ?? (a.wagePay + a.overtimePay + a.fullTimeBonusPay + payroll.additionsTotal)) + kurangBayar;

  const kasbon = deductions.filter(isKasbon).reduce((s, d) => s + d.amount, 0);
  const cuts = [
    { key: 'kasbon', label: 'Kasbon', amount: kasbon },
    { key: 'potongan', label: 'Potongan', amount: payroll.deductionsTotal - kasbon },
    ...(hutang ? [{ key: 'saldo', label: 'Hutang Bulan Lalu (Karyawan)', amount: hutang }] : []),
  ];
  const totalDeductions = cuts.reduce((s, r) => s + r.amount, 0);

  // Pembagian upah & lembur per hari hadir
  const hadirRows = a.dayRows.filter((r) => r.status === 'hadir');
  const upah = allocateProportional(a.wagePay, hadirRows.map((r) => r.workedMinutes));
  // Lembur ditutup per hari (engine mengisi overtimeBlocks tiap hari). Periode tertutup lama (aturan total periode)
  // tidak punya kolom itu / jumlahnya tidak sama dengan total beku, jadi dibagi seperti dulu.
  const perDay = hadirRows.map((r) => r.overtimeBlocks);
  const perDayOk = perDay.every((b) => Number.isInteger(b)) && perDay.reduce((s, b) => s + b, 0) === a.overtimeBlocks30Min;
  const blocks = perDayOk ? perDay : allocateBlocks(a.overtimeBlocks30Min, hadirRows.map((r) => r.overtimeMinutes));
  const share = new Map(hadirRows.map((r, i) => [r.date, { upah: upah[i], lembur: blocks[i] * a.overtimeRate, blocks: blocks[i] }]));
  const bonusPerDay = a.fullTimeDays > 0 ? Math.round(a.fullTimeBonusPay / a.fullTimeDays) : 0;

  // Catatan Tambahan/Potongan ditaruh di tanggalnya masing-masing. Tanggal tanpa absensi tetap tampil.
  const itemsByDate = new Map();
  const put = (date, item) => { if (!itemsByDate.has(date)) itemsByDate.set(date, []); itemsByDate.get(date).push(item); };
  for (const x of additions) put(x.date, { kind: 'tambahan', id: x.id, category: x.category, label: x.label, amount: x.amount, detail: parseDetail(x.detail) });
  for (const x of deductions) put(x.date, { kind: 'potongan', id: x.id, category: x.category, label: x.label, amount: x.amount, expenseId: x.expenseId || null, employeeId: x.employeeId, date: x.date });

  const rowByDate = new Map(a.dayRows.map((r) => [r.date, r]));
  const dates = [...new Set([...rowByDate.keys(), ...itemsByDate.keys()])].sort();
  const days = dates.map((date) => {
    const row = rowByDate.get(date) || null;
    const items = itemsByDate.get(date) || [];
    const lines = [];
    if (row?.status === 'hadir') {
      const s = share.get(date);
      lines.push({ key: 'upah', label: `Upah Jam Kerja (${fmtHM(row.workedMinutes)}${row.bolongMinutes > 0 ? ` · bolong ${row.bolongMinutes}m` : ''})`, plus: s.upah, minus: 0 });
      if (row.overtimeMinutes > 0) lines.push({ key: 'lembur', label: `Uang Lembur (${s.blocks} blok)`, plus: s.lembur, minus: 0 });
      if (row.fullTimeBonus) lines.push({ key: 'bonus', label: 'Bonus Full Time', plus: bonusPerDay, minus: 0 });
    } else if (row) {
      lines.push({ key: 'status', label: STATUS_LABEL[row.status] || row.status, plus: 0, minus: 0 });
    }
    for (const it of items) lines.push({ key: `${it.kind}-${it.id}`, label: itemTitle(it), plus: it.kind === 'tambahan' ? it.amount : 0, minus: it.kind === 'potongan' ? it.amount : 0, item: it });
    const c = clocks[date];
    const timeRange = c ? `${c.masuk} s/d ${(row?.effectiveFromBolong ? c.stuck : c.pulang) || '--:--'}` : null;
    const plus = lines.reduce((t, l) => t + l.plus, 0);
    const minus = lines.reduce((t, l) => t + l.minus, 0);
    return { date, row, items, lines, timeRange, plus, minus, net: plus - minus };
  });
  // Total semua hari. Saldo awal bulan (Sisa/Hutang Bulan Lalu) BUKAN transaksi harian, jadi tidak ikut:
  // dayTotals.net = Gaji Bersih tanpa saldo awal.
  const dayTotals = days.reduce((t, d) => ({ plus: t.plus + d.plus, minus: t.minus + d.minus, net: t.net + d.net }), { plus: 0, minus: 0, net: 0 });

  return {
    income, totalIncome, cuts, totalDeductions, net: payroll.netPay, days, dayTotals,
    withOpening, opening: { kind: opening < 0 ? 'toko' : opening > 0 ? 'karyawan' : null, amount: Math.abs(opening) },
    periodDays, overtimeRate: a.overtimeRate, overtimeMinutes: a.totalOvertimeMinutes, overtimeBlocks: a.overtimeBlocks30Min,
    hadirDays: a.hadirDays, liburDays: a.liburDays, workedMinutes: a.totalWorkedMinutes,
    attachments: buildAttachments(additions),   // rincian Ongkir / Potong Ayam untuk lampiran PDF (null kalau tidak ada)
  };
}
