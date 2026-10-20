import { describe, it, expect, vi } from 'vitest';

// useAppSettings membuat klien Supabase saat dimuat; di tes cukup objek kosong (efek tidak jalan di renderToString).
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
// NominalInput memakai useSyncExternalStore tanpa getServerSnapshot, jadi tidak bisa dirender di renderToString; cukup bentuk sederhananya.
vi.mock('../../components/ui/NominalInput.jsx', () => ({
  default: ({ value, placeholder, readOnly, hint, title }) => (
    <div data-nominal={title}><input value={value ?? ''} placeholder={placeholder} readOnly={readOnly} onChange={() => {}} />{hint ? <p>{hint}</p> : null}</div>
  ),
}));

import { renderToString } from 'react-dom/server';
import { AppContext } from '../../context/AppContext.jsx';
import AdjustmentFields from './AdjustmentFields.jsx';
import PayrollReport from './PayrollReport.jsx';
import PayslipShareSheet from './PayslipShareSheet.jsx';
import { buildPayrollReport } from './payrollReport.js';

const noop = () => {};
const formatRupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
const categories = { tambahan: ['Bonus', 'Ongkir', 'Potong Ayam'], potongan: ['Kasbon'] };
const render = (form) => renderToString(
  <AppContext.Provider value={{ formatRupiah, triggerAlert: noop, triggerConfirm: noop }}>
    <AdjustmentFields form={{ label: '', amount: '', date: '2026-10-08', ...form }} onChange={noop} categories={categories} onManage={noop} />
  </AppContext.Provider>,
);

describe('AdjustmentFields: rincian Tambahan', () => {
  it('Ongkir / Potong Ayam menampilkan "Tambahkan detail"; kategori lain dan Potongan tidak', () => {
    expect(render({ type: 'tambahan', category: 'Ongkir' })).toContain('data-testid="detail-open"');
    expect(render({ type: 'tambahan', category: 'Potong Ayam' })).toContain('Tambahkan detail');
    expect(render({ type: 'tambahan', category: 'Bonus' })).not.toContain('detail-open');
    expect(render({ type: 'potongan', category: 'Ongkir' })).not.toContain('detail-open');
  });

  it('detail Ongkir terbuka: editor, total, dan nominal terkunci otomatis', () => {
    const html = render({ type: 'tambahan', category: 'Ongkir', detail: { kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: '5000' }, { customer: 'Bu Rina', amount: '4000' }] } });
    expect(html).toContain('data-testid="detail-editor"');
    expect(html).toContain('Detail ongkir');
    expect(html).toContain('Tambah baris');
    expect(html).toContain('Rp 9.000');                     // total rincian
    expect(html).toContain('Otomatis dari detail');
    expect(html).not.toContain('detail-open');
    expect(html).not.toContain('placeholder="Nominal"');    // kolom nominal ketikan diganti kolom terkunci
  });

  it('detail Potong Ayam: jenis dari daftar harga + Lainnya, kolom nama muncul untuk Lainnya', () => {
    const html = render({ type: 'tambahan', category: 'Potong Ayam', detail: { kind: 'potong_ayam', rows: [
      { type: 'Bld', name: '', qty: '10', price: '3000' }, { type: 'Lainnya', name: 'Kepala ayam', qty: '2', price: '4500' },
    ] } });
    expect(html).toContain('Detail potong ayam');
    // Dropdown jenis sekarang bottom sheet: pilihan lain (Sayap, Karkas) baru dirender saat sheet dibuka; yang terpilih tampil di tombol.
    for (const t of ['Bld', 'Lainnya', 'Nama potongan (mis. Kepala ayam)', '12 potong', 'Rp 39.000']) expect(html).toContain(t);
  });

  it('mode ubah: rincian dari database (tanpa type) menampilkan jenisnya, bukan kolom kosong', () => {
    const html = render({ type: 'tambahan', category: 'Potong Ayam', detail: { kind: 'potong_ayam', rows: [
      { name: 'Sayap', qty: 2, price: 3000 }, { name: 'Kepala ayam', qty: 1, price: 4500 },
    ] } });
    expect(html).toContain('Sayap');
    expect(html).toContain('Lainnya');                       // nama bebas jadi Lainnya...
    expect(html).toContain('value="Kepala ayam"');           // ...dengan namanya terisi
    expect(html).toContain('3 potong');
    expect(html).toContain('Rp 10.500');
  });

  it('detail dari kategori lain diabaikan (tidak bocor setelah ganti kategori)', () => {
    const html = render({ type: 'tambahan', category: 'Bonus', detail: { kind: 'ongkir', rows: [{ customer: 'A', amount: '1000' }] } });
    expect(html).not.toContain('detail-editor');
    expect(html).toContain('placeholder="Nominal"');
  });
});

const rp = (n) => `Rp ${n}`;
const att = (over = {}) => ({
  dayRows: [{ date: '2026-10-06', status: 'hadir', workedMinutes: 540, overtimeMinutes: 0, bolongMinutes: 0, fullTimeBonus: false, effectiveFromBolong: false }],
  hadirDays: 1, liburDays: 0, fullTimeDays: 0, totalWorkedMinutes: 540, totalOvertimeMinutes: 0, overtimeBlocks30Min: 0, overtimeRate: 5000, wagePay: 135000, overtimePay: 0, fullTimeBonusPay: 0, ...over,
});
const reportWith = (additions) => buildPayrollReport({
  attendance: att(), additions, deductions: [], additionsTotal: additions.reduce((s, a) => s + a.amount, 0), deductionsTotal: 0, openingBalance: 0, totalPenghasilan: 135000, netPay: 135000,
}, { formatRupiah: rp, periodDays: 7 });
const ongkirAdd = { id: 'o1', employeeId: 'e1', category: 'Ongkir', label: 'Ongkir (2 customer)', amount: 9000, date: '2026-10-06', detail: { kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: 5000 }, { customer: 'Bu Rina', amount: 4000 }] } };
const plainAdd = { id: 'b1', employeeId: 'e1', category: 'Bonus', label: 'Akhir pekan', amount: 10000, date: '2026-10-06' };

describe('Rincian Harian: baris Tambahan yang bisa dibuka', () => {
  const view = (additions) => renderToString(
    <PayrollReport report={reportWith(additions)} isLocked={false} formatRupiah={formatRupiah} dayFlags={() => ({})} initialOpen={{ hari: true }}
      onEditDay={noop} onEditDeduction={noop} onDeleteItem={noop} canEditOpening={false} openingForm={{ kind: null, amount: '' }} onOpeningChange={noop} onSaveOpening={noop} busy={false} onShare={noop} />,
  );

  it('ada rincian: judul tidak dobel, ada tombol buka, rincian tersembunyi sampai diketuk', () => {
    const html = view([ongkirAdd]);
    expect(html).toContain('data-testid="detail-toggle"');
    expect(html).toContain('Ongkir (2 customer)');
    expect(html).not.toContain('Ongkir (Ongkir');
    expect(html).not.toContain('data-testid="detail-row"');
    expect(html).not.toContain('Pak Hendra');
  });

  it('tanpa rincian: baris biasa, tanpa tombol buka', () => {
    const html = view([plainAdd]);
    expect(html).toContain('Bonus (Akhir pekan)');
    expect(html).not.toContain('detail-toggle');
  });

  it('laporan membawa lampiran hanya kalau ada rincian', () => {
    expect(reportWith([ongkirAdd]).attachments.ongkir.total).toBe(9000);
    expect(reportWith([plainAdd]).attachments).toBeNull();
  });
});

describe('PayslipShareSheet: opsi lampiran', () => {
  const sheet = (hasAttachment) => renderToString(<PayslipShareSheet isOpen onClose={noop} onShare={noop} hasAttachment={hasAttachment} />);

  it('centang lampiran hanya muncul kalau ada rincian; tanpa paragraf pengantar', () => {
    const on = sheet(true);
    expect(on).toContain('data-testid="share-with-attachment"');
    expect(on).toContain('Sertakan lampiran ongkir &amp; potong ayam');
    expect(on).toContain('data-testid="share-with-days"');
    expect(on).not.toContain('dibuat sebagai PDF');
    expect(on).not.toContain('Mati kalau');
    expect(sheet(false)).not.toContain('share-with-attachment');
  });
});
