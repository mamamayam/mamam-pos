import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: staf bisa membuka Riwayat tanpa kontrol hapus langsung, dan baris yang sedang
// diajukan hapus diberi badge "Menunggu hapus".
const auth = { owner: false };
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: (p) => auth.owner && p === 'laporan.hapusTransaksi' }) }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}`, triggerAlert: () => {}, triggerConfirm: () => {} }) }));
const today = new Date().toISOString();
const sales = [
  { id: 't1', display_number: '0001', customer_name: 'Budi', order_type: 'Takeaway', payment_method: 'Tunai', total: 45000, created_at: today, paid_at: today },
  { id: 't2', display_number: '0002', customer_name: 'Sari', order_type: 'Dine-in', payment_method: 'QRIS', total: 30000, created_at: today, paid_at: today },
];
vi.mock('../../hook/useReportData', () => ({ useReportData: () => ({ sales, loading: false, error: null, updatedAt: new Date(), reload: () => {}, deleteTransaction: async () => {}, bulkDeleteTransactions: async () => {} }) }));
vi.mock('../../hook/useDeleteRequests', () => ({ useDeleteRequestIndex: () => ({ index: new Map([['t2', { status: 'menunggu', requestedBy: 'Andi', reason: 'Dobel' }]]), reload: () => {} }) }));
vi.mock('./DeleteRequestSheet', () => ({ default: () => null }));
vi.mock('./EditTransactionSheet', () => ({ default: () => null }));
vi.mock('../../hook/useTransactionEdits', () => ({
  useEditLog: () => ({ logs: [{ id: 'l1', transactionId: 't1', via: 'langsung' }], reload: () => {} }),
  useEditRequestIndex: () => ({ index: new Map([['t1', { status: 'menunggu', requestedBy: 'Andi', reason: 'Salah metode' }]]), reload: () => {} }),
}));

import RiwayatView from './RiwayatView';

const render = () => renderToString(<RiwayatView />).replace(/<!-- -->/g, '');
beforeEach(() => { auth.owner = false; });

describe('Riwayat untuk staf', () => {
  it('menampilkan transaksi, badge "Menunggu hapus" hanya di transaksi yang diajukan', () => {
    const html = render();
    expect(html).toContain('Budi');
    expect(html).toContain('Sari');
    expect((html.match(/Menunggu hapus/g) || []).length).toBe(1);
  });
  it('baris yang pernah diubah diberi pensil, dan yang diajukan ubah diberi badge "Menunggu ubah"', () => {
    const html = render();
    expect((html.match(/data-testid="hist-edited"/g) || []).length).toBe(1);
    expect((html.match(/Menunggu ubah/g) || []).length).toBe(1);
  });
  it('staf tidak punya "Pilih Banyak" (hapus langsung/massal hanya owner)', () => {
    expect(render()).not.toContain('riwayat-pilih');
    auth.owner = true;
    expect(render()).toContain('riwayat-pilih');
  });
});
