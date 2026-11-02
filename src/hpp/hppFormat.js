/** Format angka untuk halaman HPP (locale id-ID). Tanpa dependensi. */
export function rupiah(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  const v = Math.round(n);
  return `${v < 0 ? '-' : ''}Rp ${Math.abs(v).toLocaleString('id-ID')}`;
}

/** Angka biasa, maksimal 2 desimal, koma Indonesia: 1410.5 -> "1.410,5". */
export function angka(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return n.toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

export function persen(n, digit = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  return `${n.toLocaleString('id-ID', { minimumFractionDigits: digit, maximumFractionDigits: digit })}%`;
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
/** "2026-10-05T..." -> "5 Okt 2026". Tahun disembunyikan kalau sama dengan tahun `sekarang`. */
export function tanggal(iso, sekarang = new Date()) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const base = `${d.getDate()} ${BULAN[d.getMonth()]}`;
  return d.getFullYear() === sekarang.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** Ubah isian pengguna ("45.000", "45000", "45,5") jadi angka; null kalau tidak valid / negatif. */
export function parseAngka(teks) {
  const s = String(teks ?? '').trim().replace(/\s/g, '');
  if (!s) return null;
  const bersih = /,/.test(s) ? s.replace(/\./g, '').replace(',', '.') : (/^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, '') : s);
  const v = Number(bersih);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

/**
 * Harga per unit dasar (mis. per gr) yang sering kecil: Rp 1,5 / Rp 38,5 / Rp 1.250. Mulai Rp100 dibulatkan seperti `rupiah`;
 * di bawah itu dipertahankan 1 desimal (Rp10 ke atas) atau 2 desimal (di bawah Rp10), supaya Rp 1,5 tidak tampil sebagai Rp 2.
 */
export function rupiahUnit(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '-';
  if (Math.abs(n) >= 100) return rupiah(n);
  return `Rp ${n.toLocaleString('id-ID', { maximumFractionDigits: Math.abs(n) >= 10 ? 1 : 2 })}`;
}

/** Satuan beli untuk tampilan: "kg (1.000 gr)"; kalau satuan = unit dasar dan isi 1 cukup unitnya ("pack"). */
export function labelSatuan(b) {
  return b.satuan === b.unit && b.isi === 1 ? b.unit : `${b.satuan} (${angka(b.isi)} ${b.unit})`;
}

/** Judul ringkas perubahan bahan: "Ayam: Rp 38 → Rp 40/gr" (per unit dasar, lewat `rupiahUnit`). Bahan yang belum berharga: "Ayam: harga Rp 40/gr". */
export function ringkasUbahBahan(b, harga, isi) {
  const baru = harga / isi;
  const lama = b.harga === null ? null : b.harga / b.isi;
  return lama === null ? `${b.nama}: harga ${rupiahUnit(baru)}/${b.unit}` : `${b.nama}: ${rupiahUnit(lama)} → ${rupiahUnit(baru)}/${b.unit}`;
}

/** Judul ringkas perubahan resep: "Saos: Rp 2 → Rp 3/gr" (per unit hasil; resep per porsi = per porsi). */
export function ringkasUbahResep(nama, lama, baru, unit) {
  return `${nama}: ${rupiahUnit(lama)} → ${rupiahUnit(baru)}/${unit}`;
}
