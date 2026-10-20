import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: isi sheet Persetujuan (hapus transaksi, hapus pengeluaran, Tambahan) dan tab awalnya.
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}`, triggerAlert: () => {}, triggerConfirm: () => {} }) }));
const state = { del: [], exp: [], add: [], delError: null, expError: null };
vi.mock('../../hook/useDeleteRequests', () => ({
  usePendingDeleteRequests: () => ({ list: state.del, error: state.delError, reload: async () => {} }),
  putuskanHapusTransaksi: vi.fn(),
  usePendingExpenseDeleteRequests: () => ({ list: state.exp, error: state.expError, reload: async () => {} }),
  putuskanHapusPengeluaran: vi.fn(),
}));
vi.mock('../../hook/usePendingAdditions', () => ({
  usePendingAdditions: () => ({ list: state.add, reload: async () => {} }),
  decideAddition: vi.fn(),
}));
vi.mock('../../components/ui', async () => {
  const real = await vi.importActual('../../components/ui');
  return { ...real, Modal: ({ isOpen, children, title }) => (isOpen ? <div data-title={title}>{children}</div> : null) };
});

import ApprovalSheet from './ApprovalSheet';

const delReq = { id: 'r1', transactionId: 't1', number: '0042', customer: 'Budi', orderType: 'Takeaway', paymentMethod: 'Tunai', total: 45000, at: '2026-10-16T03:00:00Z', items: '2x Ayam Geprek', reason: 'Salah input', requestedBy: 'Andi', status: 'menunggu', createdAt: '2026-10-16T04:00:00Z' };
const expReq = { id: 'x1', expenseId: 'e1', date: '2026-10-16', category: 'Belanja', supplier: 'Pasar Baru', detail: 'Sayur', paymentMethod: 'Tunai', amount: 120000, employeeId: null, employeeName: '', reason: 'Dobel catat', requestedBy: 'Andi', status: 'menunggu', createdAt: '2026-10-16T04:00:00Z' };
const addReq = { id: 'a1', employeeId: 'e1', employeeName: 'Sari', category: 'Bonus', label: 'Target', amount: 50000, date: '2026-10-16', requestedBy: 'Andi', detail: null };

// React SSR menyisipkan <!-- --> di antara teks yang digabung; dibuang supaya pencocokan teks wajar.
const render = () => renderToString(<ApprovalSheet isOpen onClose={() => {}} />).replace(/<!-- -->/g, '').replace(/<!-- -->/g, '');

beforeEach(() => { state.del = []; state.exp = []; state.add = []; state.delError = null; state.expError = null; });

describe('ApprovalSheet', () => {
  it('tertutup: tidak merender apa pun', () => {
    expect(renderToString(<ApprovalSheet isOpen={false} onClose={() => {}} />)).toBe('');
  });
  it('pengajuan hapus: nomor, alasan, pengaju, dan tombol Tolak / Setujui & Hapus; jumlah di tab', () => {
    state.del = [delReq];
    const html = render();
    expect(html).toContain('#0042');
    expect(html).toContain('Salah input');
    expect(html).toContain('Diajukan Andi');
    expect(html).toContain('Setujui &amp; Hapus');
    expect(html).toContain('Transaksi (1)');
    expect(html).not.toContain('data-testid="daftar-tambahan"');
  });
  it('hanya ada Tambahan: tab Tambahan terbuka otomatis dengan kartunya', () => {
    state.add = [addReq];
    const html = render();
    expect(html).toContain('data-testid="daftar-tambahan"');
    expect(html).toContain('Sari');
    expect(html).toContain('Setelah disetujui, masuk hitungan gaji Sari');
    expect(html).toContain('Tambahan (1)');
  });
  it('keduanya ada: hapus transaksi dulu', () => {
    state.del = [delReq]; state.add = [addReq];
    expect(render()).toContain('data-testid="daftar-hapus"');
  });
  it('hanya ada pengajuan hapus pengeluaran: tab Pengeluaran terbuka otomatis dengan kartunya', () => {
    state.exp = [expReq];
    const html = render();
    expect(html).toContain('data-testid="daftar-hapus-pengeluaran"');
    expect(html).toContain('Belanja');
    expect(html).toContain('Pasar Baru');
    expect(html).toContain('Rp 120000');
    expect(html).toContain('Dobel catat');
    expect(html).toContain('Diajukan Andi');
    expect(html).toContain('Setujui &amp; Hapus');
    expect(html).toContain('Pengeluaran (1)');
    expect(html).toContain('angka dompet serta laba rugi ikut berubah');
    expect(html).not.toContain('data-testid="daftar-hapus"');
  });
  it('pengeluaran karyawan: kartu menyebut potongan gaji yang ikut terhapus', () => {
    state.exp = [{ ...expReq, category: 'Kasbon', employeeId: 'emp1', employeeName: 'Sari' }];
    const html = render();
    expect(html).toContain('Sari');
    expect(html).toContain('potongan gaji Sari yang tertaut');
  });
  it('transaksi dan pengeluaran sama-sama ada: transaksi dulu; pengeluaran dulu daripada tambahan', () => {
    state.del = [delReq]; state.exp = [expReq];
    expect(render()).toContain('data-testid="daftar-hapus"');
    state.del = []; state.add = [addReq];
    expect(render()).toContain('data-testid="daftar-hapus-pengeluaran"');
  });
  it('kosong: pesan kosong; migrasi belum jalan: petunjuk tampil', () => {
    expect(render()).toContain('Tidak ada pengajuan hapus transaksi.');
    state.delError = 'Fitur ini butuh migrasi baru';
    expect(render()).toContain('butuh migrasi baru');
    state.delError = null; state.expError = 'butuh migrasi 018';
    expect(render()).not.toContain('butuh migrasi 018');   // tab Transaksi yang terbuka; galat pengeluaran hanya di tabnya
  });
});
