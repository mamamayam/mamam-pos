/** Data contoh kecil untuk tes HPP. Angka dipilih supaya hitungan tangan mudah. */
export const RAW = {
  kategori: [
    { id: 'kb1', jenis: 'bahan', nama: 'Primer', urutan: 1 },
    { id: 'kb2', jenis: 'bahan', nama: 'Packaging', urutan: 2 },
    { id: 'km1', jenis: 'menu', nama: 'Paket', urutan: 1 },
    { id: 'km2', jenis: 'menu', nama: 'Satuan', urutan: 2 },
  ],
  bahan: [
    { id: 'A', nama: 'Ayam', kategori_id: 'kb1', satuan: 'kg', isi: 1000, unit_dasar: 'gr', harga: 1000, harga_acuan: null },
    { id: 'B', nama: 'Kemasan', kategori_id: 'kb2', satuan: 'pack', isi: 50, unit_dasar: 'pcs', harga: 50000, harga_acuan: null },
    { id: 'C', nama: 'Garam', kategori_id: null, satuan: 'pack', isi: 250, unit_dasar: 'gr', harga: null, harga_acuan: null },
  ],
  resep: [
    { id: 'saos', nama: 'Saos', grup: 'Saos', hasil_qty: 1000, hasil_unit: 'gr', urutan: 1 },
    { id: 'porsi', nama: 'Ayam goreng', grup: 'Menu utama', hasil_qty: null, hasil_unit: null, urutan: 2 },
  ],
  resepItem: [
    { id: 'i1', resep_id: 'saos', urutan: 1, bahan_id: 'A', sub_resep_id: null, qty: 600 },
    { id: 'i2', resep_id: 'saos', urutan: 2, bahan_id: 'B', sub_resep_id: null, qty: 2 },
    { id: 'i3', resep_id: 'porsi', urutan: 1, bahan_id: null, sub_resep_id: 'saos', qty: 50 },
    { id: 'i4', resep_id: 'porsi', urutan: 2, bahan_id: 'A', sub_resep_id: null, qty: 100 },
  ],
  menu: [
    { id: 'm1', nama: 'Paket Ayam', kategori_id: 'km1', harga_outlet: 10000, biaya_lain: 0, hpp_file: 1730, urutan: 1 },
    { id: 'm2', nama: 'Kemasan Saja', kategori_id: 'km2', harga_outlet: 2000, biaya_lain: 0, hpp_file: 1000, urutan: 2 },
  ],
  menuItem: [
    { id: 'j1', menu_id: 'm1', urutan: 1, resep_id: 'porsi', bahan_id: null, qty: 1 },
    { id: 'j2', menu_id: 'm1', urutan: 2, resep_id: null, bahan_id: 'B', qty: 1.5 },
    { id: 'j3', menu_id: 'm2', urutan: 1, resep_id: null, bahan_id: 'B', qty: 1 },
  ],
  riwayat: [
    { id: 'r1', bahan_id: 'A', harga: 800, harga_sebelum: null, catatan: 'Harga awal', sumber: 'migrasi', dibuat_pada: '2026-09-01T00:00:00Z' },
    { id: 'r2', bahan_id: 'A', harga: 1000, harga_sebelum: 800, catatan: 'Naik', sumber: 'manual', dibuat_pada: '2026-10-05T00:00:00Z' },
  ],
  setting: [{ key: 'margin', value: { lo: 30, hi: 30 } }, { key: 'online_markup', value: 1.25 }],
};
