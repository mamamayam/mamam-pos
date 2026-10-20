/**
 * Izin per peran. SATU-SATUNYA tempat yang menentukan siapa boleh apa — ubah
 * di sini untuk menyesuaikan. Izin yang tidak terdaftar DITOLAK untuk semua
 * peran (aman secara bawaan).
 *
 * Prinsip: semua orang bisa membuka aplikasi dan bekerja (kasir, dompet,
 * pelanggan, absensi, catat pengeluaran). Owner-only hanya hal yang
 * menyangkut laba, gaji, upah, HPP, dan aksi yang menghapus/mengubah uang.
 *
 * Riwayat: terbuka untuk semua. Staf hanya bisa MENGAJUKAN hapus transaksi (owner yang memutuskan).
 *
 * Penggajian: layarnya terbuka untuk staf, tapi isinya berbeda. Staf melihat
 * kunci PIN karyawan, lalu HANYA gaji karyawan yang PIN-nya dimasukkan
 * (lihat features/payroll/MyPayroll.jsx). Daftar semua gaji = 'penggajian.semua'.
 */
export const ROLES = ['owner', 'staff'];

export const PERMISSIONS = {
  'screen.karyawan': ['owner'],          // layar Karyawan (data diri, upah) — disembunyikan dari staf
  'screen.pengaturan': ['owner'],        // layar Pengaturan (login, PIN, PIN karyawan)
  'penggajian.semua': ['owner'],         // Penggajian penuh (semua karyawan, edit). Staf hanya lihat gaji sendiri lewat PIN karyawan
  'screen.menu': ['owner'],              // layar Manajemen Menu (ubah harga & HPP)
  'screen.laporan': ['owner'],           // layar Laporan (Laba Rugi)
  'screen.hpp': ['owner'],               // tombol HPP di menu Lainnya (membuka /hpp). Pagar tampilan saja; data HPP dijaga RLS
  'laporan.labaKotor': ['owner'],        // kartu Laba Kotor di Laporan (Laba Rugi)
  'laporan.hapusTransaksi': ['owner'],   // hapus transaksi LANGSUNG di Riwayat. Yang tanpa izin ini (staf) hanya bisa MENGAJUKAN hapus, owner memutuskan di sheet Persetujuan
  'persetujuan.kelola': ['owner'],       // sheet Persetujuan (tile di menu slide-up, banner Beranda, badge): setujui/tolak hapus transaksi, hapus pengeluaran + Tambahan
  'beranda.laba': ['owner'],             // kartu Laba Kotor di Beranda
  'tambahan.setujui': ['owner'],         // setujui/tolak pengajuan Tambahan karyawan dari staf (Catat Cepat di Beranda)
  'pengeluaran.ubah': ['owner'],         // edit & hapus pengeluaran LANGSUNG (mencatat baru boleh semua). Staf hanya bisa MENGAJUKAN hapus, owner memutuskan di sheet Persetujuan
  'catatan.ubah': ['owner'],             // ubah catatan dari daftar "Catatan Hari Ini" di Beranda (Tambah, Potongan, Pengeluaran)
  'karyawan.kelola': ['owner'],          // tambah/edit/hapus/impor karyawan
  'karyawan.upah': ['owner'],            // melihat upah, bonus, tarif lembur
  'absensi.edit': ['owner'],             // mengoreksi jam absen (disimpan di C, bukan di sistem absensi)
};

/** Layar yang butuh izin tertentu untuk dibuka (id layar -> izin). */
export const VIEW_PERMISSION = {
  karyawan: 'screen.karyawan',
  pengaturan: 'screen.pengaturan',
  menu: 'screen.menu',
  persetujuan: 'persetujuan.kelola',     // bukan layar: tile di menu slide-up yang membuka sheet Persetujuan (disembunyikan dari staf)
  laporan: 'screen.laporan',
  hpp: 'screen.hpp',
};

export const can = (role, permission) =>
  ROLES.includes(role) && (PERMISSIONS[permission] || []).includes(role);

export const canOpenView = (role, viewId) => !VIEW_PERMISSION[viewId] || can(role, VIEW_PERMISSION[viewId]);

export const roleLabel = (role) => (role === 'owner' ? 'Owner' : role === 'staff' ? 'Staf' : '');
