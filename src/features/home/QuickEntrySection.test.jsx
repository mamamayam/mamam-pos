import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: baris "Catatan Hari Ini" hanya bisa diketuk (diubah) oleh yang berizin `catatan.ubah`.
const auth = { owner: true, wage: true };   // wage: staf boleh melihat nominal karyawan (izin karyawan.upah)
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: (p) => (auth.owner ? true : p === 'karyawan.upah' && auth.wage) }) }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}`, triggerAlert: () => {}, triggerConfirm: () => {}, openApprovals: () => {} }) }));
let pendingCount = 0;
vi.mock('../../hook/usePendingApprovals', () => ({ usePendingApprovals: () => pendingCount }));
vi.mock('../../hook/useExpenseData', () => ({ useExpenseData: () => ({}) }));
vi.mock('../expense/ExpenseFormSheet', () => ({ default: () => null }));
vi.mock('./QuickAdjustmentSheet', () => ({ default: () => null }));

const quick = {
  employees: [], totals: { karyawan: 0, toko: 0 }, today: '2026-10-16', loading: false, error: null, reload: () => {},
  lastRequester: { current: '' }, feed: [],
};
vi.mock('../../hook/useQuickEntries', () => ({ useQuickEntries: () => quick }));

import QuickEntrySection from './QuickEntrySection';

const base = { status: 'tercatat', time: '10:27', amount: 1000, tag: '', note: '' };
beforeEach(() => {
  auth.owner = true; auth.wage = true;
  pendingCount = 0;
  quick.feed = [
    { ...base, key: 'p1', kind: 'pengeluaran', title: 'Belanja', source: { id: 'x1' } },
    { ...base, key: 'd1', kind: 'potongan', title: 'Budi', tag: 'Kasbon', source: { id: 'd1' } },
    { ...base, key: 'a1', kind: 'tambah', title: 'Sari', tag: 'Ongkir', status: 'disetujui', source: { id: 'a1' } },
  ];
});

describe('Catatan Hari Ini — ubah dari Beranda', () => {
  it('owner: tiap baris (Pengeluaran, Potongan, Tambah) bisa diketuk untuk diubah', () => {
    const html = renderToString(<QuickEntrySection />);
    expect((html.match(/role="button"/g) || []).length).toBe(3);
    expect(html).toContain('Ubah catatan Belanja');
    expect(html).toContain('Ubah catatan Budi');
    expect(html).toContain('Ubah catatan Sari');
  });
  it('staf: baris hanya tampilan, tidak bisa diketuk', () => {
    auth.owner = false;
    const html = renderToString(<QuickEntrySection />);
    expect(html).not.toContain('role="button"');
    expect(html).not.toContain('Ubah catatan');
  });
});

describe('Beranda — banner persetujuan (keputusannya di sheet Persetujuan)', () => {
  it('owner + ada pengajuan: banner dengan jumlahnya', () => {
    pendingCount = 3;
    const html = renderToString(<QuickEntrySection />);
    expect(html).toContain('data-testid="menunggu-persetujuan"');
    expect(html).toContain('Menunggu persetujuan');
    expect(html).not.toContain('data-testid="pengajuan"');   // kartu pengajuan tidak lagi di Beranda
  });
  it('owner tanpa pengajuan: tidak ada banner', () => {
    expect(renderToString(<QuickEntrySection />)).not.toContain('menunggu-persetujuan');
  });
  it('staf tidak pernah melihat banner (hanya owner memutuskan)', () => {
    auth.owner = false; pendingCount = 3;
    expect(renderToString(<QuickEntrySection />)).not.toContain('menunggu-persetujuan');
  });
});

describe('Catatan Hari Ini — pengajuan ditolak dan diedit', () => {
  const add = (over) => ({ ...base, key: 'a', kind: 'tambah', title: 'Sari', tag: 'Bonus', amount: 50000, shownAmount: 50000, edited: false, source: { id: 'a' }, ...over });
  it('ditolak: badge Ditolak, nominal +Rp 0 (bukan angka yang diajukan), alasan tetap tampil', () => {
    quick.feed = [add({ status: 'ditolak', shownAmount: 0, reason: 'Belum tercapai' })];
    const html = renderToString(<QuickEntrySection />).replace(/<!-- -->/g, '');
    expect(html).toContain('Ditolak');
    expect(html).toContain('data-testid="nominal-ditolak"');
    expect(html).toContain('+Rp 0');
    expect(html).not.toContain('Rp 50000');
    expect(html).toContain('Alasan: Belum tercapai');
  });
  it('staf tanpa izin lihat upah: Tambah biasa tetap disensor, yang ditolak menampilkan +Rp 0 (bukan angka upah)', () => {
    auth.owner = false; auth.wage = false;
    quick.feed = [add({ key: 'x', status: 'menunggu' }), add({ key: 'y', status: 'ditolak', shownAmount: 0, source: { id: 'y' } })];
    const html = renderToString(<QuickEntrySection />).replace(/<!-- -->/g, '');
    expect((html.match(/Rp •••••/g) || []).length).toBe(2);   // kartu Pengeluaran Karyawan + baris Tambah yang menunggu; baris ditolak tidak
    expect(html).toContain('+Rp 0');
  });
  it('disetujui + diedit: badge Disetujui dan badge Diedit; tanpa edit tidak ada badge Diedit', () => {
    quick.feed = [add({ key: 'e', status: 'disetujui', edited: true }), add({ key: 'f', status: 'disetujui', edited: false, source: { id: 'f' } })];
    const html = renderToString(<QuickEntrySection />).replace(/<!-- -->/g, '');
    expect((html.match(/data-testid="badge-diedit"/g) || []).length).toBe(1);
    expect(html).toContain('Diedit');
    expect(html).toContain('Disetujui');
  });
  it('menunggu + diedit: badge Menunggu dan Diedit; Potongan/Pengeluaran tidak punya badge Diedit', () => {
    quick.feed = [add({ status: 'menunggu', edited: true }), { ...base, key: 'p', kind: 'pengeluaran', title: 'Belanja', edited: true, source: { id: 'p' } }];
    const html = renderToString(<QuickEntrySection />).replace(/<!-- -->/g, '');
    expect(html).toContain('Menunggu');
    expect((html.match(/data-testid="badge-diedit"/g) || []).length).toBe(1);
  });
});
