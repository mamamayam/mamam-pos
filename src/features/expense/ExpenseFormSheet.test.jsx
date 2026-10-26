import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ triggerAlert: () => {}, triggerConfirm: () => {} }) }));
// NominalInput memakai useSyncExternalStore tanpa getServerSnapshot, jadi tidak bisa dirender di renderToString.
vi.mock('../../components/ui', async (orig) => {
  const m = await orig();
  return { ...m, Modal: ({ children }) => <div>{children}</div>, NominalInput: ({ label }) => <label>{label}</label> };
});

import ExpenseFormSheet from './ExpenseFormSheet';

const data = (employees) => ({
  categories: ['Belanja'], employees, saveExpense: async () => {}, setCategoriesPersist: async () => {}, renameCategory: async () => {}, deleteCategory: async () => {},
});
const render = (employees) => renderToString(<ExpenseFormSheet isOpen onClose={() => {}} data={data(employees)} />).replace(/<!-- -->/g, '');

describe('urutan form Pengeluaran', () => {
  it('kategori, toko, detail, jumlah, tanggal, lalu Sumber Dana berdampingan dengan Uang Siapa?', () => {
    const html = render([{ id: 'k1', name: 'Agung', role: 'kurir', status: 'aktif' }]);
    const order = ['Kategori', 'Nama Toko/Supplier', 'Detail', 'Jumlah', 'Tanggal Transaksi', 'Sumber Dana', 'Uang Siapa?'].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('tanpa kurir: tidak ada pilihan Uang Siapa?', () => {
    expect(render([])).not.toContain('Uang Siapa?');
  });
});
