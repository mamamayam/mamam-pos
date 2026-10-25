# Pindah absensi ke project C dan matikan mamam-global

Keputusan pemilik (26 Okt 2026): mamam-global dimatikan total. Absensi (web `mamam-absensi`) pindah ke project
Supabase yang sama dengan mamam-pos (C). Setelah ini karyawan hanya diurus di mamam-pos (layar Karyawan).

## Sebelum dan sesudah

| | Sebelum | Sesudah |
|---|---|---|
| Daftar karyawan di web absensi | `app_config('employees')` di project A | fungsi `absen_daftar_karyawan()` di C (dari tabel `employees`) |
| Log absen | tabel `attendanceLog` di A | tabel `attendance_log` di C |
| Pembaca log | mamam-pos lewat klien terpisah (`VITE_ABSENSI_*`) | mamam-pos lewat klien C biasa |
| Pencocokan karyawan | `employees.external_id` = id lama `EMP-…` | id karyawan C (uuid); `external_id` hanya untuk log lama |
| Stock checklist | `stock_checklists` + `app_config('stockMaster')` di A | `stock_checklists` + `app_settings('stockMaster')` di C |
| Foto selfie | bucket A | bucket `attendance-photos` di C (foto lama tetap di A) |
| Pulang/libur otomatis | cron A + app global | dihitung saat dibaca di mamam-pos (`dayRules.js`), tanpa cron |

## Urutan (kerjakan berurutan)

Branch yang berisi perubahan kode: `migrasi-absensi-ke-c` (mamam-pos) dan `migrasi-absensi-ke-c` (mamam-absensi).
**Jangan merge ke `main` sebelum langkah 1-3 selesai**: begitu mamam-pos baru ter-deploy, ia membaca absensi dari C.

**Persiapan (kapan saja, tidak mengganggu yang sedang jalan)**

1. Project C, SQL Editor: jalankan `supabase/migrations/020_absensi.sql` (aman diulang).
2. `.env.local` di folder mamam-pos: tambahkan `A_SUPABASE_URL` dan `A_SUPABASE_ANON_KEY` (kunci anon project A saja).
3. Simulasi salin data, lalu salin:
   ```powershell
   node scripts/migrasi-absensi-dari-a.mjs            # simulasi
   node scripts/migrasi-absensi-dari-a.mjs --apply    # tulis ke C
   ```
   Boleh diulang. Skrip menolak menulis kalau C sudah menerima absen baru.
4. Cek karyawan di mamam-pos (layar Karyawan): semua yang masih bekerja berstatus `aktif`/`freelance`, resign diberi status `resign`.
   Nama di sini = nama yang muncul di dropdown web absensi.

**Cutover (malam, setelah semua karyawan pulang; sebelum jam kerja besok)**

5. Ulangi langkah 3 (`--apply`) untuk menyusul absen yang masuk sejak salinan pertama.
6. mamam-absensi di Vercel: ubah Environment Variables `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` ke milik **project C**
   (`VITE_OUTLET_*` tetap), lalu merge branch `migrasi-absensi-ke-c` ke `main` (Vercel deploy otomatis).
   Link absensi yang dipegang karyawan tidak berubah.
7. mamam-pos: hapus `VITE_ABSENSI_SUPABASE_URL` dan `VITE_ABSENSI_SUPABASE_ANON_KEY` dari Vercel (sudah tidak dipakai),
   merge branch `migrasi-absensi-ke-c` ke `main`. `git pull` dulu karena Action versi menambah commit.
8. Buka link absensi di HP: pilih nama, absen masuk lalu cek papan Absensi dan Penggajian di mamam-pos.
   Cek juga tombol Pulang (checklist stok) dan halaman stok.

**Setelah aman (beberapa hari)**

9. Cadangan penuh project A: Dashboard Supabase -> Database -> Backups (atau `pg_dump`), plus unduh foto bucket
   `attendance-photos` kalau mau menyimpannya.
10. Matikan deploy Vercel mamam-global dan hentikan pemakaian APK-nya.
11. Pause project A di Dashboard Supabase. **Jangan hapus**: mamam-point masih memakai A (`get_customer_points`, pelanggan)
    dan link foto absen lama masih menunjuk ke bucket A.

## Kalau ada yang salah (rollback)

- Sebelum langkah 6: tidak ada yang berubah untuk karyawan. Hapus branch kalau mau batal.
- Setelah langkah 6: kembalikan `VITE_SUPABASE_*` mamam-absensi di Vercel ke project A dan redeploy versi lama. Absen yang sempat
  masuk ke `attendance_log` C tetap ada di C (tidak hilang). mamam-pos versi lama membaca A lewat `VITE_ABSENSI_*`.
  Selama A belum di-pause, rollback ini aman.

## Catatan teknis

- `attendance_log` sengaja berbentuk sama dengan `attendanceLog` lama (`id` + `payload` JSON) supaya mesin gaji dan aturan harian tidak berubah.
- Web absensi (anon) boleh membaca, menambah, dan mengubah `attendance_log`, tidak boleh menghapus. Ini pagar alur kerja seperti tabel lain
  (RLS longgar, lihat AGENTS.md), bukan keamanan data.
- Karyawan yang diganti: ubah status karyawan lama jadi `resign` (isi tanggal resign) dan tambah karyawan baru. Absen lama tetap
  terhitung ke karyawan lama; namanya hilang dari dropdown web absensi.
- Foto selfie lama tidak disalin. Kolom `photoUrl` di log lama berisi URL bucket A; selama A hanya di-pause, foto masih tampil.
