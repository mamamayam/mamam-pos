/**
 * Akses data HPP ke Supabase. Semua fungsi menerima klien `db` (mudah dites dengan klien palsu).
 * Tabel/fungsi: supabase/migrations/013_hpp.sql. Kalau gagal, melempar Error berpesan Indonesia.
 */
const HALAMAN = 1000;   // batas baris per permintaan PostgREST

export function explainError(err) {
  const msg = String(err?.message || err || '');
  const code = String(err?.code || '');
  if (code === 'PGRST205' || code === '42P01' || /could not find the table|relation .* does not exist/i.test(msg)) {
    return { setup: true, pesan: 'Tabel HPP belum dipasang. Jalankan supabase/migrations/013_hpp.sql lalu 014_hpp_data_awal.sql di Supabase.' };
  }
  if (code === '42501' || /permission denied|row-level security/i.test(msg)) {
    return { setup: false, pesan: 'Akun ini tidak punya akses HPP. Daftarkan di tabel hpp_admin (lihat docs/hpp.md).' };
  }
  if (code === '23505' || /duplicate key/i.test(msg)) return { setup: false, pesan: 'Nama itu sudah dipakai.' };
  if (code === '23503' || /violates foreign key/i.test(msg)) return { setup: false, pesan: 'Masih dipakai data lain, jadi belum bisa dihapus.' };
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return { setup: false, pesan: 'Tidak bisa terhubung ke server. Cek internet lalu coba lagi.' };
  return { setup: false, pesan: msg || 'Terjadi kesalahan.' };
}

function ok(res) {
  if (res.error) { const e = new Error(explainError(res.error).pesan); e.cause = res.error; throw e; }
  return res.data;
}

/** Ambil semua baris sebuah tabel (melewati batas 1000 baris per permintaan). */
async function semua(db, tabel, urutan) {
  const hasil = [];
  for (let dari = 0; ; dari += HALAMAN) {
    let q = db.from(tabel).select('*');
    for (const [kolom, naik] of urutan) q = q.order(kolom, { ascending: naik });
    const rows = ok(await q.range(dari, dari + HALAMAN - 1)) || [];
    hasil.push(...rows);
    if (rows.length < HALAMAN) return hasil;
  }
}

export async function loadAll(db) {
  const [kategori, bahan, riwayat, resep, resepItem, menu, menuItem, setting] = await Promise.all([
    semua(db, 'hpp_kategori', [['urutan', true], ['nama', true]]),
    semua(db, 'hpp_bahan', [['nama', true]]),
    semua(db, 'hpp_harga_riwayat', [['dibuat_pada', false], ['id', true]]),
    semua(db, 'hpp_resep', [['urutan', true], ['nama', true]]),
    semua(db, 'hpp_resep_item', [['resep_id', true], ['urutan', true]]),
    semua(db, 'hpp_menu', [['urutan', true], ['nama', true]]),
    semua(db, 'hpp_menu_item', [['menu_id', true], ['urutan', true]]),
    semua(db, 'hpp_setting', [['key', true]]),
  ]);
  return { kategori, bahan, riwayat, resep, resepItem, menu, menuItem, setting };
}

/** Ubah harga bahan + catat riwayat (satu transaksi di database). */
export async function ubahHarga(db, { bahanId, harga, catatan = '', sumber = 'manual' }) {
  ok(await db.rpc('hpp_ubah_harga', { p_bahan: bahanId, p_harga: harga, p_catatan: catatan || null, p_sumber: sumber }));
}

export async function setAcuan(db) {
  return ok(await db.rpc('hpp_set_acuan'));
}

export async function ubahBahan(db, id, patch) {
  ok(await db.from('hpp_bahan').update(patch).eq('id', id));
}

export async function ubahResep(db, id, patch) {
  ok(await db.from('hpp_resep').update(patch).eq('id', id));
}

export async function ubahMenu(db, id, patch) {
  ok(await db.from('hpp_menu').update(patch).eq('id', id));
}

export async function tambahKategori(db, { jenis, nama, urutan }) {
  const rows = ok(await db.from('hpp_kategori').insert({ jenis, nama, urutan }).select());
  return rows[0];
}

export async function ubahKategori(db, id, patch) {
  ok(await db.from('hpp_kategori').update(patch).eq('id', id));
}

export async function hapusKategori(db, id) {
  ok(await db.from('hpp_kategori').delete().eq('id', id));
}

export async function simpanSetting(db, key, value) {
  ok(await db.from('hpp_setting').upsert({ key, value, diubah_pada: new Date().toISOString() }, { onConflict: 'key' }));
}

/** Komposisi menu: komponen = resep ATAU bahan langsung. */
export async function tambahMenuItem(db, { menuId, urutan, bahanId = null, resepId = null, qty }) {
  const rows = ok(await db.from('hpp_menu_item').insert({ menu_id: menuId, urutan, bahan_id: bahanId, resep_id: resepId, qty }).select());
  return rows[0];
}
export async function ubahMenuItem(db, id, patch) {
  ok(await db.from('hpp_menu_item').update(patch).eq('id', id));
}
export async function hapusMenuItem(db, id) {
  ok(await db.from('hpp_menu_item').delete().eq('id', id));
}

/** Isi resep: bahan ATAU resep lain. Berlaku untuk SEMUA menu yang memakai resep itu. */
export async function tambahResepItem(db, { resepId, urutan, bahanId = null, subResepId = null, qty }) {
  const rows = ok(await db.from('hpp_resep_item').insert({ resep_id: resepId, urutan, bahan_id: bahanId, sub_resep_id: subResepId, qty }).select());
  return rows[0];
}
export async function ubahResepItem(db, id, patch) {
  ok(await db.from('hpp_resep_item').update(patch).eq('id', id));
}
export async function hapusResepItem(db, id) {
  ok(await db.from('hpp_resep_item').delete().eq('id', id));
}
