import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// Yang diuji: sheet Ajukan Hapus untuk transaksi (sale) dan pengeluaran (expense), termasuk sensor nominal karyawan.
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}`, triggerAlert: () => {} }) }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../hook/useDeleteRequests', () => ({ ajukanHapusTransaksi: vi.fn(), ajukanHapusPengeluaran: vi.fn() }));
vi.mock('../../components/ui', async () => {
  const real = await vi.importActual('../../components/ui');
  return { ...real, Modal: ({ isOpen, children, title }) => (isOpen ? <div data-title={title}>{children}</div> : null) };
});

import DeleteRequestSheet from './DeleteRequestSheet';

const render = (props) => renderToString(<DeleteRequestSheet isOpen onClose={() => {}} {...props} />).replace(/<!-- -->/g, '');
const sale = { id: 't1', display_number: '0042', customer_name: 'Budi', order_type: 'Takeaway', payment_method: 'Tunai', total: 45000 };
const expense = { id: 'e1', category: 'Belanja', supplier: 'Pasar Baru', paymentMethod: 'Tunai', amount: 120000 };

describe('DeleteRequestSheet', () => {
  it('transaksi: judul dan ringkasan transaksi (tidak berubah)', () => {
    const html = render({ sale });
    expect(html).toContain('Ajukan Hapus Transaksi');
    expect(html).toContain('#0042');
    expect(html).toContain('Rp 45000');
    expect(html).toContain('Transaksi tetap ada sampai owner menyetujui');
    expect(html).not.toContain('ringkasan-pengeluaran');
  });
  it('pengeluaran: judul, ringkasan, dan kolom nama + alasan', () => {
    const html = render({ expense });
    expect(html).toContain('Ajukan Hapus Pengeluaran');
    expect(html).toContain('data-testid="ringkasan-pengeluaran"');
    expect(html).toContain('Belanja');
    expect(html).toContain('Pasar Baru');
    expect(html).toContain('Rp 120000');
    expect(html).toContain('Diajukan oleh');
    expect(html).toContain('Alasan');
    expect(html).toContain('Pengeluaran tetap ada sampai owner menyetujui');
  });
  it('pengeluaran karyawan untuk staf: nominal disensor, nama karyawan tampil', () => {
    const html = render({ expense: { ...expense, category: 'Kasbon', amount: 50000 }, hideAmount: true, employeeName: 'Sari' });
    expect(html).toContain('Kasbon · Sari');
    expect(html).toContain('Rp •••••');
    expect(html).not.toContain('Rp 50000');
  });
});
