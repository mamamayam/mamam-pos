import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: staf melihat Manajemen Menu tanpa HPP dan tanpa tombol hapus, owner tetap lengkap.
const auth = { owner: true };
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: () => auth.owner }) }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}`, triggerAlert: () => {}, triggerConfirm: () => {} }) }));

import MenuListTab from './tabs/MenuListTab';
import VariantListTab from './tabs/VariantListTab';

const noop = async () => {};
const data = {
  menus: [{ id: 'm1', name: 'Ayam Geprek', price: 15000, hpp: 7000, category: 'Ayam', variantGroupIds: ['v1'] }],
  variantGroups: [{ id: 'v1', name: 'Level Pedas', category: 'Rasa', isRequired: false, maxSelection: 1, options: [{ id: 'o1', name: 'Pedas', extraPrice: 0 }] }],
  categories: ['Ayam'], variantCategories: ['Rasa'],
  saveMenu: noop, deleteMenu: noop, reorderMenus: noop, setCategoriesPersist: noop, renameMenuCategory: noop, deleteMenuCategory: noop,
  saveVariantGroup: noop, deleteVariantGroup: noop, reorderVariantGroups: noop, setVariantCategoriesPersist: noop, renameVariantCategory: noop, deleteVariantCategory: noop,
};

beforeEach(() => { auth.owner = true; });

describe('Manajemen Menu — peran', () => {
  it('owner: HPP dan tombol hapus tampil', () => {
    const menu = renderToString(<MenuListTab data={data} />);
    expect(menu).toContain('HPP:');
    expect(menu).toContain('Rp 7000');
    expect(menu).toContain('Hapus Menu');
    expect(renderToString(<VariantListTab data={data} />)).toContain('Hapus Grup Varian');
  });

  it('staf: menu tetap tampil dengan harga jual, tapi tanpa HPP dan tanpa tombol hapus', () => {
    auth.owner = false;
    const menu = renderToString(<MenuListTab data={data} />);
    expect(menu).toContain('Ayam Geprek');
    expect(menu).toContain('Rp 15000');
    expect(menu).toContain('Edit Menu');
    expect(menu).not.toContain('HPP');
    expect(menu).not.toContain('7000');
    expect(menu).not.toContain('Hapus Menu');
  });

  it('staf: grup varian bisa diubah tapi tidak dihapus', () => {
    auth.owner = false;
    const html = renderToString(<VariantListTab data={data} />);
    expect(html).toContain('Level Pedas');
    expect(html).toContain('Edit Grup Varian');
    expect(html).not.toContain('Hapus Grup Varian');
  });
});
