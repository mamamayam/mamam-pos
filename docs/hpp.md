# HPP (halaman `/hpp`)

Penghitung modal (HPP) menu: **bahan baku -> resep -> menu**. Tujuannya mudah mengganti harga bahan dan
langsung melihat menu mana yang modalnya berubah, tanpa membaca daftar panjang.

## Memasang (sekali)

Semua di Supabase Dashboard -> **SQL Editor** project C (project `mamam-kasir`).

1. Jalankan `supabase/migrations/013_hpp.sql` (tabel, trigger riwayat harga, RPC, RLS). Aman diulang.
2. Jalankan `supabase/migrations/014_hpp_data_awal.sql` (data awal dari file harga 27/11/2025). Aman diulang:
   memakai ID tetap dan `ON CONFLICT DO NOTHING`, jadi tidak menimpa harga yang sudah Anda ubah.
3. Daftarkan akun admin HPP. Pilih salah satu:
   - **Akun baru khusus HPP** (disarankan, password bisa kuat): Authentication -> Users -> Add user (centang
     Auto Confirm User).
   - **Akun owner POS yang sudah ada**: password-nya `mamam:` + PIN. Di layar login HPP cukup ketik PIN 4 digit.

   Lalu jalankan (ganti email):
   ```sql
   insert into hpp_admin (user_id)
   select id from auth.users where lower(email) = lower('EMAIL-AKUN@contoh.com')
   on conflict do nothing;
   ```
4. Buka `https://<domain>/hpp` (atau tombol **HPP** di menu Lainnya, khusus owner) dan masuk.

Variabel `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY` sama dengan yang dipakai POS.

## Keamanan

- Tabel HPP **tidak** memakai tingkat "Longgar" seperti tabel POS. Role `anon` dicabut, dan role `authenticated`
  hanya boleh jika akunnya ada di `hpp_admin`. Akun staf POS yang sudah login tetap tidak bisa membaca HPP.
- `hpp_admin` tidak bisa dibaca lewat API; pemeriksaan lewat fungsi `hpp_is_admin()`.
- Riwayat harga (`hpp_harga_riwayat`) hanya ditambah oleh trigger saat harga bahan berubah. Tidak bisa diubah
  atau dihapus lewat API, seperti riwayat transaksi. Salah ketik diperbaiki dengan memasukkan harga yang benar.
- Tidak ada data HPP di file JavaScript aplikasi. Data hanya dimuat setelah login.

## Cara kerja hitungan

| Hal | Aturan |
|---|---|
| Harga per unit dasar bahan | `harga / isi` (isi = jumlah unit dasar dalam satu satuan beli, mis. 1 kg = 1000 gr) |
| Baris resep (bahan) | `qty x harga per unit dasar` |
| Baris resep (resep lain) | resep batch (punya `hasil_qty`): `qty / hasil_qty x total resep itu`; resep per porsi: `qty x total` |
| HPP menu | jumlah komponen saja (`biaya_lain` tidak dihitung) |
| Margin | `(harga jual outlet - HPP) / harga jual outlet` |
| Kategori | HIGH jika margin >= batas atas, LOW jika < batas bawah, selain itu SEDANG (Pengaturan). Dua batas sama = hanya HIGH/LOW |
| Harga online | harga outlet x (1 + markup), markup di Pengaturan (awal 25%) |

Bahan tanpa harga dihitung 0 dan menu yang memakainya diberi peringatan.

## Navigasi dan popup

- **Back** (tombol Back HP, browser, atau geser mundur) menutup lapisan teratas: popup dulu, lalu tab **Resep** atau **Menu**
  kembali ke **Bahan baku** (tab awal). Dari Bahan baku, Back pertama memunculkan notif **"Ketuk lagi untuk keluar"** (teks, bentuk, dan posisi sama dengan `ExitToast` app utama); Back kedua
  dalam 2 detik meninggalkan HPP (kembali ke POS). Cara kerjanya sama dengan "Ketuk lagi untuk keluar" di Beranda POS.
  Mesinnya `createBackStack` yang sama dengan POS, instance sendiri (`src/hpp/hppBackStack.js`).
- Alamat mengikuti tab (`/hpp` = Bahan baku, `/hpp/resep`, `/hpp/menu`) lewat `replaceState`, jadi refresh dan link langsung tetap jalan. Alamat lama `/hpp/bahan` tetap membuka Bahan baku.
- **Popup** memakai kerangka yang sama dengan app utama (`components/ui/Overlay`): lembar putih naik dari bawah di HP
  (laptop: dialog di tengah), ada handle bar dan tombol X bulat, dan bisa **ditarik ke bawah** untuk menutup.
  Menutup lewat X, tarik ke bawah, ketuk latar, Esc, atau Back.

## Tampilan daftar

Judul **Daftar HPP** dengan ringkasan (margin rata-rata menu yang sudah berkomposisi dan jumlah menu LOW), lalu bilah tab +
pencarian yang **menempel** saat daftar digulir. Tiga tab: **Bahan baku** (tab awal), **Resep**, **Menu**, masing-masing dengan
jumlahnya. Satu kotak cari dipakai tab yang sedang tampil. Di semua tab:

- Kategori (grup untuk Resep) **menguncup** di awal; ketuk judulnya untuk membuka. Pencarian membuka semua yang cocok.
- Ketuk satu baris untuk membuka **detail**: riwayat (grafik kecil + 3 perubahan terakhir, **Lihat semua** untuk sisanya;
  riwayat harga bahan ditulis dengan satuan belinya, mis. Rp 38.000/kg), dan untuk resep/menu juga komposisi dan angka ringkas.
  Baris resep dan menu juga punya chip perubahan modal terakhir. Tombol di dalamnya membuka form:
  **Update harga** (bahan), **Edit** (resep dan menu).
- Angka rupiah ditulis dengan spasi: `Rp 1.730`.

## Form Update harga / Edit resep / Edit menu

Ketiganya **form draft**: perubahan baru tersimpan saat **Simpan** ditekan, **Batal** (atau tutup popup) membuang. Simpan nonaktif
selama belum ada perubahan atau ada isian yang tidak valid. Pratinjau di bawah form menunjukkan angka lama → baru.

- **Update harga** (bahan): nama dan harga per satuan beli dengan tombol − / + (langkah Rp500) atau ketik langsung. Satuan beli, satuan pembagi (unit
  dasar), isi per satuan, dan kategori (dropdown) ada di balik tombol **Ubah**. Pilihan satuan beli dan satuan pembagi diatur di **Pengaturan HPP**
  (kartu Satuan beli / Satuan pembagi: tambah atau hapus; disimpan di `hpp_setting` kunci `satuan_beli` dan `satuan_dasar`, tanpa migrasi; satuan yang
  masih dipakai bahan tidak bisa dihapus). Mengganti satuan pembagi tidak mengonversi takaran resep/menu (angkanya tetap), jadi form memberi peringatan. Pratinjau menunjukkan harga per unit dasar (mis. Rp 38.000/kg ÷ 1.000 gr = Rp 38/gr).
  Riwayat harga tetap per satuan beli, jadi setelah satuan diganti bandingkan perubahannya per unit dasar. Tidak ada kolom catatan
  dan tombol persentase.
- **Edit resep**: nama, hasil per batch (hanya resep batch), dan komposisi. Berlaku untuk **semua menu** yang memakai resep itu.
- **Edit menu**: nama, kategori (dropdown), harga jual, dan komposisi. Pratinjau memuat
  modal, margin (HIGH/SEDANG/LOW), profit, harga online, dan saran harga jual minimal bila belum HIGH.
- **Komposisi** (resep dan menu): takaran dengan tombol − / + (gr dan ml per 5, satuan lain per 1) atau ketik, tombol × untuk
  menghapus, dan **Tambah komponen** (pilih bahan atau resep, takaran awal 10 gr/ml atau 1). Resep tidak bisa memuat dirinya sendiri,
  langsung maupun lewat resep lain.
- **Menu terdampak**: tombol "Lihat menu terdampak" di form Update harga dan Edit resep sebelum simpan, dan notifikasi
  "Tersimpan · N menu terdampak" (tombol **Lihat**) sesudahnya. Isinya menu per kategori dengan modal sebelum → sesudah, persen, dan margin.
  Edit menu cukup notifikasi "Tersimpan".
- **Riwayat modal** resep dan menu tidak disimpan: dihitung ulang dari riwayat harga bahan yang dipakainya.

## Hasil migrasi dari file 27/11/2025

Dimigrasikan: **101 bahan** (94 di daftar + 7 yang hanya ada di sheet HPP), **37 resep**, **54 menu**,
5 kategori bahan, 7 kategori menu. Daftar kontak pelanggan di PDF tidak dipakai dan tidak disimpan.

- **HPP ke-54 menu sama persis dengan file** saat migrasi. Selisih antara HPP file dan komponen yang bisa
  diuraikan disimpan di kolom `biaya_lain`. **Sejak 2 Nov 2026 kolom ini TIDAK dihitung lagi** (permintaan pemilik: modal menu hanya dari komponen): tidak masuk HPP, tidak tampil di UI. Kolomnya dibiarkan di database sebagai catatan; menu yang modalnya dulu hanya dari `biaya_lain` kini tampil "Belum diisi" sampai komposisinya diisi. Bersihkan nilainya lewat SQL kalau mau: `update hpp_menu set biaya_lain = 0;` (`hpp_file` tetap menyimpan angka aslinya).
- **Komposisi menu adalah perkiraan awal**: protein (Mamam Chicken / Wingers / Classic Chicken) + Nasi +
  Topping sesuai nama menu; Twins = 0,5 porsi Wingers. File tidak memuat rincian bahan per menu. Koreksi lewat SQL
  (contoh di bawah) kalau berbeda dengan praktik di dapur.
- Menu "Menu lain" nomor 3 sampai 5 (tanpa nama, HPP 0) tidak dimigrasikan.
- Harga bahan mengikuti **daftar bahan** (sumber tunggal). Beberapa resep di sheet HPP memakai harga yang berbeda,
  jadi total resepnya bergeser sedikit. HPP menu ikut bergeser karena modal kini hanya dari komponen (`biaya_lain` tidak dihitung).

| Resep | Di sheet | Di app | Penyebab |
|---|---|---|---|
| Tepung bumbu | Rp12.900 | Rp13.400 | Terigu di sheet Rp8.500, di daftar Rp9.000 |
| Mamam Chicken / Wingers | Rp8.629 / Rp9.839 | Rp8.669 / Rp9.879 | turunan Tepung bumbu |
| Classic Chicken | Rp7.406 | Rp7.396 | Minyak di sheet Rp44.000, di daftar Rp42.000; plus turunan Tepung bumbu |
| Packaging minuman | Rp715 | Rp765 | Sedotan: sheet isi 150, daftar isi 100 |
| Sambal Geprek | Rp64.860 | Rp65.397 | Total di sheet tidak menjumlah baris Gas (Rp537) |

Hal lain dari sheet yang perlu Anda ketahui: baris "Upah Produksi" resep Wingers kosong di sheet (harga `--`),
jadi tidak dimasukkan; "Sayap" resep Wingers memakai Rp35.000 per 10 pcs (daftar bahan: Rp40.000 per kg) sehingga
dibuat bahan terpisah "Sayap (10 pcs)"; "Chicken" Classic (Rp42.000 per 10 pcs), "Nasi (beras)", "Bawang Putih
Cincang Minyak", "Saos Sachet Mamam", dan "Garam & Oregano (paket)" hanya ada di sheet HPP.

## Mengubah komposisi modal

Tekan **Edit** di detail menu atau resep, ubah takaran / hapus / tambah komponen, lalu **Simpan** (lihat bagian form di atas).
Menyimpan menghapus baris yang dibuang, mengubah takaran yang berubah, dan menambah baris baru, lalu memuat ulang data.

## Menambah bahan, resep, dan menu baru

Di tiap tab ada tombol **+** di sebelah kotak cari (Bahan baku, Resep, Menu). Formnya sama dengan form Update harga / Edit resep / Edit menu,
hanya mulai dari kosong, dan tetap draft + Simpan/Batal:

- **Bahan baru**: nama, harga per satuan beli (boleh dikosongkan dulu, tampil "Belum diisi"), satuan beli, satuan pembagi, isi, kategori (opsional).
  Harga awal tercatat otomatis oleh trigger di riwayat harga (catatan "Harga awal").
- **Resep baru**: nama, jenis **Per porsi** atau **Per batch** (hasil + satuan), grup (pilih yang ada atau ketik grup baru), lalu komposisi.
- **Menu baru**: nama, kategori (boleh kosong, masuk "Lainnya"), harga jual, komposisi. Komposisi bisa disusun lewat **Salin dari menu lain**.

Aturan: nama kembar ditolak (bahan dan resep: nama unik; menu: unik dalam satu kategori). Komposisi resep/menu boleh diisi nanti lewat Edit;
yang kosong tampil "Belum diisi". Resep/menu dibuat dulu, baru komponennya; kalau penyimpanan komponen gagal, induknya dihapus lagi (`buatDenganItems` di `useHpp.js`)
supaya tidak ada resep/menu setengah jadi. Tidak perlu migrasi: kebijakan RLS `hpp_admin_all_*` sudah mengizinkan insert untuk admin HPP.

Menghapus bahan/resep/menu belum ada di UI (fungsi `hapusResep` / `hapusMenu` di `hppRepo.js` hanya dipakai untuk membatalkan pembuatan yang gagal).
