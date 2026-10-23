-- =====================================================================
-- Migrasi 019 — Penanda "Diedit" pada Tambahan gaji (pengajuan).
-- Jalankan SEKALI di SQL Editor project C. Aman diulang. Butuh migrasi 009 (tabel/kolom payroll_additions).
--
-- Saat owner MENGUBAH Tambah dari Beranda (nominal, tanggal, kategori, keterangan, atau rincian berubah),
-- aplikasi mengisi edited_at. Status persetujuan tidak berubah, tapi catatannya diberi badge "Diedit"
-- supaya terlihat bahwa isinya bukan lagi seperti saat diajukan. Kosong = tidak pernah diubah.
-- Sebelum migrasi ini dijalankan, mengubah Tambah tetap jalan; hanya badge "Diedit" yang belum tersimpan.
-- =====================================================================

alter table payroll_additions add column if not exists edited_at timestamptz;
