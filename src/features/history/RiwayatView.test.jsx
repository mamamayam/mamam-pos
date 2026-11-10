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
// Indeks pengajuan bisa diganti per tes (dibaca saat render, bukan saat vi.mock dipasang).
const reqs = { index: new Map([['t2', { status: 'menunggu', requestedBy: 'Andi', reason: 'Dobel' }]]) };
vi.mock('../../hook/useDeleteRequests', () => ({ useDeleteRequestIndex: () => ({ index: reqs.index, reload: () => {} }) }));
vi.mock('./DeleteRequestSheet', () => ({ default: () => null }));

import RiwayatView from './RiwayatView';

const render = () => renderToString(<RiwayatView />).replace(/<!-- -->/g, '');
beforeEach(() => {
  auth.owner = false;
  reqs.index = new Map([['t2', { status: 'menunggu', requestedBy: 'Andi', reason: 'Dobel' }]]);
});

// Baris transaksi (data-testid="hist-row"); potongan sebelum baris pertama (chip, ringkasan) tidak ikut.
const rowsOf = (html) => html.split('data-testid="hist-row"').slice(1);

describe('Riwayat untuk staf', () => {
  it('menampilkan transaksi, badge "Menunggu hapus" hanya di transaksi yang diajukan', () => {
    const html = render();
    expect(html).toContain('Budi');
    expect(html).toContain('Sari');
    const rows = rowsOf(html);
    expect(rows.length).toBe(2);
    const badged = rows.filter(r => r.includes('Menunggu hapus'));
    expect(badged.length).toBe(1);
    expect(badged[0]).toContain('Sari');
  });
  it('chip "Menunggu hapus · N" tampil kalau ada yang tertahan, tapi TIDAK menyembunyikan transaksi apa pun', () => {
    const html = render();
    expect(html).toContain('data-testid="filter-menunggu-hapus"');
    expect(html).toContain('Menunggu hapus · 1');
    expect(html).toMatch(/data-testid="filter-menunggu-hapus"[^>]*aria-pressed="false"|aria-pressed="false"[^>]*data-testid="filter-menunggu-hapus"/);
    expect(rowsOf(html).length).toBe(2);   // belum disaring: semua transaksi tetap tampil
  });
  it('tanpa pengajuan yang menunggu (atau hanya yang ditolak), chip tidak tampil', () => {
    reqs.index = new Map();
    expect(render()).not.toContain('filter-menunggu-hapus');
    reqs.index = new Map([['t2', { status: 'ditolak', rejectReason: 'Tidak boleh' }]]);
    expect(render()).not.toContain('filter-menunggu-hapus');
  });
  it('staf tidak punya "Pilih Banyak" (hapus langsung/massal hanya owner)', () => {
    expect(render()).not.toContain('riwayat-pilih');
    auth.owner = true;
    expect(render()).toContain('riwayat-pilih');
  });
});
