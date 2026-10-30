import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ triggerAlert: () => {}, triggerConfirm: () => {} }) }));
// NominalInput memakai useSyncExternalStore tanpa getServerSnapshot, jadi tidak bisa dirender di renderToString.
vi.mock('../../components/ui', async (orig) => {
  const m = await orig();
  return { ...m, Modal: ({ children }) => <div>{children}</div>, NominalInput: ({ label }) => <label>{label}</label> };
});

import ExpenseFormSheet from './ExpenseFormSheet';

const data = (employees, categories = ['Belanja']) => ({
  categories, employees, saveExpense: async () => {}, setCategoriesPersist: async () => {}, renameCategory: async () => {}, deleteCategory: async () => {},
});
const render = (employees, categories) => renderToString(<ExpenseFormSheet isOpen onClose={() => {}} data={data(employees, categories)} />).replace(/<!-- -->/g, '');

describe('urutan form Pengeluaran', () => {
  it('kategori, toko, detail, jumlah, tanggal, lalu Sumber Dana berdampingan dengan Uang Siapa?', () => {
    const html = render([{ id: 'k1', name: 'Agung', role: 'kurir', status: 'aktif' }]);
    const order = ['Kategori', 'Nama Toko/Supplier', 'Detail', 'Jumlah', 'Tanggal Transaksi', 'Sumber Dana', 'Uang Siapa?'].map((t) => html.indexOf(t));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
  it('Sumber Dana berupa toggle Tunai / Non-Tunai (PillTabs), bukan dropdown', () => {
    const html = render([]);
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(/role="tab"[^>]*aria-selected="true"[^>]*>Tunai</);
    expect(html).toContain('>Non-Tunai<');
    expect(html).not.toContain('<option value="Non-Tunai"');
  });
  it('toggle Sumber Dana tetap setengah lebar (tidak melebar) walau Uang Siapa? tidak tampil', () => {
    expect(render([])).not.toContain('col-span-2');
  });
  it('tanpa kurir: tidak ada pilihan Uang Siapa?', () => {
    expect(render([])).not.toContain('Uang Siapa?');
  });
});

describe('kategori bawaan form Pengeluaran', () => {
  it('catatan baru langsung terisi Belanja (dropdown tetap bisa diganti)', () => {
    const html = render([], ['Gaji', 'Belanja', 'Lainnya']);
    expect(html).toContain('>Belanja<');
    expect(html).not.toContain('Pilih kategori');
  });
  it('kalau tidak ada kategori Belanja, jatuh ke "Pilih kategori"', () => {
    expect(render([], ['Gaji', 'Lainnya'])).toContain('Pilih kategori');
  });
});
