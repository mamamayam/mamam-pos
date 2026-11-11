import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { bisaTambahSub, buildModel, namaSudahDipakai, rapikanSatuan, urutanBerikut } from './hppModel';
import * as repo from './hppRepo';

const KOSONG = { kategori: [], bahan: [], riwayat: [], resep: [], resepItem: [], menu: [], menuItem: [], setting: [] };

/**
 * Samakan baris komposisi di database dengan `baru` (urut tampil): baris lama yang tidak ada lagi dihapus,
 * takaran yang berubah diubah, baris tanpa id ditambah di urutan paling akhir. Berurutan (hapus dulu, supaya aman
 * terhadap batas unik); lempar galat pertama.
 */
export async function terapkanItems(lama, baru, { hapus, ubah, tambah }) {
  const ada = new Set(baru.filter((i) => i.id).map((i) => i.id));
  for (const l of lama) if (!ada.has(l.id)) await hapus(l.id);
  const lamaPerId = new Map(lama.map((l) => [l.id, l]));
  let urutan = Math.max(0, ...lama.map((l) => l.urutan));
  for (const it of baru) {
    if (it.id) {
      const l = lamaPerId.get(it.id);
      if (l && l.qty !== it.qty) await ubah(it.id, it.qty);
    } else {
      urutan += 1;
      await tambah(it, urutan);
    }
  }
}

/**
 * Buat induk baru (resep / menu) lalu baris komposisinya satu per satu (urutan 1, 2, ...). Kalau ada baris yang gagal, induk yang
 * baru dibuat dihapus lagi (`batalkan`; baris yang sudah masuk ikut terhapus lewat cascade) supaya tidak tertinggal resep/menu
 * setengah jadi. Melempar galat pertama (galat pembatalan sendiri diabaikan: data dimuat ulang dan hasilnya terlihat di daftar).
 * Mengembalikan baris induk yang dibuat.
 */
export async function buatDenganItems({ buat, tambahItem, batalkan, items }) {
  const induk = await buat();
  try {
    let urutan = 0;
    for (const it of items) { urutan += 1; await tambahItem(induk, it, urutan); }
  } catch (e) {
    try { await batalkan(induk); } catch { /* abaikan */ }
    throw e;
  }
  return induk;
}

/**
 * State data HPP + semua aksi ubah data. `db` = klien Supabase (atau palsu saat tes).
 * Perubahan harga menunggu database menyimpan dulu (jangan tampilkan angka yang belum tersimpan).
 * Edit lewat form (bahan, resep, menu) disimpan sekaligus saat Simpan; setelah resep/menu tersimpan data dimuat ulang
 * supaya id baris baru ikut. Perubahan Pengaturan (kategori, margin) langsung tampil lalu disimpan; kalau gagal, data dimuat ulang.
 */
export function useHpp(db) {
  const [raw, setRaw] = useState(KOSONG);
  const [status, setStatus] = useState('loading');   // loading | ready | error
  const [galat, setGalat] = useState(null);          // { pesan, setup }
  const [pesan, setPesan] = useState('');            // pesan kesalahan singkat setelah aksi
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const muat = useCallback(async () => {
    try {
      const data = await repo.loadAll(db);
      if (!mounted.current) return;
      setRaw(data); setStatus('ready'); setGalat(null);
    } catch (e) {
      if (!mounted.current) return;
      setGalat(repo.explainError(e.cause || e)); setStatus('error');
    }
  }, [db]);
  useEffect(() => { muat(); }, [muat]);

  const model = useMemo(() => buildModel(raw), [raw]);
  const patch = (fn) => setRaw((r) => fn(r));
  const gagal = (e) => { setPesan(e.message || 'Gagal menyimpan'); muat(); };
  const update = (tabel, id, kolom) => patch((r) => ({ ...r, [tabel]: r[tabel].map((x) => (x.id === id ? { ...x, ...kolom } : x)) }));

  const actions = {
    reload: muat,
    tutupPesan: () => setPesan(''),

    /** Ubah harga bahan (RPC: riwayat dicatat). Dipakai simpanBahan. */
    async ubahHarga({ bahanId, harga, catatan = '', sumber = 'manual' }) {
      const b = raw.bahan.find((x) => x.id === bahanId);
      if (!b || harga === null || Number.isNaN(harga) || harga < 0) return false;
      if (b.harga !== null && Number(b.harga) === harga) return false;
      try {
        await repo.ubahHarga(db, { bahanId, harga, catatan, sumber });
      } catch (e) { setPesan(e.message); return false; }
      const sebelum = b.harga === null ? null : Number(b.harga);
      setRaw((r) => ({
        ...r,
        bahan: r.bahan.map((x) => (x.id === bahanId ? { ...x, harga } : x)),
        riwayat: [{ id: `lokal-${Date.now()}`, bahan_id: bahanId, harga, harga_sebelum: sebelum, catatan: catatan || '', sumber, dibuat_pada: new Date().toISOString() }, ...r.riwayat],
      }));
      return true;
    },

    /**
     * Simpan form "Update harga": nama, satuan beli, isi, kategori (satu update) lalu harga (RPC, riwayat dicatat trigger).
     * false = tidak ada yang tersimpan atau gagal (pesan galat sudah ditampilkan).
     */
    async simpanBahan(bahanId, { nama, harga, satuan, isi, kategoriId, unit }) {
      const b = raw.bahan.find((x) => x.id === bahanId);
      const n = String(nama || '').trim();
      const s = String(satuan || '').trim();
      const u = unit === undefined ? b?.unit_dasar : String(unit || '').trim();
      if (!b || !n || !s || !u || !(isi > 0) || harga === null || Number.isNaN(harga) || harga < 0) return false;
      const kolom = {};
      if (n !== b.nama) kolom.nama = n;
      if (s !== b.satuan) kolom.satuan = s;
      if (Number(b.isi) !== isi) kolom.isi = isi;
      if (u !== b.unit_dasar) kolom.unit_dasar = u;
      if (kategoriId && kategoriId !== b.kategori_id) kolom.kategori_id = kategoriId;
      const hargaBerubah = b.harga === null || Number(b.harga) !== harga;
      if (!Object.keys(kolom).length && !hargaBerubah) return false;
      if (Object.keys(kolom).length) {
        try { await repo.ubahBahan(db, bahanId, kolom); } catch (e) { setPesan(e.message); return false; }
        update('bahan', bahanId, kolom);
      }
      if (hargaBerubah) return actions.ubahHarga({ bahanId, harga, sumber: 'manual' });
      return true;
    },

    /**
     * Simpan form "Edit resep": nama, hasil per batch (hanya resep batch), dan isinya.
     * items = [{ id (null = baru), bahanId, subResepId, qty }] urut tampil. Baris yang hilang dihapus, takaran yang berubah
     * diubah, baris baru ditambah. Berlaku untuk semua menu pemakai resep. Sub-resep yang membuat lingkaran ditolak.
     */
    async simpanResep(resepId, { nama, hasilQty, items }) {
      const r = model.resep[resepId];
      const n = String(nama || '').trim();
      if (!r || !n || (r.hasilQty !== null && !(hasilQty > 0)) || items.some((i) => !(i.qty > 0))) return false;
      if (items.some((i) => i.subResepId && !bisaTambahSub(model, resepId, i.subResepId))) {
        setPesan('Resep tidak bisa memuat dirinya sendiri (langsung atau lewat resep lain).');
        return false;
      }
      const kolom = {};
      if (n !== r.nama) kolom.nama = n;
      if (r.hasilQty !== null && hasilQty !== r.hasilQty) kolom.hasil_qty = hasilQty;
      try {
        if (Object.keys(kolom).length) await repo.ubahResep(db, resepId, kolom);
        await terapkanItems(r.items, items, {
          hapus: (id) => repo.hapusResepItem(db, id),
          ubah: (id, qty) => repo.ubahResepItem(db, id, { qty }),
          tambah: (it, urutan) => repo.tambahResepItem(db, { resepId, urutan, bahanId: it.bahanId, subResepId: it.subResepId, qty: it.qty }),
        });
      } catch (e) { setPesan(e.message); await muat(); return false; }
      await muat();
      return true;
    },

    /** Simpan form "Edit menu": nama, kategori, harga jual, dan komposisi (items = [{ id, bahanId, resepId, qty }]). Kolom biaya_lain tidak dihitung dan tidak disentuh. */
    async simpanMenu(menuId, { nama, kategoriId, hargaOutlet, items }) {
      const m = model.menu.find((x) => x.id === menuId);
      const n = String(nama || '').trim();
      if (!m || !n || !(hargaOutlet > 0) || items.some((i) => !(i.qty > 0))) return false;
      const kolom = {};
      if (n !== m.nama) kolom.nama = n;
      if (kategoriId && kategoriId !== m.kategoriId) kolom.kategori_id = kategoriId;
      if (hargaOutlet !== m.hargaOutlet) kolom.harga_outlet = hargaOutlet;
      try {
        if (Object.keys(kolom).length) await repo.ubahMenu(db, menuId, kolom);
        await terapkanItems(m.items, items, {
          hapus: (id) => repo.hapusMenuItem(db, id),
          ubah: (id, qty) => repo.ubahMenuItem(db, id, { qty }),
          tambah: (it, urutan) => repo.tambahMenuItem(db, { menuId, urutan, bahanId: it.bahanId, resepId: it.resepId, qty: it.qty }),
        });
      } catch (e) { setPesan(e.message); await muat(); return false; }
      await muat();
      return true;
    },

    /**
     * Bahan BARU. harga boleh null (muncul "Belum diisi" sampai diisi dari Update harga). Nama kembar ditolak.
     * Setelah tersimpan data dimuat ulang (id baru dan riwayat harga awal dari trigger ikut). false = tidak tersimpan (pesan sudah tampil).
     */
    async buatBahan({ nama, harga = null, satuan, isi, unit, kategoriId = null }) {
      const n = String(nama || '').trim();
      const s = String(satuan || '').trim();
      const u = String(unit || '').trim();
      if (!n || !s || !u || !(isi > 0) || (harga !== null && (Number.isNaN(harga) || harga < 0))) return false;
      if (namaSudahDipakai(raw.bahan.map((b) => b.nama), n)) { setPesan('Nama itu sudah dipakai.'); return false; }
      try {
        await repo.tambahBahan(db, { nama: n, kategoriId: kategoriId || null, satuan: s, isi, unit: u, harga });
      } catch (e) { setPesan(e.message); return false; }
      await muat();
      return true;
    },

    /**
     * Resep BARU: hasilQty null = resep per porsi, angka = resep batch (hasilUnit wajib). items = [{ bahanId, subResepId, qty }].
     * Resep dan isinya disimpan berurutan; kalau ada isi yang gagal, resepnya dibatalkan lagi (buatDenganItems).
     */
    async buatResep({ nama, grup, hasilQty = null, hasilUnit = null, items }) {
      const n = String(nama || '').trim();
      const g = String(grup || '').trim() || 'Resep';
      const batch = hasilQty !== null;
      const unit = String(hasilUnit || '').trim();
      if (!n || (batch && (!(hasilQty > 0) || !unit)) || items.some((i) => !(i.qty > 0))) return false;
      if (namaSudahDipakai(Object.values(model.resep).map((r) => r.nama), n)) { setPesan('Nama itu sudah dipakai.'); return false; }
      try {
        await buatDenganItems({
          items,
          buat: () => repo.tambahResep(db, { nama: n, grup: g, hasilQty: batch ? hasilQty : null, hasilUnit: batch ? unit : null, urutan: urutanBerikut(Object.values(model.resep)) }),
          tambahItem: (resep, it, urutan) => repo.tambahResepItem(db, { resepId: resep.id, urutan, bahanId: it.bahanId, subResepId: it.subResepId, qty: it.qty }),
          batalkan: (resep) => repo.hapusResep(db, resep.id),
        });
      } catch (e) { setPesan(e.message); await muat(); return false; }
      await muat();
      return true;
    },

    /** Menu BARU: nama, kategori (boleh kosong = "Lainnya"), harga jual, dan komposisi (items = [{ bahanId, resepId, qty }], boleh kosong). Nama kembar dalam kategori yang sama ditolak. */
    async buatMenu({ nama, kategoriId = null, hargaOutlet, items }) {
      const n = String(nama || '').trim();
      if (!n || !(hargaOutlet > 0) || items.some((i) => !(i.qty > 0))) return false;
      if (namaSudahDipakai(model.menu.filter((m) => (m.kategoriId ?? null) === (kategoriId || null)).map((m) => m.nama), n)) { setPesan('Nama itu sudah dipakai.'); return false; }
      try {
        await buatDenganItems({
          items,
          buat: () => repo.tambahMenu(db, { nama: n, kategoriId: kategoriId || null, hargaOutlet, urutan: urutanBerikut(model.menu) }),
          tambahItem: (menu, it, urutan) => repo.tambahMenuItem(db, { menuId: menu.id, urutan, bahanId: it.bahanId, resepId: it.resepId, qty: it.qty }),
          batalkan: (menu) => repo.hapusMenu(db, menu.id),
        });
      } catch (e) { setPesan(e.message); await muat(); return false; }
      await muat();
      return true;
    },

    async jadikanAcuan() {
      try { await repo.setAcuan(db); } catch (e) { setPesan(e.message); return; }
      patch((r) => ({ ...r, bahan: r.bahan.map((x) => ({ ...x, harga_acuan: x.harga })) }));
    },

    async tambahKategori(jenis, nama) {
      const n = String(nama || '').trim();
      if (!n) return;
      const urutan = Math.max(0, ...raw.kategori.filter((k) => k.jenis === jenis).map((k) => Number(k.urutan))) + 1;
      try {
        const baru = await repo.tambahKategori(db, { jenis, nama: n, urutan });
        patch((r) => ({ ...r, kategori: [...r.kategori, baru] }));
      } catch (e) { setPesan(e.message); }
    },
    async ubahNamaKategori(id, nama) {
      const n = String(nama || '').trim();
      if (!n) return;
      try {
        await repo.ubahKategori(db, id, { nama: n });
        update('kategori', id, { nama: n });
      } catch (e) { setPesan(e.message); muat(); }
    },
    async hapusKategori(id) {
      try {
        await repo.hapusKategori(db, id);
        patch((r) => ({ ...r, kategori: r.kategori.filter((k) => k.id !== id) }));
      } catch (e) { setPesan(e.message); }
    },
    /** Tukar urutan dua kategori sejenis. */
    async tukarKategori(idA, idB) {
      const a = raw.kategori.find((k) => k.id === idA); const b = raw.kategori.find((k) => k.id === idB);
      if (!a || !b) return;
      update('kategori', idA, { urutan: b.urutan }); update('kategori', idB, { urutan: a.urutan });
      try {
        await Promise.all([repo.ubahKategori(db, idA, { urutan: b.urutan }), repo.ubahKategori(db, idB, { urutan: a.urutan })]);
      } catch (e) { gagal(e); }
    },

    simpanMargin(margin) {
      const value = { lo: margin.lo, hi: margin.hi };
      patch((r) => ({ ...r, setting: [...r.setting.filter((s) => s.key !== 'margin'), { key: 'margin', value }] }));
      repo.simpanSetting(db, 'margin', value).catch(gagal);
    },
    /** Simpan daftar pilihan satuan di Pengaturan: kunci 'satuan_beli' atau 'satuan_dasar' (daftar teks, sudah dirapikan). */
    simpanSatuan(kunci, daftar) {
      if (kunci !== 'satuan_beli' && kunci !== 'satuan_dasar') return;
      const value = rapikanSatuan(daftar);
      if (!value.length) return;
      patch((r) => ({ ...r, setting: [...r.setting.filter((s) => s.key !== kunci), { key: kunci, value }] }));
      repo.simpanSetting(db, kunci, value).catch(gagal);
    },
    simpanMarkup(markup) {
      patch((r) => ({ ...r, setting: [...r.setting.filter((s) => s.key !== 'online_markup'), { key: 'online_markup', value: markup }] }));
      repo.simpanSetting(db, 'online_markup', markup).catch(gagal);
    },
  };

  return { model, status, galat, pesan, actions, raw };
}
