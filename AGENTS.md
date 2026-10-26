# Panduan untuk agent — Mamam POS (repo: mamam-pos)

Baca ini dulu sebelum mengubah apa pun. Berlaku untuk agent apa pun (Claude, Codex, Cursor, dll).
Pemilik repo: Mamam. Bahasa kerja: **Indonesia** (teks tampilan, komentar kode, pesan ke pemilik).

## Aplikasi ini

- **Mamam POS** (dulu "Mamam Darurat", repo lama `mamam-darurat`, sekarang `mamam-pos`): POS + admin untuk usaha F&B MamamAyam, dipangkas dari
  `mamam-global`. Kasir, Dompet/Shift, Pelanggan, Pengeluaran, Karyawan, Absensi, Riwayat, Laporan, Penggajian, Menu.
- Stack: React 19 + Vite + Tailwind 4, Supabase (Postgres), PWA tulis tangan (`public/sw.js`, tanpa VitePWA). Dites dengan Vitest.
- **Online-first**: data langsung ke Supabase. Service worker hanya menyimpan cangkang app, **tidak pernah data**.
- **Absensi satu project dengan POS** (migrasi 020, keputusan pemilik 26 Okt 2026: mamam-global dimatikan total): web absensi (repo `mamam-absensi`) menulis log ke tabel `attendance_log` di project C dan membaca daftar karyawan dari fungsi `absen_daftar_karyawan()`. mamam-pos hanya MEMBACA `attendance_log` (koreksi owner tetap di `attendance_overrides`). **Karyawan diurus di satu tempat: layar Karyawan mamam-pos.** Absen baru memakai id karyawan C (uuid); log lama berid `EMP-…` dikenali lewat `employees.external_id` (`buildEmployeeIdMap` di `attendanceProvider.js`), jadi karyawan baru tidak butuh `external_id`. Lupa pulang dan libur otomatis tetap dihitung saat dibaca (`dayRules.js`), tidak ada cron. Langkah pindah dan cutover: `docs/migrasi-absensi.md`. Jangan menaruh kunci di repo atau chat.
- Skema database: `supabase/schema.sql` + `supabase/migrations/NNN_*.sql` (dijalankan manual di SQL Editor, aman diulang).

## Cara kerja dengan pemilik (PENTING)

- Pemilik **menerapkan perubahan sendiri**: agent menyerahkan file `.patch` dan perintah `git apply`; pemilik yang commit dan push.
  Agent biasanya **tidak punya akses push** ke repo ini. Jangan memaksa push; serahkan patch.
- Sebelum membuat patch, ambil `main` terbaru (`git fetch origin main`, rebase) karena pemilik sering push di sela-sela.
  Cek patch bisa di-apply bersih ke `origin/main` (`git apply --check`) dan tes + build lolos.
- Ambil keputusan yang masuk akal sendiri dan sebutkan asumsinya. Untuk perubahan tampilan, tunjukkan preview dulu bila memungkinkan.
- Setelah `git apply`, pemilik harus `git pull` sebelum push berikutnya, karena Action versi menambah commit di `main` (lihat bawah).

## Versi otomatis

Versi di `package.json` **dinaikkan otomatis** oleh GitHub Action tiap push ke `main`. **Jangan ubah `version` manual** dan jangan
membuat commit `chore(release): ...`. Besar-kecilnya ditentukan dari awalan pesan commit:

| Awalan pesan commit | Naik | Contoh |
|---|---|---|
| `feat!:` / `feat(x)!:` / baris `BREAKING CHANGE:` | major | 1.4.7 → 2.0.0 |
| `feat:` | minor | 1.4.7 → 1.5.0 |
| `fix:` `refactor:` `chore:` `docs:` `perf:` `test:` `style:` atau tanpa awalan | patch | 1.4.7 → 1.4.8 |

Agent **wajib** menulis pesan commit/patch dengan awalan ini, kalimat Indonesia setelah titik dua: `fix: kategori pengeluaran jadi dropdown`.
Rincian: `docs/versioning.md`. Versi tampil di menu Lainnya dan layar login (`src/lib/appVersion.js`).

## Aturan kode

- **Izin per peran** hanya di `src/auth/permissions.js` (peran: `owner`, `staff`). Izin tak terdaftar ditolak untuk semua. Layar terkunci lewat `VIEW_PERMISSION`;
  menu Lainnya otomatis menyembunyikan layar yang tak boleh dibuka. Ini pagar tampilan (PIN hardcoded di `pins.js`), bukan keamanan data.
- Uang = integer rupiah. Tanggal pengeluaran = string `YYYY-MM-DD` apa adanya (jangan di-parse sebagai UTC). Rumus murni ditaruh di berkas `*Math.js` / engine dan **dites**.
- Hapus = hard delete (tanpa recycle bin). Tampilan mengikuti pola komponen di `src/components/ui/` (Card, Select, Badge, SegmentedControl, dst).
- Dropdown SELALU lewat `Select` dari `components/ui` (tombol yang membuka bottom sheet, gaya sama dengan sheet Periode di FilterBar). Jangan pakai `<select>` bawaan browser; untuk kontrol mungil di baris/header pakai `<Select bare className=...>`.
- **Form slide-up (sheet) yang mengisi data WAJIB mengikuti aturan ini** (permintaan pemilik 20 Okt 2026; pemilik biasa mencatat banyak data berturut-turut dan sering kepencet Back):
  - **Peringatan sebelum menutup isian yang belum disimpan.** Pasang `dirty` pada `Modal` dari `useDirty(open, [semua isian])` (`src/hook/useDirty.js`). Selama `dirty`, menutup lewat X, ketuk latar, tarik ke bawah, ATAU tombol Back HP memunculkan konfirmasi "Isian belum disimpan" (Buang / Lanjut Isi) dan form tetap terbuka. Mekanismenya satu tempat di `Modal.jsx` (+ `guardClose` di `Overlay.jsx`, `guard` di `useBackLayer.js` + `backStack.js` (lapisan yang menolak ditutup dipulihkan entri riwayatnya saat itu juga, termasuk kalau Back kedua cepat mendarat di jangkar)); jangan membuat konfirmasi sendiri per form. Form baru yang punya isian dan tidak dipasangi `dirty` = salah.
  - **Setelah simpan: toast, bukan dialog.** Pakai `showToast()` (`src/lib/toast.js`, ditampilkan `Toaster` di `main.jsx`), jangan `triggerAlert` (dialog yang harus ditekan "Oke"). `triggerAlert` tetap untuk galat.
  - **Form TAMBAH tidak menutup sendiri setelah simpan**: toast lalu form dikosongkan (dan `rebase()` dari `useDirty` supaya dianggap bersih) untuk catatan berikutnya. Form UBAH menutup setelah simpan. Form sekali-jalan (Buka/Tutup Dompet, Ajukan Hapus, Edit Absen, nama perangkat, PIN) menutup setelah simpan, tetap dengan toast.
  - Belum dipasangi (sengaja): popup HPP (`src/hpp`, aksinya langsung diterapkan, bukan formulir simpan), `PaymentModal` (alur bayar), dan `CategoryModal` (tiap perubahan langsung tersimpan).
- Setelah mengubah kode: `npm test` dan `npm run build` harus lolos. Tambah/ubah tes untuk logika yang berubah.
- Patch lama yang sudah di-apply diarsipkan di `patches/`. Itu hanya catatan sejarah (isinya sudah ada di kode, sebagian sudah ditimpa
  patch berikutnya): jangan di-apply ulang dan jangan dijadikan acuan. Patch baru dari agent cukup diserahkan lewat chat; pemilik bebas
  menyimpannya di `patches/` atau menghapusnya.

## Routing POS dan HPP (satu domain)

- `/` dan path lain = POS (`App`, login PIN). `/hpp` dan `/hpp/*` = HPP (`src/hpp/HppApp.jsx`, login email + password Supabase Auth). Satu project Vercel, satu build, satu database.
- Mode dipilih SEKALI di `src/main.jsx` lewat `isHppPath` (`src/lib/appMode.js`); jangan dicek ulang di dalam komponen. Navigasi POS tetap berbasis state (tanpa react-router).
- `HppApp` dimuat `React.lazy` (chunk terpisah, tidak terunduh di HP yang hanya membuka POS). Jangan mengimpor `src/hpp/*` secara statis dari kode POS, dan jangan mengimpor `AuthContext`/`app/*`/singleton `backStack` dari kode HPP (dijaga `src/lib/appMode.test.js`).
- Mode HPP: tanpa singleton `backStack` POS, `AuthProvider`, `ExitToast`, `ConnectionBanner`, dan tanpa service worker baru. Stack navigasi HPP memakai instance SENDIRI (`src/hpp/hppBackStack.js`, `createBackStack`): Back menutup popup dulu, lalu tab Harga bahan kembali ke Menu, lalu dari Menu muncul notif "Ketuk lagi untuk keluar" (`NotifKeluar` di `ui.jsx`, kembaran `ExitToast` tanpa framer-motion; teks dan tampilan harus tetap sama dengan app utama), Back kedua dalam 2 detik keluar ke POS. Manifest PWA tetap `start_url: "/"`, tidak menyebut `/hpp`.
- `vercel.json` mengarahkan semua path ke `index.html` (refresh/link langsung ke `/hpp` tidak 404); berkas nyata (`/assets/*`, manifest, ikon) tetap dilayani apa adanya.
- **Halaman HPP** (`src/hpp/`, rincian dan cara memasang: `docs/hpp.md`): dua tab, yaitu Menu (`/hpp`) dan Harga bahan (`/hpp/bahan`), plus Pengaturan (ikon gerigi). Tab selain Menu = satu lapisan di stack navigasi, alamat mengikuti tab lewat `replaceState` (bukan `pushState`), jadi refresh dan link langsung ke `/hpp/bahan` tetap jalan.
  Alur logika: Bahan baku -> Resep (bisa berisi resep lain, bertingkat) -> Menu (komponen = resep dan/atau bahan langsung). Semua angka dihitung dari harga bahan di `src/hpp/hppModel.js` (dites): harga per unit dasar = harga / isi; sub-resep batch = qty / hasil_qty * total; HPP menu = komponen + `biaya_lain` (sisa yang belum diuraikan); margin = (jual - HPP) / jual; kategori HIGH/LOW/SEDANG dari batas di Pengaturan (`hpp_setting`).
  Data di Supabase (`supabase/migrations/013_hpp.sql`, data awal `014_hpp_data_awal.sql` dari file "DATABASE MAMAM AYAM" 27/11/2025). Tidak ada data HPP di bundle JS. Akses hanya akun yang terdaftar di `hpp_admin` (RLS lewat `hpp_is_admin()`); role `anon` dan staf POS tidak bisa membaca. Riwayat harga dicatat otomatis oleh trigger dan tidak bisa diubah. Ubah harga lewat RPC `hpp_ubah_harga`. Komposisi menu dan isi resep bisa diubah dari popup menu (mode Ubah komposisi, `KomposisiPicker.jsx`); isi resep berlaku untuk semua menu pemakainya dan sub-resep yang membuat lingkaran ditolak (`bisaTambahSub` di `hppModel.js`). Membuat bahan/resep/menu baru belum ada di UI (lihat `docs/hpp.md`).
  Berkas di `src/hpp` hanya boleh mengimpor sesama `src/hpp`, `react`, `lucide-react`, `@supabase/supabase-js`, ditambah dua modul bersama yang murni (hanya mengimpor `react`): `lib/backStack` (hanya `createBackStack`, dari `hppBackStack.js`) dan `components/ui/Overlay` (dari `ui.jsx`) (dijaga `appMode.test.js`). Popup HPP (`Sheet` di `ui.jsx`) memakai `Overlay` yang sama dengan app utama: lembar putih dari bawah, handle bar, tombol X bulat, tarik ke bawah untuk menutup. Klien Supabase HPP sendiri (`hppClient.js`, `storageKey` terpisah) supaya sesinya tidak bertabrakan dengan POS. Login: email + password Supabase Auth; password 4 digit diberi awalan `mamam:` otomatis (akun owner POS).
- Tombol HPP di menu Lainnya pindah ke `/hpp` di **tab yang sama** lewat `leaveForHref` (`location.replace`), BUKAN tab baru: tab baru riwayatnya kosong sehingga Back keluar aplikasi. Dengan ini Back dari HPP kembali ke POS; `pageshow` di `main.jsx` memuat ulang POS kalau dipulihkan dari cache back/forward.
- `/hpp` bisa dibuka siapa saja: pembatasan data dijaga RLS di database (`hpp_is_admin()`), bukan cek path. Frontend HPP hanya memakai anon key.

## Keputusan produk yang sudah ditetapkan pemilik

**Laporan** (`src/features/reports/`) satu layar (tanpa tab) dengan filter periode (Bulanan [default, navigasi `‹ ›` per bulan + daftar bulan, pola `PeriodNav` seperti Absensi/Penggajian], Harian, Semua, Rentang):
- **Laba Rugi**: Total Penjualan, Laba Kotor, Pengeluaran (3 kartu, tanpa HPP), lalu Pengeluaran per Kategori, per metode bayar, per tipe pesanan, menu terlaris.
  **Laba Kotor = Total Penjualan − Pengeluaran.** Pengeluaran = SEMUA catatan pengeluaran apa pun kategorinya (belanja, bayar ayam, kasbon,
  gaji, dll; tunai dan non-tunai). Tidak ada kategori yang dikecualikan dan tidak ada "laba bersih" di sini.
  Tab "Rincian Pengeluaran" sudah dihapus: daftar catatannya kembar dengan layar Pengeluaran, jadi yang dipertahankan hanya total per kategori (kartu di Laba Rugi).

**Pengeluaran**: kolom Kategori adalah dropdown; kategori baru ditambah lewat ikon gerigi (Kelola Kategori). Staf mencatat bebas tapi tidak menghapus langsung: hanya **mengajukan hapus** (lihat Persetujuan).

**Manajemen Menu** (`src/features/menu/`) terbuka untuk staf (permintaan pemilik 23 Okt 2026): staf boleh menambah dan mengubah menu (nama, kategori, harga jual, varian terkait), grup varian, dan kategori. **HPP/Modal disembunyikan dari staf** (izin `menu.hpp`: label di daftar dan kolom di form; HPP menu yang diubah staf tetap utuh, menu baru dari staf HPP = 0) dan **hapus tetap owner** (izin `menu.hapus`: hapus menu, grup varian, opsi varian, kategori). Belum ada alur persetujuan untuk menu, jadi staf tidak menghapus apa pun di sana; kalau nanti perlu, tambah alur seperti hapus transaksi, jangan membuka hapus langsung.

**Dompet** (`src/features/shift/ShiftView.jsx`) satu halaman tanpa tab Riwayat (permintaan pemilik 24 Okt 2026): kartu status Dompet di atas dengan **saklar** buka/tutup (ketuk = sheet Buka/Tutup Dompet yang sama; isi dan alurnya tidak berubah), lalu navigasi hari `‹ [Sab, 24 Okt 2026 ▾] ›` + "Ke hari ini" + "Diperbarui/Perbarui" (`PeriodNav`, pola Absensi). Isi hari ini (dompet terbuka): kartu utama **Uang di Dompet** (= `expectedCash`, kasir saja; dropdown Rincian berlabel: pemasukan per sumber, **Total Pemasukan**, Pengeluaran Kasir, **Total Saldo Dompet**, dari `walletRows` di `shiftMath.js`), kartu **Uang di Kurir** (komponen `Hero` yang SAMA dengan dompet, beda warna: oranye muda/lembut (`bg-accent-100`, teks gelap; ikut tema), BUKAN biru dan bukan gelap; nama kurir sebagai keterangan, tanpa teks tambahan; Rincian = Penjualan Dipegang Kurir, Total Pemasukan, Pengeluaran Kurir, **Total Saldo Kurir**, dari `courierRows`: pemasukan = saldo + pengeluaran kurir), lalu **Total Cash** (= `totalCashBisnis`, dompet + kurir). Hari lain: penutupan hari itu tampil langsung (`closedOnDay` di `shiftMath.js`, hari = hari TUTUP) dengan gaya sama, "Uang di Dompet saat Tutup" + selisih + snapshot kurir; layar Laporan Tutup setelah menutup dompet tetap ada. Rumus uang tidak berubah (`shiftMath.js`; pengeluaran kurir mengurangi saldo kurir, bukan laci). Filter lama (Hari Ini/Kemarin/Bulan Ini/Semua/Rentang) dan rekap total dihapus karena diganti navigasi per hari.

**Staf** tidak boleh melihat/membuka **Laporan** (owner-only). **Riwayat** terbuka untuk staf, tapi staf TIDAK bisa menghapus langsung: hanya **mengajukan hapus** per transaksi (lihat Persetujuan di bawah).

**Gaji** mengikuti aturan hitung mamam-kasir (B): `docs/payroll-rules.md`. Jangan diubah diam-diam.

**Simpan Pesanan / bayar nanti** (`src/features/pos/savedOrders.js`, `OrderBreakdown.jsx`, `SavedOrdersSheet.jsx`, `src/hook/useSavedOrders.js`; tanpa migrasi):
- Keranjang punya kartu **Rincian Pembelian** (per item: qty × harga, catatan; subtotal, diskon, ongkir, total; badge "Belum dibayar") dan dua tombol: **Simpan Pesanan** (secondary) dan **Bayar** (primary). Pil **Tersimpan** di header keranjang membuka daftar pesanan belum dibayar.
- Pesanan tersimpan = baris `transactions` berstatus `open` + `transaction_items`, **di server** (bisa dilanjutkan dari HP lain). Bukan penjualan: Laporan, Shift, Dompet, dan Beranda semua membaca `status = 'paid'`; jangan menghapus filter itu. Baru dihitung setelah dibayar.
- Dari daftar: **Lanjutkan** memuat pesanan ke keranjang (`loadSavedOrder`, `savedOrderId` di `usePosStore`; Simpan lagi = memperbarui pesanan yang sama), **Bayar** memuat lalu membuka pembayaran, **Hapus** menghapus permanen (hanya yang `open`). Keranjang yang belum disimpan tetap aman di localStorage seperti sebelumnya.
- Membayar pesanan tersimpan lewat `checkout({ orderId })`: baris `open` diubah jadi `paid` (nomor tetap, `paid_at` dan `created_at` = waktu bayar), item diganti dulu baru status dibalik. Ditolak kalau pesanan sudah dibayar/dihapus dari HP lain (update dibatasi `status = 'open'`).
- Keputusan lama "tanpa Simpan Bill" digantikan permintaan pemilik 19 Okt 2026.
- **Bagikan struk** (`receiptModel.js`, `receiptImage.js`, `shareReceipt.js` di `src/features/pos/`): dibagikan sebagai **GAMBAR (PNG), bukan PDF** (permintaan pemilik 19 Okt 2026, berlaku untuk transaksi lunas DAN pesanan tersimpan). Tombol **Bagikan** ada di popup struk setelah bayar (`ReceiptModal`), Detail transaksi di Riwayat, dan tiap kartu Pesanan Tersimpan (ikon saja, `onShare`).
  Tiga sumber dinormalkan ke satu bentuk (`receiptFromCheckout` / `receiptFromSale` / `receiptFromSaved`), lalu `layoutReceipt` (murni, dites; lebar teks disuntik lewat `measure`) menyusun gambar selebar kertas struk dan `buildReceiptImage` menggambarnya ke `<canvas>` (tanpa library, skala 2x) jadi Blob PNG, dibagikan lewat `shareOrDownloadFile` (`mime: 'image/png'`).
  Transaksi lunas = "STRUK PEMBELIAN" (+ pembayaran, nama berkas `Struk-<nomor>.png`); pesanan tersimpan = "TAGIHAN / BELUM DIBAYAR" tanpa metode bayar (`Tagihan-<nomor>.png`). Tidak ada hitungan harga baru: semua angka dari sumbernya.
  **Uang diterima/Dibayar dan Kembalian WAJIB ikut di struk lunas dan di Detail Riwayat** (pemilik pernah memintanya, jangan dihapus): Tunai = "Uang diterima" + "Kembalian"; Split = "Dibayar" + "Kembalian". Datanya dari `transactions.amount_paid` / `change_amount`, jadi kolom itu harus tetap ada di `SALE_COLUMNS` (`useReportData.js`); tanpa itu Riwayat dan struk dari Riwayat kehilangan barisnya. Kembalian Rp 0 (uang pas) tetap tampil; data kosong (transaksi lama/impor, QRIS, Transfer, Ojol) = baris dilewati. Slip gaji tetap PDF (`payslipPdf.js`), tidak ikut berubah.

**Catat Cepat (Beranda)** (`src/features/home/`): menggantikan daftar "Riwayat Pesanan Hari Ini". Tile **Pengeluaran** (toko, di atas), lalu **Tambah** dan **Potongan** (karyawan), dua kartu ringkasan
(**Pengeluaran Karyawan** dan **Pengeluaran Toko**), banner "Menunggu persetujuan" (owner; membuka sheet Persetujuan), dan catatan hari ini.
- Form-nya **komponen yang sama** dengan modul asli: Pengeluaran = `ExpenseFormSheet` (juga dipakai layar Pengeluaran); Tambah/Potongan = `AdjustmentFields` (juga dipakai Penggajian).
  Jangan menduplikasi form; ubah komponen bersama.
- **Persetujuan owner HANYA untuk Tambah** dari staf (`payroll_additions.status`: `menunggu`/`disetujui`/`ditolak`, izin `tambahan.setujui`). Tambah yang belum disetujui **tidak dihitung gaji**
  dan menahan penutupan periode gaji. Potongan dan Pengeluaran **langsung dicatat**, tanpa persetujuan.
- **Potongan = pengeluaran karyawan**: RPC `catat_potongan` (migrasi `009_catat_cepat.sql`) menulis `expenses` (dengan `employee_id`) + `payroll_deductions` dalam satu transaksi.
  Sumber dana Tunai otomatis mengurangi saldo Dompet (rumus Dompet tidak diubah: hanya `payment_method = 'Tunai'`). Menghapus pengeluaran karyawan ikut menghapus potongannya (FK cascade), begitu juga sebaliknya lewat `usePayrollData.deleteDeduction`.
- **Tambahan & Potongan HANYA dicatat lewat Catat Cepat** (satu tempat). Layar **Penggajian** bersih dari formulir Tambahan/Potongan: hanya menampilkan rincian (+ tombol hapus) dan saldo awal.
  Potongan juga bisa **diubah** dari Penggajian: tombol pensil membuka form Potongan Catat Cepat yang SAMA (`QuickAdjustmentSheet` prop `editing`; karyawan dan jenis dikunci).
  RPC `ubah_potongan` (migrasi `010_ubah_potongan.sql`) mengubah potongan + pengeluaran karyawannya dalam satu transaksi (nominal, tanggal, kategori, keterangan, sumber dana). Periode yang sudah ditutup tetap menolak.
  Semua Potongan jadi pengeluaran karyawan, jadi selalu masuk gaji, Laporan pengeluaran, dan Dompet (kalau Tunai).
- **Kasbon hanya lewat Potongan karyawan**: kategori yang berawalan "Kasbon" tidak ditawarkan di dropdown form Pengeluaran (toko), tapi pengeluaran karyawan hasil Potongan tetap tampil di daftar Pengeluaran
  (badge Karyawan) dan dihitung di Laporan dan Dompet.
- Staf tidak melihat nominal Tambah/Potongan (izin `karyawan.upah`), hanya nominal toko.
  Berlaku juga di layar **Pengeluaran**: nominal pengeluaran karyawan (gaji, kasbon) tampil `Rp •••••` di baris dan Detail, dan total yang mencampurnya (pil Karyawan + Semua, total per hari) ikut disensor
  supaya selisihnya tidak membuka angka karyawan (`isWageHidden` / `wageMaskPlan` di `expenseFilter.js`, prop `maskKeys` di `SummaryPills`). Tampilan baru yang memuat pengeluaran karyawan wajib memakai aturan yang sama.
- **Ubah dari Beranda (owner, izin `catatan.ubah`)**: ketuk satu baris "Catatan Hari Ini" membuka form yang SAMA dalam mode ubah: Pengeluaran toko = `ExpenseFormSheet` (`editing`), Tambah dan Potongan = `QuickAdjustmentSheet` (`editing`, `item.type` = `tambahan`/`potongan`).
  Tambah diubah lewat `useQuickEntries.updateAddition` (`additionUpdateRow`, status/persetujuan tidak berubah). Potongan lewat RPC `ubah_potongan` (`src/hook/deductionEdit.js`).
  **Pengeluaran karyawan (expenses.employee_id) tidak pernah diubah lewat form Pengeluaran biasa**, di layar mana pun: Edit di Detail Pengeluaran mencari potongan tertaut (`payroll_deductions.expense_id`) dan membuka form Potongan. Hanya pengeluaran karyawan yatim (tanpa potongan tertaut) yang jatuh ke form Pengeluaran biasa.
  Sumber dana potongan yang diubah dibaca dari pengeluarannya (`deductionPayment`), tidak ditebak; kalau ditebak 'Tunai', ubah_potongan bisa diam-diam menimpa Non-Tunai.

**Persetujuan (owner)** (migrasi `016_hapus_transaksi.sql` dan `018_hapus_pengeluaran.sql`; `src/features/approvals/`, `src/hook/useDeleteRequests.js`, `usePendingAdditions.js`, `usePendingApprovals.js`, `src/features/history/DeleteRequestSheet.jsx`):
- Satu menu slide-up **Persetujuan** (`ApprovalSheet`, izin `persetujuan.kelola`) untuk semua yang menunggu keputusan owner, tiga tab: **Transaksi** (hapus transaksi), **Pengeluaran** (hapus pengeluaran), dan **Tambahan** (pengajuan Tambah gaji dari staf; kartunya DULU di Beranda, sekarang hanya di sini, Beranda cuma punya banner jumlahnya).
  Dibuka dari tile Persetujuan di menu slide-up (tile aksi, `action: 'persetujuan'`, bukan layar) dan dari banner Beranda (`openApprovals` di `useAppContext`). Badge merah jumlah pengajuan di ikon Beranda, ikon Menu, dan tile (`usePendingApprovals` = Tambahan + hapus transaksi + hapus pengeluaran yang menunggu, polling 60 detik).
- **Hapus transaksi**: staf (tanpa izin `laporan.hapusTransaksi`) membuka Detail di Riwayat > **Ajukan Hapus** (alasan + "Diajukan oleh" wajib) -> RPC `ajukan_hapus_transaksi`. Satu transaksi maksimal satu pengajuan yang menunggu (index unik). Transaksi TIDAK dihapus sampai owner **Setujui & Hapus** (RPC `putuskan_hapus_transaksi`: hapus permanen + item cascade dalam satu transaksi database) atau **Tolak** (transaksi tetap; alasan penolakan tampil di Detail staf, staf boleh mengajukan lagi).
  Tabel `transaction_delete_requests` menyimpan SNAPSHOT (nomor, total, pelanggan, item), tanpa FK ke transaksi, jadi jejak siapa-minta-apa-kenapa tetap ada setelah transaksi hilang. Kalau owner menghapus langsung dari Riwayat, trigger menandai pengajuannya 'disetujui' (tidak menggantung).
  Owner tetap menghapus langsung tanpa persetujuan. Hapus banyak (Pilih Banyak) hanya owner. Baris yang sedang diajukan diberi badge "Menunggu hapus" untuk semua peran.
- **Hapus pengeluaran** (permintaan pemilik 20 Okt 2026, migrasi 018, kembaran alur transaksi): staf (tanpa izin `pengeluaran.ubah`) membuka Detail di layar Pengeluaran > **Ajukan Hapus** (`DeleteRequestSheet` prop `expense`; alasan + "Diajukan oleh" wajib) -> RPC `ajukan_hapus_pengeluaran`. Pengeluaran TIDAK dihapus sampai owner **Setujui & Hapus** (RPC `putuskan_hapus_pengeluaran`) atau **Tolak** (tetap ada, alasan penolakan tampil di Detail staf, boleh diajukan lagi). Tabel `expense_delete_requests` menyimpan snapshot tanpa FK. Baris yang diajukan diberi badge "Menunggu hapus". Berlaku juga untuk pengeluaran karyawan (potongan): nominalnya tetap `Rp •••••` untuk staf di sheet pengajuan, dan kalau disetujui potongan gaji tertaut ikut terhapus (FK cascade). Hapus langsung dan Pilih (hapus massal) tetap hanya owner. Semua hapus dari staf wajib lewat persetujuan: jalur hapus baru untuk staf = salah.
- **Status Tambah di "Catatan Hari Ini"** (permintaan pemilik 23 Okt 2026): selain badge Menunggu / Disetujui / Ditolak, Tambah yang isinya DIUBAH owner dari Beranda diberi badge **Diedit** (`payroll_additions.edited_at`, migrasi `019_tambahan_diedit.sql`; diisi `useQuickEntries.updateAddition` hanya kalau nominal, tanggal, kategori, keterangan, atau rincian benar-benar berubah, lewat `additionChanged`; status persetujuan tidak ikut berubah; sebelum migrasi 019 dijalankan, mengubah tetap jalan tanpa badge). Kartu pengajuan di sheet Persetujuan memberi tanda "Diedit owner" dan punya tombol **Ubah** (di samping Tolak dan Setujui; permintaan pemilik 24 Okt 2026): membuka form Tambahan yang SAMA dalam mode ubah (`QuickAdjustmentSheet` `editing`), simpan lewat `saveAdditionEdit` (`src/hook/additionEdit.js`, satu jalur dengan Beranda); status tetap menunggu, owner lalu Setujui/Tolak. Pengajuan yang **ditolak** menampilkan nominal **+Rp 0** (`shownAdditionAmount`; nominal yang diajukan tidak ditampilkan lagi, juga untuk staf), alasan penolakan tetap tampil.
- Keputusan memanggil `notifyApprovalsChanged()` (hitung ulang badge + sinyal ke layar lain, mis. Catatan Hari Ini di Beranda). Migrasi 016 / 018 belum dijalankan: bagian hapus-transaksi / hapus-pengeluaran diam-diam kosong, mengajukan/memutuskan memberi petunjuk menjalankan migrasinya.
- Ini jejak audit dan pagar alur kerja, bukan keamanan data (RLS tetap longgar, PIN hardcoded).

**Perangkat terdaftar** (migrasi `011_perangkat.sql`; `src/hook/deviceLogic.js`, `useDevice.js`, `useDevices.js`, `src/lib/deviceId.js`, `src/features/settings/DeviceSettings.jsx`):
- Login hanya membawa peran, jadi "siapa yang mencatat" dilacak lewat **HP**: tiap HP punya UUID acak di localStorage (bukan ID perangkat keras; hapus data browser = HP baru). HP baru otomatis masuk tabel `devices` dengan status `menunggu` dan kode pendek (`XXXX-XXXX`); owner memberi **nama saja** di Pengaturan > Perangkat (= terdaftar). Tidak ada kolom "karyawan" atau "dipakai gantian" di sini, sengaja.
- **HP staf yang belum terdaftar (atau dicabut) terkunci** di layar kunci (`DeviceLockScreen`) sampai owner mendaftarkan. Owner tidak pernah dikunci supaya bisa mendaftarkan HP. Server tidak terjangkau: HP yang tadinya terdaftar tetap jalan (status disimpan di localStorage), selebihnya terkunci. Migrasi 011 belum dijalankan: fitur dilewati, tidak ada yang dikunci.
- `transactions` dan `expenses` punya `device_id` + `device_name` (salinan nama saat dicatat, diisi trigger `stamp_perangkat`; tanpa FK). Klien mengirim `device_id` lewat `deviceStamp()` / `deviceRpcArg()` (RPC `catat_potongan` menerima `p_device_id`) hanya setelah tabel `devices` terbukti ada.
- **Kunci di server** = `app_settings.device_enforce` (bawaan `false`): kalau `true`, trigger menolak insert dari HP yang belum terdaftar. Jangan dinyalakan sebelum semua HP (termasuk HP owner) diberi nama. Ini jejak audit, bukan keamanan data (RLS tetap longgar).
- Riwayat (owner): tombol bulat Perangkat di samping pencarian (`FilterBar` props `deviceOptions`/`deviceValue`/`onDeviceChange`; tiga chip tidak berubah), pencarian ikut mencocokkan nama perangkat, Detail menampilkan "Dicatat dari". Pengeluaran: hanya Detail.

**Rincian Tambahan (Ongkir / Potong Ayam)** (migrasi `012_tambahan_detail.sql`; `src/features/payroll/additionDetail.js`, `AdditionDetailEditor.jsx`, `AdjustmentFields.jsx`, `src/features/settings/CutPriceSettings.jsx`):
- Kategori Tambahan bernama "Ongkir" atau "Potong Ayam" (cocok nama, tanpa peduli huruf besar/kecil) punya opsi "Tambahkan detail". Ongkir = baris nama customer + jumlah. Potong Ayam = baris jenis (Bld/Sayap/Karkas/Lainnya) + jumlah + harga; "Lainnya" memakai nama dan harga bebas. Nominal Tambahan = total rincian (kolom nominal terkunci); keterangan kosong = otomatis ("Ongkir (2 customer)" / "Potong Ayam (16 kg)"). Satuan jumlah Potong Ayam = **kg** (`CUT_UNIT` di `additionDetail.js`, permintaan pemilik 21 Okt 2026) dan jumlahnya boleh **desimal** (mis. 2,5; koma atau titik, maksimal 3 angka di belakang koma; `dec` / `fmtQty`): upah satu baris = round(jumlah × harga), uang tetap integer rupiah; catatan lama berketerangan "(… potong)" tetap dikenali sebagai otomatis (`isAutoDetailLabel`).
- Disimpan di `payroll_additions.detail` (jsonb `{ kind, rows }`). Harga disalin ke tiap baris, jadi mengubah harga di Pengaturan > Harga Potong Ayam (`app_settings.potong_ayam_prices`, bawaan Bld/Sayap/Karkas Rp 3.000) tidak mengubah catatan lama. Kolom `detail` hanya dikirim bila ada rincian, jadi Tambahan biasa tetap jalan walau migrasi 012 belum dijalankan.
- Tampil: kartu persetujuan owner (langsung terbuka), Rincian Harian (baris bisa diketuk), dan lampiran PDF. Slip PDF tetap ringkas; halaman lampiran (setelah tanda tangan) hanya ikut bila dicentang di sheet Bagikan, dan centangnya hanya muncul kalau periode itu punya rincian. Total di lampiran tanpa jumlah customer/potong.

**Laporan Gaji** (`src/features/payroll/PayrollReport.jsx`; periode **Mingguan dan Bulanan** memakai tampilan yang SAMA, tanpa tab Ringkas/Detail): Gaji Bersih di atas, lalu bagian yang dibuka satu per satu:
**Total Pendapatan**, **Pengurangan** (Kasbon, Potongan), **Saldo Awal Bulan** (khusus bulanan), dan **Rincian Harian**. Judul bagian hanya nama + nilai (tanpa teks abu-abu rincian).
- **Rincian Harian** = tabel *Keterangan | Pemasukan (+) | Pengeluaran (-)* per tanggal, dengan jam masuk s/d pulang (dibaca dari log absensi; periode tertutup tidak membaca absensi, jadi jam tidak tampil).
  Tiap hari hadir: Upah Jam Kerja, Uang Lembur, Bonus Full Time; Kasbon/Potongan/Tambahan tampil di tanggalnya (Potongan: ubah/hapus; Tambahan: hapus).
  **Lembur ditutup PER HARI** (keputusan pemilik): blok = floor(menit lembur hari itu / 30), sisa menit hari itu hangus dan tidak dibawa ke hari lain (`overtimeBlocks` per hari di `payrollEngine.js`; Rincian Harian menampilkan blok hari itu).
  Upah per hari hanyalah **pembagian dari total periode** (pembulatan tetap per periode, `allocateProportional` di `payrollReport.js`). `allocateBlocks` hanya dipakai untuk periode tertutup lama yang dibekukan dengan aturan total periode.
- **Saldo awal bulan** disimpan bertanda di `payroll_opening_balances.amount`: positif = karyawan berutang ke toko (mengurangi gaji), negatif = toko berutang / kurang bayar (menambah gaji). Formulir memakai **jenis eksplisit**
  (Toko berutang / Karyawan berutang) + nominal positif, tanpa tanda minus (`openingToForm` / `openingFromForm`); nominal tanpa jenis ditolak. Toko berutang tampil sebagai "Sisa Bulan Lalu (Kurang Bayar)" di **Pendapatan**;
  karyawan berutang tampil sebagai "Hutang Bulan Lalu (Karyawan)" di **Potongan**. Rumus engine tidak berubah: Gaji Bersih = Total Pendapatan - Total Potongan.
- Susunan data ada di `payrollReport.js` (dites) dan dipakai tampilan DAN slip PDF, jadi angkanya selalu sama; tidak ada hitungan gaji baru di sana.
- **Bagikan PDF**: `payslipPdf.js` membuat slip di perangkat (tanpa library tambahan; format: judul, info 2 kolom, tabel harian opsional, Pendapatan > Total Pendapatan > Potongan > Total Potongan > Gaji Bersih, tanda tangan),
  dibagikan lewat menu share HP (`src/lib/shareFile.js`; tanpa menu share = diunduh). "Hari Kerja Masuk" ditulis `hadir/jumlah hari periode` (mis. 25/31). Tarif dan posisi diambil dari karyawan (periode tertutup: tarif beku di `rates_json`).
