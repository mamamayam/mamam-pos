import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import DailyDetailSheet from './DailyDetailSheet.jsx';
import { buildPayrollReport } from './payrollReport.js';

const formatRupiah = (n) => `Rp ${(n || 0).toLocaleString('id-ID')}`;
const noop = () => {};
const payroll = (over = {}) => ({
  attendance: {
    dayRows: [
      { date: '2026-10-07', status: 'hadir', workedMinutes: 540, overtimeMinutes: 0, bolongMinutes: 0, fullTimeBonus: false },
      { date: '2026-10-09', status: 'libur' },
    ],
    hadirDays: 1, liburDays: 1, fullTimeDays: 0, totalWorkedMinutes: 540, totalOvertimeMinutes: 0, overtimeBlocks30Min: 0, overtimeRate: 5000,
    wagePay: 135000, overtimePay: 0, fullTimeBonusPay: 0,
  },
  additions: [{ id: 'o', category: 'Ongkir', label: 'Ongkir (1 customer)', amount: 5000, date: '2026-10-07', detail: { kind: 'ongkir', rows: [{ customer: 'Bu Rina', amount: 5000 }] } }],
  deductions: [{ id: 'k', employeeId: 'e1', category: 'Kasbon', label: '', amount: 20000, date: '2026-10-08', expenseId: 'x' }],
  additionsTotal: 5000, deductionsTotal: 20000, openingBalance: 0, totalPenghasilan: 140000, netPay: 120000, ...over,
});
const clocks = { '2026-10-07': { masuk: '09:41', pulang: '19:35', stuck: null } };
const report = (over) => buildPayrollReport(payroll(over), { formatRupiah, periodDays: 31, clocks });
const view = (props = {}) => renderToString(
  <DailyDetailSheet isOpen onClose={noop} subtitle="Sri · Oktober 2026" report={report()} isLocked={false} dayFlags={() => ({})}
    onEditDay={noop} onEditDeduction={noop} onDeleteItem={noop} {...props} />,
);

describe('DailyDetailSheet (Rincian Harian bulanan, gaya tabel slip PDF)', () => {
  it('kolom sama dengan PDF + Bersih; subjudul periode', () => {
    const html = view();
    for (const t of ['Rincian Harian', 'Sri · Oktober 2026', 'Tanggal &amp; Jam', 'Keterangan', 'Pemasukan (+)', 'Pengeluaran (-)', 'Bersih']) expect(html).toContain(t);
  });

  it('tiap hari: tanggal, jam, keterangan, angka tanpa "Rp", dan Bersih per hari', () => {
    const html = view();
    for (const t of ['7 Okt', '09:41 s/d 19:35', 'Upah Jam Kerja (9j 00m)', '135.000', '8 Okt', 'Kasbon', '20.000', '9 Okt', 'Libur']) expect(html).toContain(t);
    expect(html).not.toContain('Rp 135.000');
    const nets = [...html.matchAll(/data-testid="day-net"[^>]*>(.*?)<\/div><\/div>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''));
    expect(nets).toEqual(['140.000', '-20.000', '-']);   // 7 Okt = upah + ongkir, 8 Okt = kasbon, 9 Okt = libur
  });

  it('baris Total harian = jumlah semua hari', () => {
    const html = view();
    const total = /data-testid="day-total"(.*?)<p class="px-2 pt-2/.exec(html)[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const t of ['Total harian', '140.000', '20.000', '120.000']) expect(total).toContain(t);
    expect(html).toContain('Saldo awal bulan tidak ikut');
  });

  it('bersih negatif merah, positif tidak', () => {
    const html = view();
    expect(html).toMatch(/text-red-500[^>]*>-20\.000/);
  });

  it('owner: tombol ubah absen, ubah potongan, hapus; rincian Ongkir tersembunyi sampai diketuk', () => {
    const html = view();
    for (const t of ['data-testid="edit-day"', 'data-testid="edit-potongan"', 'aria-label="Hapus"', 'data-testid="detail-toggle"']) expect(html).toContain(t);
    expect(html).not.toContain('data-testid="detail-row"');
    expect(html).not.toContain('Bu Rina');
  });

  it('karyawan (readOnly) dan periode tertutup: tanpa tombol ubah/hapus', () => {
    for (const html of [view({ readOnly: true }), view({ isLocked: true })]) {
      for (const t of ['data-testid="edit-day"', 'data-testid="edit-potongan"', 'aria-label="Hapus"']) expect(html).not.toContain(t);
    }
    expect(view({ isLocked: true })).toContain('Periode ditutup');
    expect(view({ readOnly: true, isLocked: true })).not.toContain('Periode ditutup');
  });

  it('tanda otomatis / diedit owner ikut tampil', () => {
    const html = view({ dayFlags: () => ({ auto: true, edited: true }) });
    expect(html).toContain('otomatis');
    expect(html).toContain('data-testid="day-diedit"');
  });

  it('tanpa absensi: pesan kosong, tanpa tabel; tanpa report: tidak merender isi', () => {
    const kosong = view({ report: buildPayrollReport(payroll({ attendance: { ...payroll().attendance, dayRows: [] }, additions: [], deductions: [] }), { formatRupiah }) });
    expect(kosong).toContain('Tidak ada absensi pada periode ini.');
    expect(kosong).not.toContain('Total harian');
    expect(view({ report: null })).not.toContain('daily-sheet');
  });

  it('tertutup: tidak dirender', () => {
    expect(view({ isOpen: false })).toBe('');
  });
});
