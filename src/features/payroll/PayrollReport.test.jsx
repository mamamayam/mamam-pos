import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
// NominalInput memakai keypad global yang tidak bisa dirender di server (tes ini renderToString); cukup input biasa.
vi.mock('../../components/ui', async (orig) => ({ ...(await orig()), NominalInput: ({ value }) => <input data-testid="nominal" defaultValue={value} /> }));
import PayrollReport from './PayrollReport.jsx';
import { buildPayrollReport } from './payrollReport.js';

const formatRupiah = (n) => `Rp ${(n || 0).toLocaleString('id-ID')}`;
const payroll = (over = {}) => ({
  attendance: {
    dayRows: [{ date: '2026-10-07', status: 'hadir', workedMinutes: 540, overtimeMinutes: 0, bolongMinutes: 0, fullTimeBonus: false }],
    hadirDays: 1, liburDays: 8, fullTimeDays: 0, totalWorkedMinutes: 540, totalOvertimeMinutes: 0, overtimeBlocks30Min: 0, overtimeRate: 5000,
    wagePay: 135000, overtimePay: 0, fullTimeBonusPay: 0,
  },
  additions: [], deductions: [{ id: 'k', employeeId: 'e1', category: 'Kasbon', label: '', amount: 20000, date: '2026-10-08', expenseId: 'x' }],
  additionsTotal: 0, deductionsTotal: 20000, openingBalance: 0, totalPenghasilan: 135000, netPay: 115000, ...over,
});
const render = ({ withOpening = true, p = payroll(), ...props } = {}) => renderToString(
  <PayrollReport report={buildPayrollReport(p, { formatRupiah, withOpening })} isLocked={false} formatRupiah={formatRupiah} dayFlags={() => ({})}
    onEditDay={() => {}} onEditDeduction={() => {}} onDeleteItem={() => {}} canEditOpening openingForm={{ kind: null, amount: '' }} onOpeningChange={() => {}} onSaveOpening={() => {}}
    busy={false} onShare={() => {}} {...props} />,
);

describe('PayrollReport (render awal)', () => {
  it('bulanan: Gaji Bersih + 4 bagian tertutup (isi belum dimuat); tombol Bagikan PDF', () => {
    const html = render();
    expect(html).toContain('Rp 115.000');
    for (const t of ['Total Pendapatan', 'Pengurangan', 'Saldo Awal Bulan', 'Rincian Harian', 'Bagikan PDF']) expect(html).toContain(t);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(4);
    expect(html).not.toContain('Upah (9j 00m)');
    expect(html).not.toContain('hari hadir');           // rincian kecil di judul bagian sudah dihapus
  });

  it('mingguan: tanpa bagian Saldo Awal Bulan', () => {
    const html = render({ withOpening: false });
    expect(html).not.toContain('Saldo Awal Bulan');
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(3);
  });

  it('pengurangan merah; saldo toko berutang hijau +, karyawan berutang merah -', () => {
    expect(render()).toContain('text-red-500');
    const toko = render({ p: payroll({ openingBalance: -50000, netPay: 165000 }) });
    expect(toko).toContain('+Rp 50.000');
    expect(toko).toContain('text-emerald-600');
    const karyawan = render({ p: payroll({ openingBalance: 30000, netPay: 85000 }) });
    expect(karyawan).toContain('-Rp 30.000');
  });

  const ALL = { pend: true, cut: true, sal: true, hari: true };
  const clocks = { '2026-10-07': { masuk: '09:41', pulang: '19:35', stuck: null } };
  const withClocks = (p = payroll()) => buildPayrollReport(p, { formatRupiah, clocks });

  it('hari yang diedit owner diberi ikon samar, bukan teks biru', () => {
    const base = { report: withClocks(), isLocked: false, formatRupiah, initialOpen: ALL, onEditDay: () => {}, onEditDeduction: () => {}, onDeleteItem: () => {}, canEditOpening: true, openingForm: { kind: null, amount: '' }, onOpeningChange: () => {}, onSaveOpening: () => {}, busy: false, onShare: () => {} };
    const html = renderToString(<PayrollReport {...base} dayFlags={() => ({ edited: true })} />);
    expect(html).toContain('data-testid="day-diedit"');
    expect(html).toContain('aria-label="Diedit owner"');
    expect(html).not.toMatch(/>\s*diedit\s*</);
    expect(html).not.toContain('text-sky-');
    expect(renderToString(<PayrollReport {...base} dayFlags={() => ({})} />)).not.toContain('day-diedit');
  });

  it('terbuka: tabel Keterangan | Pemasukan (+) | Pengeluaran (-), jam kerja, upah harian, kasbon di tanggalnya', () => {
    const html = renderToString(
      <PayrollReport report={withClocks()} isLocked={false} formatRupiah={formatRupiah} dayFlags={() => ({})} initialOpen={ALL}
        onEditDay={() => {}} onEditDeduction={() => {}} onDeleteItem={() => {}} canEditOpening openingForm={{ kind: null, amount: '' }} onOpeningChange={() => {}} onSaveOpening={() => {}} busy={false} onShare={() => {}} />);
    for (const t of ['Keterangan', 'Pemasukan (+)', 'Pengeluaran (-)', '7 Okt', '09:41 s/d 19:35', 'Upah Jam Kerja (9j 00m)', 'Rp 135.000', 'Kasbon', 'Rp 20.000']) expect(html).toContain(t);
    expect(html).toContain('data-testid="edit-potongan"');
    expect(html).toContain('data-testid="saldo-toko"');
    expect(html).toContain('data-testid="saldo-karyawan"');
    expect(html).toContain('+ Plus');                  // toko berutang (menambah gaji)
    expect(html).toContain('− Minus');                 // karyawan berutang (mengurangi gaji)
    expect(html).not.toContain('menambah gaji');       // kartu besar lama diganti pil kecil
    expect(html).not.toContain('Positif =');            // teks penjelasan lama sudah dihapus
  });

  it('periode tertutup: saldo hanya dibaca (tanpa formulir), tanpa tombol ubah/hapus', () => {
    const html = renderToString(
      <PayrollReport report={withClocks(payroll({ openingBalance: -50000, netPay: 165000 }))} isLocked formatRupiah={formatRupiah} dayFlags={() => ({})} initialOpen={ALL}
        onEditDay={() => {}} onEditDeduction={() => {}} onDeleteItem={() => {}} canEditOpening={false} openingForm={{ kind: null, amount: '' }} onOpeningChange={() => {}} onSaveOpening={() => {}} busy={false} onShare={() => {}} />);
    expect(html).not.toContain('data-testid="saldo-toko"');
    expect(html).not.toContain('data-testid="edit-potongan"');
    expect(html).not.toContain('data-testid="edit-day"');
    expect(html).toContain('Toko berutang');
    expect(html).toContain('Periode ditutup');
  });
});
