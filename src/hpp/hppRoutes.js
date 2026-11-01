/**
 * Tab HPP <-> path. /hpp = Menu; /hpp/bahan = Bahan baku; /hpp/resep = Resep. Path lain di bawah /hpp jatuh ke Menu.
 * Urutan di sini = urutan tombol tab (bahan -> resep -> menu, sesuai alur hitungan).
 */
export const TABS = [
  { key: 'bahan', label: 'Bahan baku', path: '/hpp/bahan' },
  { key: 'resep', label: 'Resep', path: '/hpp/resep' },
  { key: 'menu', label: 'Menu', path: '/hpp' },
];

export function tabFromPath(pathname) {
  const clean = String(pathname || '').replace(/\/+$/, '');
  return TABS.find((t) => t.path === clean)?.key || 'menu';
}

export function pathForTab(key) {
  return TABS.find((t) => t.key === key)?.path || '/hpp';
}
