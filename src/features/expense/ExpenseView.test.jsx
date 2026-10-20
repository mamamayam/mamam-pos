import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: staf membuka Pengeluaran tanpa kontrol hapus langsung/massal, dan catatan yang sedang
// diajukan hapus diberi badge "Menunggu hapus" (nominal karyawan tetap disensor untuk staf).
const auth = { owner: false };
vi.mock('../../auth/AuthContext', () => ({
  useAuth: () => ({ can: () => auth.owner }),
}));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}`, triggerAlert: () => {}, triggerConfirm: () => {} }) }));
const today = new Date();
const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const expenses = [
  { id: 'e1', amount: 120000, category: 'Belanja', supplier: 'Pasar', date: ymd, paymentMethod: 'Tunai', employeeId: null },
  { id: 'e2', amount: 50000, category: 'Kasbon', supplier: '', date: ymd, paymentMethod: 'Tunai', employeeId: 'emp1' },
];
vi.mock('../../hook/useExpenseData', () => ({
  useExpenseData: () => ({ expenses, categories: ['Belanja', 'Kasbon'], employees: [{ id: 'emp1', name: 'Sari' }], loading: false, error: null, reload: async () => {}, deleteExpense: async () => {}, bulkDeleteExpenses: async () => {} }),
}));
vi.mock('../../hook/useDeleteRequests', () => ({
  useExpenseDeleteRequestIndex: () => ({ index: new Map([['e1', { status: 'menunggu', requestedBy: 'Andi', reason: 'Dobel' }]]), reload: () => {} }),
}));
vi.mock('../../hook/deductionEdit', () => ({ updateDeduction: async () => {}, fetchDeductionByExpense: async () => null }));
vi.mock('../history/DeleteRequestSheet', () => ({ default: () => null }));
vi.mock('./ExpenseFormSheet', () => ({ default: () => null }));
vi.mock('../home/QuickAdjustmentSheet', () => ({ default: () => null }));

import ExpenseView from './ExpenseView';

const render = () => renderToString(<ExpenseView />).replace(/<!-- -->/g, '');
beforeEach(() => { auth.owner = false; });

describe('Pengeluaran untuk staf', () => {
  it('badge "Menunggu hapus" hanya di catatan yang diajukan', () => {
    const html = render();
    expect(html).toContain('Belanja');
    expect(html).toContain('Kasbon');
    expect((html.match(/Menunggu hapus/g) || []).length).toBe(1);
  });
  it('staf tidak punya "Pilih" (hapus massal hanya owner); owner punya', () => {
    expect(render()).not.toContain('>Pilih<');
    auth.owner = true;
    expect(render()).toContain('>Pilih<');
  });
  it('nominal pengeluaran karyawan disensor untuk staf, terbuka untuk owner', () => {
    expect(render()).toContain('Rp •••••');
    expect(render()).not.toContain('Rp 50000');
    auth.owner = true;
    expect(render()).toContain('Rp 50000');
  });
});
