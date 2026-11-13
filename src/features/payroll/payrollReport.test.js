import { describe, it, expect } from 'vitest';
import {
  buildPayrollReport, itemTitle, isKasbon, fmtDay, fmtHM, daysInPeriod,
  allocateProportional, allocateBlocks, openingToForm, openingFromForm, buildClocks, summaryIncomeLabel,
} from './payrollReport.js';
import { computePayroll, monthPeriod, weekPeriodForDate } from './payrollEngine.js';
import { seedEmployees, seedAttendance, seedAdditions, seedDeductions, seedOpeningBalances, PLACEHOLDER_TODAY } from './__fixtures__/hrdSeed.js';

const rp = (n) => `Rp ${n}`;
const attendance = (over = {}) => ({
  dayRows: [], hadirDays: 0, liburDays: 0, fullTimeDays: 0, totalWorkedMinutes: 0, totalOvertimeMinutes: 0, overtimeBlocks30Min: 0, overtimeRate: 5000,
  wagePay: 0, overtimePay: 0, fullTimeBonusPay: 0, ...over,
});
const payroll = (over = {}) => ({
  attendance: attendance(), additions: [], deductions: [], additionsTotal: 0, deductionsTotal: 0, openingBalance: 0, totalPenghasilan: 0, netPay: 0, ...over,
});
const hadir = (date, workedMinutes, over = {}) => ({ date, status: 'hadir', workedMinutes, overtimeMinutes: 0, bolongMinutes: 0, fullTimeBonus: false, effectiveFromBolong: false, ...over });

describe('format kecil', () => {
  it('fmtDay / fmtHM / isKasbon', () => {
    expect(fmtDay('2026-10-07')).toBe('7 Okt');
    expect(fmtHM(540)).toBe('9j 00m');
    expect(fmtHM(95)).toBe('1j 35m');
    expect(isKasbon({ category: ' kasbon ' })).toBe(true);
    expect(isKasbon({ category: 'Denda' })).toBe(false);
  });
  it('itemTitle: kategori saja kalau keterangan kosong atau sama', () => {
    expect(itemTitle({ category: 'Kasbon', label: '' })).toBe('Kasbon');
    expect(itemTitle({ category: 'Kasbon', label: 'Kasbon' })).toBe('Kasbon');
    expect(itemTitle({ category: 'Denda', label: 'Piring pecah' })).toBe('Denda (Piring pecah)');
  });
  it('daysInPeriod: bulan penuh dan minggu', () => {
    expect(daysInPeriod(monthPeriod('2026-10'))).toBe(31);
    expect(daysInPeriod(monthPeriod('2026-09'))).toBe(30);
    expect(daysInPeriod(monthPeriod('2028-02'))).toBe(29);
    expect(daysInPeriod(weekPeriodForDate('2026-09-04'))).toBe(7);
  });
});

describe('allocateProportional — jumlah harian selalu = total', () => {
  it('pembagian pas, tanpa sisa', () => { expect(allocateProportional(408500, [559, 535, 540])).toEqual([139750, 133750, 135000]); });
  it('sisa pembulatan ke hari dengan sisa terbesar; jumlah tetap total', () => {
    const r = allocateProportional(100, [1, 1, 1]);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    expect(r).toEqual([34, 33, 33]);                                  // seri: hari lebih awal
    expect(allocateProportional(10, [3, 1])).toEqual([8, 2]);          // 7,5 + 2,5 -> sisa terbesar sama, hari awal menang
  });
  it('total atau bobot nol -> semua nol', () => {
    expect(allocateProportional(0, [5, 5])).toEqual([0, 0]);
    expect(allocateProportional(1000, [0, 0])).toEqual([0, 0]);
    expect(allocateProportional(1000, [])).toEqual([]);
  });
  it('acak: jumlah selalu persis total', () => {
    for (let n = 0; n < 200; n++) {
      const w = Array.from({ length: 1 + (n % 9) }, (_, i) => ((n * 31 + i * 17) % 600) + 1);
      const total = (n * 7919) % 900000;
      expect(allocateProportional(total, w).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

describe('allocateBlocks — lembur per blok 30 menit dari total periode', () => {
  it('blok penuh milik hari itu + blok tambahan ke sisa menit terbesar', () => {
    // 35+50+40 = 125 menit -> 4 blok; milik sendiri 1+1+1 = 3; blok ke-4 ke hari sisa terbesar (50 -> sisa 20)
    expect(allocateBlocks(4, [35, 50, 40])).toEqual([1, 2, 1]);
  });
  it('menit kecil tiap hari bisa menjadi blok setelah digabung', () => {
    expect(allocateBlocks(2, [20, 20, 20])).toEqual([1, 1, 0]);        // 60 menit = 2 blok, tiap hari sendiri 0
  });
  it('tanpa blok / tanpa lembur', () => {
    expect(allocateBlocks(0, [10, 20])).toEqual([0, 0]);
    expect(allocateBlocks(0, [])).toEqual([]);
  });
  it('acak: jumlah blok selalu = floor(total menit / 30), tidak pernah ke hari tanpa lembur', () => {
    for (let n = 0; n < 200; n++) {
      const m = Array.from({ length: 1 + (n % 8) }, (_, i) => ((n * 13 + i * 29) % 4 === 0 ? 0 : 30 + ((n + i * 11) % 120)));
      const total = Math.floor(m.reduce((a, b) => a + b, 0) / 30);
      const out = allocateBlocks(total, m);
      expect(out.reduce((a, b) => a + b, 0)).toBe(total);
      out.forEach((b, i) => { if (m[i] === 0) expect(b).toBe(0); });
    }
  });
});

describe('saldo awal: jenis eksplisit <-> angka bertanda', () => {
  it('openingToForm', () => {
    expect(openingToForm(0)).toEqual({ kind: null, amount: '' });
    expect(openingToForm(undefined)).toEqual({ kind: null, amount: '' });
    expect(openingToForm(30000)).toEqual({ kind: 'karyawan', amount: '30000' });
    expect(openingToForm(-50000)).toEqual({ kind: 'toko', amount: '50000' });
  });
  it('openingFromForm: karyawan berutang = positif (mengurangi gaji), toko berutang = negatif (menambah gaji)', () => {
    expect(openingFromForm({ kind: 'karyawan', amount: '30000' })).toBe(30000);
    expect(openingFromForm({ kind: 'toko', amount: '50000' })).toBe(-50000);
  });
  it('nominal kosong/0 = tidak ada saldo (jenis boleh kosong)', () => {
    expect(openingFromForm({ kind: null, amount: '' })).toBe(0);
    expect(openingFromForm({ kind: 'toko', amount: '0' })).toBe(0);
  });
  it('nominal tanpa jenis ditolak (supaya tidak salah arah diam-diam); nominal tidak valid ditolak', () => {
    expect(() => openingFromForm({ kind: null, amount: '5000' })).toThrow('Pilih dulu');
    expect(() => openingFromForm({ kind: 'toko', amount: '-5' })).toThrow('angka bulat');
    expect(() => openingFromForm({ kind: 'toko', amount: '12.5' })).toThrow('angka bulat');
  });
  it('bolak-balik tidak mengubah nilai', () => {
    for (const v of [-177750, -1, 0, 1, 250000]) expect(openingFromForm(openingToForm(v))).toBe(v);
  });
});

describe('buildPayrollReport — ringkasan', () => {
  const base = () => payroll({
    attendance: attendance({ wagePay: 135000, totalWorkedMinutes: 540 }),
    deductions: [{ id: 'a', category: 'Kasbon', amount: 20000, date: '2026-10-08' }, { id: 'b', category: 'Denda', amount: 5000, date: '2026-10-07' }],
    deductionsTotal: 25000, totalPenghasilan: 135000,
  });

  it('tanpa saldo: kasbon dipisah dari potongan lain, Gaji Bersih = Pendapatan - Potongan', () => {
    const r = buildPayrollReport({ ...base(), netPay: 110000 }, { formatRupiah: rp });
    expect(r.cuts.map((c) => [c.key, c.amount])).toEqual([['kasbon', 20000], ['potongan', 5000]]);
    expect(r.totalIncome).toBe(135000);
    expect(r.totalDeductions).toBe(25000);
    expect(r.totalIncome - r.totalDeductions).toBe(r.net);
    expect(r.opening).toEqual({ kind: null, amount: 0 });
    expect(r.income[0].label).toBe('Upah (9j 00m / 0 hari kerja)');
    expect(r.income[1].label).toBe('Lembur (0 blok)');
  });

  it('TOKO berutang (kurang bayar, tersimpan negatif): masuk Pendapatan, menambah gaji', () => {
    const r = buildPayrollReport({ ...base(), openingBalance: -50000, netPay: 160000 }, { formatRupiah: rp });
    expect(r.income.at(-1)).toEqual({ key: 'saldo', label: 'Sisa Bulan Lalu (Kurang Bayar)', amount: 50000 });
    expect(r.totalIncome).toBe(185000);
    expect(r.cuts.map((c) => c.key)).toEqual(['kasbon', 'potongan']);
    expect(r.totalDeductions).toBe(25000);
    expect(r.totalIncome - r.totalDeductions).toBe(r.net);
    expect(r.opening).toEqual({ kind: 'toko', amount: 50000 });
  });

  it('KARYAWAN berutang (tersimpan positif): masuk Potongan, mengurangi gaji', () => {
    const r = buildPayrollReport({ ...base(), openingBalance: 30000, netPay: 80000 }, { formatRupiah: rp });
    expect(r.cuts.at(-1)).toEqual({ key: 'saldo', label: 'Hutang Bulan Lalu (Karyawan)', amount: 30000 });
    expect(r.totalDeductions).toBe(55000);
    expect(r.income.map((i) => i.key)).not.toContain('saldo');
    expect(r.totalIncome).toBe(135000);
    expect(r.totalIncome - r.totalDeductions).toBe(r.net);
    expect(r.opening).toEqual({ kind: 'karyawan', amount: 30000 });
  });

  it('mingguan (withOpening: false): saldo diabaikan sepenuhnya', () => {
    const r = buildPayrollReport({ ...base(), openingBalance: 99999, netPay: 110000 }, { formatRupiah: rp, withOpening: false });
    expect(r.withOpening).toBe(false);
    expect(r.cuts.map((c) => c.key)).toEqual(['kasbon', 'potongan']);
    expect(r.opening.kind).toBeNull();
    expect(r.totalIncome - r.totalDeductions).toBe(r.net);
  });

  it('periodDays dan tarif lembur ikut dibawa untuk slip', () => {
    const r = buildPayrollReport(base(), { formatRupiah: rp, periodDays: 31 });
    expect(r.periodDays).toBe(31);
    expect(r.overtimeRate).toBe(5000);
  });
});

describe('buildPayrollReport — baris harian', () => {
  it('hari hadir: upah, lembur, bonus; libur: status; catatan di tanggalnya (kolom + / -)', () => {
    const r = buildPayrollReport(payroll({
      attendance: attendance({
        dayRows: [hadir('2026-10-05', 559, { overtimeMinutes: 35, overtimeBlocks: 1 }), hadir('2026-10-06', 535, { overtimeMinutes: 50, overtimeBlocks: 1, bolongMinutes: 15 }), hadir('2026-10-07', 540, { overtimeMinutes: 40, overtimeBlocks: 1, fullTimeBonus: true }), { date: '2026-10-09', status: 'libur' }],
        hadirDays: 3, liburDays: 1, fullTimeDays: 1, totalWorkedMinutes: 1634, totalOvertimeMinutes: 125, overtimeBlocks30Min: 3,
        wagePay: 408500, overtimePay: 15000, fullTimeBonusPay: 25000,
      }),
      additions: [{ id: 't', category: 'Bonus', label: 'THR', amount: 50000, date: '2026-10-05' }],
      deductions: [{ id: 'k', category: 'Kasbon', label: '', amount: 20000, date: '2026-10-08', expenseId: 'x1', employeeId: 'e1' }],
      additionsTotal: 50000, deductionsTotal: 20000,
    }), { formatRupiah: rp });
    expect(r.days.map((d) => d.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    const d5 = r.days[0], d6 = r.days[1], d7 = r.days[2], d8 = r.days[3], d9 = r.days[4];
    expect(d5.lines.map((l) => [l.key, l.plus, l.minus])).toEqual([['upah', 139750, 0], ['lembur', 5000, 0], ['tambahan-t', 50000, 0]]);
    expect(d6.lines[0].label).toBe('Upah Jam Kerja (8j 55m · bolong 15m)');
    expect(d6.lines[1]).toMatchObject({ key: 'lembur', label: 'Uang Lembur (1 blok)', plus: 5000 });   // 50 menit = 1 blok, sisa 20 menit hangus
    expect(d7.lines.map((l) => [l.key, l.plus])).toEqual([['upah', 135000], ['lembur', 5000], ['bonus', 25000]]);
    expect(d8.row).toBeNull();                                      // tanpa absensi tapi ada kasbon
    expect(d8.lines).toEqual([{ key: 'potongan-k', label: 'Kasbon', plus: 0, minus: 20000, item: expect.objectContaining({ id: 'k', expenseId: 'x1', employeeId: 'e1', date: '2026-10-08' }) }]);
    expect(d9.lines).toEqual([{ key: 'status', label: 'Libur', plus: 0, minus: 0 }]);
  });

  it('jam masuk s/d pulang dari clocks; hari tanpa jam = null; bolong dianggap pulang memakai jam bolong', () => {
    const r = buildPayrollReport(payroll({
      attendance: attendance({ dayRows: [hadir('2026-10-05', 500), hadir('2026-10-06', 400, { effectiveFromBolong: true }), { date: '2026-10-07', status: 'libur' }] }),
    }), { formatRupiah: rp, clocks: { '2026-10-05': { masuk: '09:41', pulang: '19:35', stuck: null }, '2026-10-06': { masuk: '09:00', pulang: null, stuck: '16:30' } } });
    expect(r.days[0].timeRange).toBe('09:41 s/d 19:35');
    expect(r.days[1].timeRange).toBe('09:00 s/d 16:30');
    expect(r.days[2].timeRange).toBeNull();
  });
});

describe('buildClocks', () => {
  const L = (type, time, date = '2026-10-05', employeeId = 'e1') => ({ id: `${type}${time}`, employeeId, date, type, time });
  it('ambil masuk & pulang pertama per hari, hanya karyawan itu; libur/tanpa masuk tidak dimasukkan', () => {
    const c = buildClocks([L('masuk', '09:41'), L('pulang', '19:35'), L('masuk', '09:00', '2026-10-05', 'e2'), L('libur', null, '2026-10-06'), L('pulang', '20:00', '2026-10-07')], 'e1');
    expect(c).toEqual({ '2026-10-05': { masuk: '09:41', pulang: '19:35', stuck: null } });
  });
  it('bolong yang nyangkut tercatat sebagai stuck', () => {
    const c = buildClocks([L('masuk', '09:00'), L('bolong', '16:30')], 'e1');
    expect(c['2026-10-05']).toEqual({ masuk: '09:00', pulang: null, stuck: '16:30' });
  });
  it('log kosong / undefined aman', () => {
    expect(buildClocks([], 'e1')).toEqual({});
    expect(buildClocks(undefined, 'e1')).toEqual({});
  });
});

describe('buildPayrollReport vs engine (data seed, SEMUA karyawan)', () => {
  const period = monthPeriod('2026-09');
  const clocks = (id) => buildClocks(seedAttendance, id);
  for (const e of seedEmployees) {
    it(`${e.id}: angka laporan = angka engine`, () => {
      const p = computePayroll({ employee: e, logs: seedAttendance, additions: seedAdditions, deductions: seedDeductions, openingBalances: seedOpeningBalances, period, today: PLACEHOLDER_TODAY });
      const r = buildPayrollReport(p, { formatRupiah: rp, periodDays: daysInPeriod(period), clocks: clocks(e.id) });
      const sum = (key) => r.days.reduce((s, d) => s + d.lines.filter((l) => l.key === key).reduce((t, l) => t + l.plus, 0), 0);
      expect(r.net).toBe(p.netPay);
      expect(r.totalIncome - r.totalDeductions).toBe(p.netPay);                       // dua arah saldo awal tetap cocok
      expect(sum('upah')).toBe(p.attendance.wagePay);                                  // jumlah harian = total
      expect(sum('lembur')).toBe(p.attendance.overtimePay);
      expect(sum('bonus')).toBe(p.attendance.fullTimeBonusPay);
      const items = r.days.flatMap((d) => d.items);
      expect(items.filter((i) => i.kind === 'potongan')).toHaveLength(p.deductions.length);
      expect(items.filter((i) => i.kind === 'tambahan')).toHaveLength(p.additions.length);
      expect(r.periodDays).toBe(30);
      // Bersih per hari: jumlahnya = Gaji Bersih tanpa saldo awal (saldo awal bukan transaksi harian).
      const adj = r.opening.kind === 'toko' ? r.opening.amount : r.opening.kind === 'karyawan' ? -r.opening.amount : 0;
      expect(r.dayTotals.net).toBe(p.netPay - adj);
      expect(r.dayTotals.net).toBe(r.dayTotals.plus - r.dayTotals.minus);
      for (const d of r.days) expect(d.net).toBe(d.lines.reduce((t, l) => t + l.plus - l.minus, 0));
    });
  }
  it('seed EMP-1003 (toko berutang Rp 50.000) tampil sebagai Sisa Bulan Lalu di Pendapatan', () => {
    const e = seedEmployees.find((x) => x.id === 'EMP-1003');
    const p = computePayroll({ employee: e, logs: seedAttendance, additions: seedAdditions, deductions: seedDeductions, openingBalances: seedOpeningBalances, period, today: PLACEHOLDER_TODAY });
    const r = buildPayrollReport(p, { formatRupiah: rp });
    expect(r.opening).toEqual({ kind: 'toko', amount: 50000 });
    expect(r.income.find((i) => i.key === 'saldo').amount).toBe(50000);
  });
});

describe('bersih per hari dan label ringkasan', () => {
  const r = buildPayrollReport(payroll({
    attendance: attendance({
      dayRows: [hadir('2026-10-05', 540), { date: '2026-10-09', status: 'libur' }],
      hadirDays: 1, liburDays: 1, totalWorkedMinutes: 540, wagePay: 135000,
    }),
    additions: [{ id: 't', category: 'Bonus', label: 'THR', amount: 50000, date: '2026-10-05' }],
    deductions: [{ id: 'k', category: 'Kasbon', label: '', amount: 20000, date: '2026-10-08', expenseId: 'x1', employeeId: 'e1' }],
    additionsTotal: 50000, deductionsTotal: 20000, totalPenghasilan: 185000, netPay: 165000,
  }), { formatRupiah: rp });

  it('Bersih = pemasukan - pengeluaran hari itu; hari libur 0; hari hanya-potongan negatif', () => {
    const [d5, d8, d9] = r.days;
    expect(d5).toMatchObject({ date: '2026-10-05', plus: 185000, minus: 0, net: 185000 });
    expect(d8).toMatchObject({ date: '2026-10-08', plus: 0, minus: 20000, net: -20000 });
    expect(d9).toMatchObject({ date: '2026-10-09', plus: 0, minus: 0, net: 0 });
  });

  it('dayTotals = jumlah semua hari dan sama dengan Gaji Bersih bila saldo awal 0', () => {
    expect(r.dayTotals).toEqual({ plus: 185000, minus: 20000, net: 165000 });
    expect(r.dayTotals.net).toBe(r.net);
  });

  it('saldo awal tidak ikut dayTotals', () => {
    const withHutang = buildPayrollReport(payroll({ ...{ attendance: attendance({ dayRows: [hadir('2026-10-05', 540)], hadirDays: 1, totalWorkedMinutes: 540, wagePay: 135000 }) }, openingBalance: 30000, totalPenghasilan: 135000, netPay: 105000 }), { formatRupiah: rp });
    expect(withHutang.net).toBe(105000);
    expect(withHutang.dayTotals.net).toBe(135000);
  });

  it('summaryIncomeLabel: sama dengan teks di slip PDF', () => {
    const rep = { workedMinutes: 13441, overtimeBlocks: 34 };
    expect(summaryIncomeLabel(rep, { key: 'upah', label: 'x' })).toBe('Upah Dasar (224j 01m)');
    expect(summaryIncomeLabel(rep, { key: 'lembur', label: 'x' })).toBe('Uang Lembur (34 blok)');
    expect(summaryIncomeLabel(rep, { key: 'tambahan', label: 'x' })).toBe('Tambahan (+)');
    expect(summaryIncomeLabel(rep, { key: 'bonus', label: 'Bonus Full Time (19 hari)' })).toBe('Bonus Full Time (19 hari)');
  });
});
