import { describe, it, expect } from 'vitest';
import { buildPayslipPdf, textWidth, WIDTHS } from './payslipPdf.js';
import { buildPayrollReport } from './payrollReport.js';
import { formatRupiah as idr } from '../../utils/formatters.js';

const rp = (n) => `Rp ${n}`;
const latin1 = (bytes) => new TextDecoder('latin1').decode(bytes);

const hadir = (date, workedMinutes, over = {}) => ({ date, status: 'hadir', workedMinutes, overtimeMinutes: 0, bolongMinutes: 0, fullTimeBonus: false, effectiveFromBolong: false, ...over });
const basePayroll = (over = {}) => ({
  attendance: {
    dayRows: [hadir('2026-10-05', 559, { overtimeMinutes: 35, overtimeBlocks: 1 }), hadir('2026-10-06', 535, { overtimeMinutes: 50, overtimeBlocks: 1 }), hadir('2026-10-07', 540, { overtimeMinutes: 40, overtimeBlocks: 1 }), { date: '2026-10-09', status: 'libur' }],
    hadirDays: 3, liburDays: 1, fullTimeDays: 0, totalWorkedMinutes: 1634, totalOvertimeMinutes: 125, overtimeBlocks30Min: 3, overtimeRate: 5000,
    wagePay: 408500, overtimePay: 15000, fullTimeBonusPay: 0,
  },
  additions: [], deductions: [{ id: 'k', employeeId: 'e1', category: 'Kasbon', label: '', amount: 20000, date: '2026-10-08' }, { id: 'p', employeeId: 'e1', category: 'Denda', label: 'Piring pecah', amount: 5000, date: '2026-10-07' }],
  additionsTotal: 0, deductionsTotal: 25000, openingBalance: 0, totalPenghasilan: 428500, netPay: 403500, ...over,
});
const clocks = { '2026-10-05': { masuk: '09:41', pulang: '19:35', stuck: null }, '2026-10-07': { masuk: '09:00', pulang: '19:40', stuck: null } };
const make = (over, opts = {}) => buildPayslipPdf({
  employeeName: 'Agung Prayoga', role: 'karyawan', periodLabel: 'Oktober 2026', rates: { wagePerHour: 15000, bonusFullTime: 25000, overtimeRatePer30Min: 5000 },
  report: buildPayrollReport(basePayroll(over), { formatRupiah: rp, periodDays: 31, clocks }), ...opts,
});
const text = (over, opts) => latin1(make(over, opts));
const at = (s, t) => { const i = s.indexOf(t); expect(i, `"${t}" tidak ada`).toBeGreaterThan(-1); return i; };

describe('tabel lebar huruf', () => {
  it('95 karakter ASCII (spasi..~) dan lebar masuk akal', () => {
    expect(WIDTHS).toHaveLength(95);
    expect(textWidth('0', 10)).toBeCloseTo(5.56, 5);          // digit Helvetica = 556
    expect(textWidth('Rp 1', 10, true)).toBeGreaterThan(textWidth('Rp 1', 10));
    expect(textWidth('123.000', 10, true)).toBeCloseTo(textWidth('123.000', 10), 5);   // angka tebal sama lebar -> nominal tetap rata kanan
  });
});

describe('buildPayslipPdf', () => {
  it('menghasilkan PDF valid: header, EOF, xref menunjuk objek yang benar', () => {
    const s = text();
    expect(s.startsWith('%PDF-1.4')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const xrefAt = Number(/startxref\n(\d+)/.exec(s)[1]);
    expect(s.slice(xrefAt, xrefAt + 4)).toBe('xref');
    const entries = [...s.slice(xrefAt).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries.length).toBeGreaterThan(5);
    entries.forEach((o, i) => expect(s.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
  });

  it('judul dan blok info 2 kolom: periode, nama, posisi, hari masuk x/y, jam kerja, tarif', () => {
    const s = text();
    for (const t of ['SLIP GAJI KARYAWAN', 'MAMAM AYAM', 'Periode', 'Oktober 2026', 'Nama', 'Agung Prayoga', 'Posisi', 'Karyawan', 'Hari Kerja Masuk', '3/31 Hari',
      'Total Jam Kerja', '27,2 Jam', 'Upah per Jam', 'Rp 15.000', 'Lembur per 30 Menit', 'Rp 5.000', 'Bonus Full Time', 'Rp 25.000']) at(s, `(${t})`);
    // 2 kolom: label kanan ("Total Jam Kerja") sejajar dengan baris pertama label kiri ("Periode")
    const xs = (label) => Number(new RegExp(`([\\d.]+) [\\d.]+ Td \\(${label}\\)`).exec(s)[1]);
    const ys = (label) => Number(new RegExp(`[\\d.]+ ([\\d.]+) Td \\(${label}\\)`).exec(s)[1]);
    expect(ys('Periode')).toBe(ys('Total Jam Kerja'));
    expect(ys('Posisi')).toBe(ys('Lembur per 30 Menit'));
    expect(xs('Total Jam Kerja')).toBeGreaterThan(xs('Periode'));
  });

  it('periode mingguan: hari masuk memakai jumlah hari periode (x/7); tarif tidak tersedia = "-"', () => {
    const s = latin1(buildPayslipPdf({
      employeeName: 'Sri', periodLabel: '4 Sep - 10 Sep 2026', report: buildPayrollReport(basePayroll(), { formatRupiah: rp, periodDays: 7 }),
    }));
    at(s, '(3/7 Hari)'); at(s, '(Upah per Jam)');
    expect(s).toContain('(-)');        // tarif & posisi kosong
  });

  it('ringkasan berurutan: Pendapatan > Total Pendapatan > Potongan > Total Potongan > GAJI BERSIH; tanpa rincian harian', () => {
    const s = text();
    const order = ['PENDAPATAN', 'Upah Dasar \\(27j 14m\\)', 'Uang Lembur \\(3 blok\\)', 'Total Pendapatan', 'POTONGAN', '(Kasbon)', '(Potongan)', 'Total Potongan', 'GAJI BERSIH'].map((t) => at(s, t.startsWith('(') ? t : `(${t}`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(s).not.toContain('(Tanggal & Jam)');
    expect(s).not.toContain('(Bonus Full Time (0');   // baris Rp 0 disembunyikan
    // tanda kurung di teks PDF ditulis ter-escape: "(Agung Prayoga)" -> \\(Agung Prayoga\\)
    for (const t of ['Penerima,', 'Mengetahui,', '\\( HRD / Manajemen \\)', '\\(Agung Prayoga\\)']) at(s, `(${t})`);
    at(s, '(Rp 428.500)'); at(s, '(-Rp 25.000)'); at(s, '(Rp 403.500)');
  });

  it('saldo awal: TOKO berutang jadi baris Pendapatan; KARYAWAN berutang jadi baris Potongan', () => {
    const toko = text({ openingBalance: -50000, totalPenghasilan: 428500, netPay: 453500 });
    const a = at(toko, '(Sisa Bulan Lalu \\(Kurang Bayar\\))');
    expect(a).toBeLessThan(at(toko, '(Total Pendapatan)'));
    expect(toko).not.toContain('Hutang Bulan Lalu');
    at(toko, '(Rp 478.500)');              // Total Pendapatan sudah termasuk saldo

    const kar = text({ openingBalance: 30000, netPay: 373500 });
    const h = at(kar, '(Hutang Bulan Lalu \\(Karyawan\\))');
    expect(h).toBeGreaterThan(at(kar, '(POTONGAN)'));
    expect(h).toBeLessThan(at(kar, '(Total Potongan)'));
    expect(kar).not.toContain('Sisa Bulan Lalu');
    at(kar, '(-Rp 55.000)');               // Total Potongan sudah termasuk hutang
  });

  it('rincian harian: tabel 4 kolom, tanggal + jam, upah/lembur per hari, kasbon di tanggalnya', () => {
    const s = text({}, { withDays: true });
    for (const t of ['Rincian Pemasukan & Pengeluaran Harian', 'Tanggal & Jam', 'Keterangan', 'Pemasukan (+)', 'Pengeluaran (-)', '2026-10-05', '09:41 s/d 19:35',
      'Upah Jam Kerja (9j 19m)', 'Rp 139.750', 'Uang Lembur (1 blok)', 'Rp 5.000', '2026-10-08', 'Libur', '--:-- s/d --:--']) at(s, `(${t.replace(/[()]/g, '\\$&')})`);
    expect(s).toContain('(Rp 20.000)');    // kasbon 8 Okt di kolom pengeluaran
    at(s, '(Denda \\(Piring pecah\\))');
  });

  it('rincian harian: kolom Bersih per hari + baris Total harian ', () => {
    const rep = buildPayrollReport(basePayroll({ openingBalance: 30000 }), { formatRupiah: rp, periodDays: 31, clocks });
    const s = latin1(buildPayslipPdf({ employeeName: 'Agung Prayoga', periodLabel: 'Oktober 2026', report: rep, withDays: true }));
    const money = (n) => `(${idr(n).replace(/\u00a0/g, ' ')})`;
    at(s, '(Bersih)');
    at(s, '(Total harian)');
    expect(rep.days.find((d) => d.date === '2026-10-08').net).toBe(-20000);
    at(s, money(-20000));                        // 8 Okt hanya kasbon: bersih negatif
    at(s, money(rep.dayTotals.net));              // Total harian
    expect(rep.dayTotals.net).toBe(rep.dayTotals.plus - rep.dayTotals.minus);   // hubungan dengan Gaji Bersih diuji di payrollReport.test.js (data seed)
    expect(text({}, { withDays: false })).not.toContain('(Total harian)');
  });

  it('karakter khusus di-escape dan teks panjang dipotong, bukan melebar', () => {
    const s = text({ deductions: [{ id: 'd', employeeId: 'e1', category: 'Denda', label: `Piring (pecah) \\ ${'sangat panjang '.repeat(20)}`, amount: 5000, date: '2026-10-07' }], deductionsTotal: 5000 }, { withDays: true });
    expect(s).toContain('Piring \\(pecah\\) \\\\');
    expect(s).toContain('...');
  });

  it('banyak hari -> pindah halaman, kepala tabel diulang, nomor halaman benar', () => {
    const dayRows = Array.from({ length: 31 }, (_, i) => hadir(`2026-10-${String(i + 1).padStart(2, '0')}`, 540, { overtimeMinutes: 30 }));
    const s = text({ attendance: { ...basePayroll().attendance, dayRows, hadirDays: 31, totalWorkedMinutes: 16740, totalOvertimeMinutes: 930, overtimeBlocks30Min: 31, wagePay: 4185000, overtimePay: 155000 }, deductions: [], deductionsTotal: 0 }, { withDays: true });
    const pages = Number(/\/Count (\d+)/.exec(s)[1]);
    expect(pages).toBeGreaterThan(1);
    expect(s.split('(Tanggal & Jam)').length - 1).toBeGreaterThanOrEqual(2);
    at(s, `(Hal. ${pages}/${pages})`);
  });
});

describe('lampiran rincian Ongkir / Potong Ayam', () => {
  const adds = [
    { id: 'o1', employeeId: 'e1', category: 'Ongkir', label: 'Ongkir (2 customer)', amount: 9000, date: '2026-10-06', detail: { kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: 5000 }, { customer: 'Bu Rina', amount: 4000 }] } },
    { id: 'o2', employeeId: 'e1', category: 'Ongkir', label: 'Ongkir (1 customer)', amount: 6000, date: '2026-10-08', detail: { kind: 'ongkir', rows: [{ customer: 'Mas Dani', amount: 6000 }] } },
    { id: 'p1', employeeId: 'e1', category: 'Potong Ayam', label: 'Potong Ayam (16 potong)', amount: 51000, date: '2026-10-07', detail: { kind: 'potong_ayam', rows: [{ name: 'Bld', qty: 10, price: 3000 }, { name: 'Sayap', qty: 4, price: 3000 }, { name: 'Kepala ayam', qty: 2, price: 4500 }] } },
  ];
  const over = { additions: adds, additionsTotal: 66000, totalPenghasilan: 494500, netPay: 469500 };
  const pageCount = (s) => Number(/\/Count (\d+)/.exec(s)[1]);

  it('default mati: slip tetap ringkas, tanpa halaman lampiran', () => {
    const s = text(over);
    expect(s).not.toContain('LAMPIRAN RINCIAN');
    expect(s).not.toContain('Pak Hendra');
    expect(pageCount(s)).toBe(1);
  });

  it('dicentang: halaman terpisah setelah tanda tangan berisi tabel Ongkir dan Potong Ayam dengan total', () => {
    const s = text(over, { withAttachment: true });
    expect(pageCount(s)).toBe(2);
    for (const t of ['LAMPIRAN RINCIAN', 'Agung Prayoga', 'ONGKIR', 'Tanggal', 'Customer', 'Jumlah', '6 Okt', 'Pak Hendra', 'Bu Rina', 'Mas Dani', 'Total ongkir', 'Rp 15.000', 'Rp 5.000',
      'POTONG AYAM', 'Jenis', 'Subtotal', '10 \xd7 3.000', 'Kepala ayam', '2 \xd7 4.500', 'Rp 51.000']) at(s, `(${t})`);
    expect(s.indexOf('(Penerima,)')).toBeLessThan(s.indexOf('(LAMPIRAN RINCIAN)'));      // setelah tanda tangan
    expect(s).not.toMatch(/\(Total ongkir \(/);                                           // total tanpa jumlah customer
    expect(s).not.toMatch(/\(Total \(/);
    at(s, '(Hal. 2/2)');
  });

  it('dicentang tapi tidak ada rincian: tidak ada halaman tambahan', () => {
    const s = text({ additions: [{ id: 'b', employeeId: 'e1', category: 'Bonus', label: '', amount: 1000, date: '2026-10-06' }], additionsTotal: 1000, totalPenghasilan: 429500, netPay: 404500 }, { withAttachment: true });
    expect(pageCount(s)).toBe(1);
    expect(s).not.toContain('LAMPIRAN RINCIAN');
  });

  it('rincian panjang pindah halaman dan kepala tabel diulang', () => {
    const rows = Array.from({ length: 80 }, (_, i) => ({ customer: `Customer ${i + 1}`, amount: 1000 }));
    const s = text({ additions: [{ id: 'big', employeeId: 'e1', category: 'Ongkir', label: 'Ongkir', amount: 80000, date: '2026-10-06', detail: { kind: 'ongkir', rows } }], additionsTotal: 80000, totalPenghasilan: 508500, netPay: 483500 }, { withAttachment: true });
    expect(pageCount(s)).toBeGreaterThanOrEqual(3);
    expect(s.split('(Customer)').length - 1).toBeGreaterThanOrEqual(2);
    at(s, '(Customer 80)');
    at(s, '(Total ongkir)');
  });
});