/**
 * Tab HPP <-> path. Urutan tab = alur hitungan (Bahan baku -> Resep -> Menu). /hpp = Bahan baku (tab awal),
 * /hpp/resep = Resep, /hpp/menu = Menu. `/hpp/bahan` (alamat lama) tetap dikenali sebagai Bahan baku.
 * Path lain di bawah /hpp jatuh ke Bahan baku.
 */
export const TABS = [
  { key: 'bahan', label: 'Bahan baku', path: '/hpp' },
  { key: 'resep', label: 'Resep', path: '/hpp/resep' },
  { key: 'menu', label: 'Menu', path: '/hpp/menu' },
];

const ALAMAT_LAMA = { '/hpp/bahan': 'bahan' };

export function tabFromPath(pathname) {
  const clean = String(pathname || '').replace(/\/+$/, '');
  return TABS.find((t) => t.path === clean)?.key || ALAMAT_LAMA[clean] || 'bahan';
}

export function pathForTab(key) {
  return TABS.find((t) => t.key === key)?.path || '/hpp';
}
