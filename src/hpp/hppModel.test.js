import { describe, it, expect } from 'vitest';
import { RAW } from './fixture';
import {
  bisaTambahSub, buildModel, ctxAcuan, dampakUbah, dampakUbahResep, draftBerubah, draftDariMenu, draftDariResep, draftValid, hargaMinimal, hargaPada, isiBawaan, kelompokResep, kelompokkan, makeCtx, marginPct,
  itemsMenuDariDraft, itemsResepDariDraft, draftSalinDariMenu, menuSumberSalin, menuBahanKosong, menuInfo, menuParts, modelDenganResep, resepPerUnit, ringkasanDaftar, menusUsingBahan, menusUsingResep, opsiSatuan, pemakaiSatuan, rapikanSatuan, SATUAN_DASAR_UMUM, SATUAN_UMUM, perubahanTerakhir, resepMemuat, resepRows, riwayatBahanRows,
  riwayatModalRows, tierOf, tiersFor,
} from './hppModel';

const model = () => buildModel(RAW);

describe('hitung biaya (angka tangan)', () => {
  it('harga per unit dasar = harga / isi', () => {
    const c = makeCtx(model());
    expect(c.unitCost('A')).toBe(1);
    expect(c.unitCost('B')).toBe(1000);
    expect(c.unitCost('tidak-ada')).toBe(0);
  });

  it('resep batch: total = jumlah baris; dipakai sebagian = qty / hasil * total', () => {
    const c = makeCtx(model());
    expect(c.resepTotal('saos')).toBe(2600);              // 600 gr ayam + 2 kemasan
    expect(c.resepCost('saos', 50)).toBeCloseTo(130);     // 50 dari batch 1000 gr
    expect(c.resepTotal('porsi')).toBeCloseTo(230);       // 130 saos + 100 ayam
  });

  it('HPP menu = jumlah komponen saja (biaya_lain tidak dihitung)', () => {
    const m = model(); const c = makeCtx(m);
    expect(c.menuHpp(m.menu[0])).toBeCloseTo(1730);       // 230 + 1500
    expect(c.menuHpp(m.menu[1])).toBe(1000);
  });

  it('biaya_lain lama di database diabaikan: menu tanpa komponen = Rp 0', () => {
    const f = structuredClone(RAW)
    f.menu[1].biaya_lain = 2544
    f.menuItem = f.menuItem.filter((x) => x.menu_id !== 'm2')
    const m = buildModel(f)
    expect(makeCtx(m).menuHpp(m.menu[1])).toBe(0)
  });

  it('margin dan kategori', () => {
    const m = model(); const c = makeCtx(m);
    const i = menuInfo(m, c, m.menu[0]);
    expect(i.pct).toBeCloseTo(82.7, 1);
    expect(i.profit).toBeCloseTo(8270);
    expect(i.online).toBeCloseTo(12500);
    expect(i.tier).toBe('HIGH');
    expect(menuInfo(m, c, m.menu[1]).tier).toBe('HIGH');   // 50% >= 30
    expect(marginPct(0, 100)).toBe(0);
  });

  it('batas margin: sama = HIGH/LOW; terpisah = ada SEDANG; tepat di batas = HIGH', () => {
    expect(tierOf(30, { lo: 30, hi: 30 })).toBe('HIGH');
    expect(tierOf(29.9, { lo: 30, hi: 30 })).toBe('LOW');
    expect(tierOf(50, { lo: 40, hi: 60 })).toBe('SEDANG');
    expect(tierOf(60, { lo: 40, hi: 60 })).toBe('HIGH');
    expect(tierOf(39.9, { lo: 40, hi: 60 })).toBe('LOW');
    expect(tiersFor({ lo: 30, hi: 30 })).toEqual(['LOW', 'HIGH']);
    expect(tiersFor({ lo: 25, hi: 30 })).toEqual(['LOW', 'SEDANG', 'HIGH']);
  });

  it('batas margin tersimpan dipakai model; lo > hi dirapikan', () => {
    const m = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 50, hi: 40 } }] });
    expect(m.margin).toEqual({ lo: 40, hi: 40 });
    expect(buildModel({ ...RAW, setting: [] }).margin).toEqual({ lo: 30, hi: 30 });
    expect(buildModel({ ...RAW, setting: [] }).markup).toBe(1.25);
  });

  it('hargaMinimal dibulatkan ke atas kelipatan 500; masukan tak valid = 0', () => {
    expect(hargaMinimal(1730, 30)).toBe(2500);
    expect(hargaMinimal(14153, 30)).toBe(20500);
    expect(hargaMinimal(0, 30)).toBe(0);
    expect(hargaMinimal(1000, 100)).toBe(0);
  });
});

describe('struktur', () => {
  it('menu memakai bahan: langsung dan lewat resep bertingkat', () => {
    const m = model();
    expect(menusUsingBahan(m, 'A').map((x) => x.id)).toEqual(['m1']);          // via saos dan porsi
    expect(menusUsingBahan(m, 'B').map((x) => x.id)).toEqual(['m1', 'm2']);    // langsung + via saos
    expect(menusUsingBahan(m, 'C')).toEqual([]);
  });

  it('komponen menu urut biaya terbesar', () => {
    const m = model(); const c = makeCtx(m);
    const p = menuParts(m, c, m.menu[0]);
    expect(p.map((x) => x.nama)).toEqual(['Kemasan', 'Ayam goreng']);
    expect(p.reduce((s, x) => s + x.biaya, 0)).toBeCloseTo(1730);
  });

  it('isi resep memuat bahan dan sub-resep dengan biayanya', () => {
    const m = model(); const c = makeCtx(m);
    const rows = resepRows(m, c, 'porsi');
    expect(rows.map((r) => [r.kind, r.nama, Math.round(r.biaya)])).toEqual([['resep', 'Saos', 130], ['bahan', 'Ayam', 100]]);
  });

  it('resep yang saling merujuk tidak membuat loop tak hingga', () => {
    const raw = { ...RAW,
      resep: [...RAW.resep, { id: 'x', nama: 'X', grup: 'g', hasil_qty: null }, { id: 'y', nama: 'Y', grup: 'g', hasil_qty: null }],
      resepItem: [...RAW.resepItem,
        { id: 'c1', resep_id: 'x', urutan: 1, bahan_id: null, sub_resep_id: 'y', qty: 1 },
        { id: 'c2', resep_id: 'y', urutan: 1, bahan_id: null, sub_resep_id: 'x', qty: 1 },
        { id: 'c3', resep_id: 'y', urutan: 2, bahan_id: 'A', qty: 10, sub_resep_id: null }],
    };
    const m = buildModel(raw);
    expect(Number.isFinite(makeCtx(m).resepTotal('x'))).toBe(true);
    expect(menusUsingBahan({ ...m, menu: [{ ...m.menu[0], items: [{ resepId: 'x', bahanId: null, qty: 1 }] }] }, 'A')).toHaveLength(1);
  });

  it('bahan tanpa harga dihitung 0 dan dilaporkan', () => {
    const raw = { ...RAW, resepItem: [...RAW.resepItem, { id: 'i9', resep_id: 'porsi', urutan: 3, bahan_id: 'C', sub_resep_id: null, qty: 5 }] };
    const m = buildModel(raw);
    expect(makeCtx(m).resepTotal('porsi')).toBeCloseTo(230);
    expect(menuBahanKosong(m, m.menu[0])).toEqual(['Garam']);
    expect(menuBahanKosong(m, m.menu[1])).toEqual([]);
  });

  it('kelompokkan: urutan kategori, item tanpa kategori masuk Lainnya, grup kosong dibuang', () => {
    const m = model();
    const g = kelompokkan(m.bahanList, m.kategoriBahan, (b) => b.kategoriId);
    expect(g.map((x) => [x.nama, x.items.map((b) => b.nama)])).toEqual([['Primer', ['Ayam']], ['Packaging', ['Kemasan']], ['Lainnya', ['Garam']]]);
  });
});

describe('dampak perubahan harga dan acuan', () => {
  it('ayam 1000 -> 2000: menu terdampak dihitung sebelum dan sesudah', () => {
    const d = dampakUbah(buildModel(RAW), 'A', { harga: 2000 });
    expect(d.rows).toHaveLength(1);
    const r = d.rows[0];
    expect(r.sebelum.hpp).toBeCloseTo(1730);
    expect(r.sesudah.hpp).toBeCloseTo(1860);     // saos 3200, 50 gr = 160; porsi 160 + 200; + 1500
    expect(r.selisih).toBeCloseTo(130);
    expect(r.ganti).toBe(false);
  });

  it('menandai menu yang berpindah kategori margin', () => {
    const raw = { ...RAW, setting: [{ key: 'margin', value: { lo: 82, hi: 82 } }] };
    const d = dampakUbah(buildModel(raw), 'A', { harga: 2000 });
    expect(d.rows[0].sebelum.tier).toBe('HIGH');   // 82,7%
    expect(d.rows[0].sesudah.tier).toBe('LOW');    // 81,4%
    expect(d.ganti).toBe(1);
  });

  it('acuan: selisih modal terhadap harga acuan', () => {
    const raw = { ...RAW, bahan: RAW.bahan.map((b) => (b.id === 'A' ? { ...b, harga_acuan: 500 } : b)) };
    const m = buildModel(raw);
    const now = makeCtx(m).menuHpp(m.menu[0]);
    const acuan = ctxAcuan(m).menuHpp(m.menu[0]);
    expect(now - acuan).toBeCloseTo(0.5 * 1000 * 0.6 * 0.05 + 0.5 * 100, 5);   // ayam 500 lebih murah per kg
  });

  it('perubahan terakhir dari riwayat', () => {
    const m = model();
    const p = perubahanTerakhir(m, 'A');
    expect(p.persen).toBeCloseTo(25);
    expect(p.dari).toBe(800);
    expect(perubahanTerakhir(m, 'B')).toBeNull();
    expect(m.riwayat.A.map((r) => r.id)).toEqual(['r2', 'r1']);   // terbaru dulu
  });
});

describe('komposisi: id baris, lingkaran, dan pemakai resep', () => {
  it('menuParts dan resepRows membawa itemId (untuk ubah/hapus baris)', () => {
    const m = model(); const c = makeCtx(m);
    expect(menuParts(m, c, m.menu[0]).map((p) => p.itemId).sort()).toEqual(['j1', 'j2']);
    expect(resepRows(m, c, 'porsi').map((r) => r.itemId)).toEqual(['i3', 'i4']);
  });

  it('resepMemuat dan bisaTambahSub: tidak boleh diri sendiri atau membuat lingkaran', () => {
    const m = model();
    expect(resepMemuat(m, 'porsi', 'saos')).toBe(true);
    expect(resepMemuat(m, 'saos', 'porsi')).toBe(false);
    expect(bisaTambahSub(m, 'saos', 'saos')).toBe(false);
    expect(bisaTambahSub(m, 'saos', 'porsi')).toBe(false);   // porsi sudah memuat saos
    expect(bisaTambahSub(m, 'porsi', 'saos')).toBe(true);    // bukan lingkaran (picker yang menandai "sudah ada")
    expect(bisaTambahSub({ ...m, resep: { ...m.resep, baru: { id: 'baru', nama: 'Baru', items: [] } } }, 'saos', 'baru')).toBe(true);
  });

  it('menusUsingResep: langsung dan lewat resep lain', () => {
    const m = model();
    expect(menusUsingResep(m, 'porsi').map((x) => x.id)).toEqual(['m1']);
    expect(menusUsingResep(m, 'saos').map((x) => x.id)).toEqual(['m1']);   // saos ada di dalam porsi
    expect(menusUsingResep(m, 'tidak-ada')).toEqual([]);
  });

  it('menambah dan menghapus komponen mengubah HPP menu sesuai biayanya', () => {
    const tambah = buildModel({ ...RAW, menuItem: [...RAW.menuItem, { id: 'j9', menu_id: 'm2', urutan: 2, resep_id: null, bahan_id: 'A', qty: 200 }] });
    expect(makeCtx(tambah).menuHpp(tambah.menu[1])).toBe(1200);        // 1000 + 200 gr ayam
    const hapus = buildModel({ ...RAW, menuItem: RAW.menuItem.filter((i) => i.id !== 'j2') });
    expect(makeCtx(hapus).menuHpp(hapus.menu[0])).toBeCloseTo(230);    // hanya porsi, tanpa kemasan
  });
});

describe('daftar HPP: kelompok resep, riwayat turunan, dampak ubah', () => {
  it('kelompokResep: per grup, urut resep pertama; grup kosong jadi Lainnya', () => {
    const m = model();
    const g = kelompokResep(Object.values(m.resep));
    expect(g.map((x) => x.nama)).toEqual(['Saos', 'Menu utama']);
    expect(g[0]).toMatchObject({ id: 'g:Saos' });
    expect(g[0].items.map((r) => r.id)).toEqual(['saos']);
    expect(kelompokResep([{ id: 'x', nama: 'X', grup: null, urutan: 1 }])[0].nama).toBe('Lainnya');
  });

  it('riwayatBahanRows: terbaru dulu, dengan harga sebelum dan persen (null = awal)', () => {
    const r = riwayatBahanRows(model(), 'A');
    expect(r.map((x) => x.harga)).toEqual([1000, 800]);
    expect(r[0].sebelum).toBe(800);
    expect(r[0].persen).toBeCloseTo(25);
    expect(r[1].persen).toBeNull();
    expect(riwayatBahanRows(model(), 'B')).toEqual([]);
  });

  it('hargaPada: harga bahan menurut waktu; sebelum riwayat pertama pakai harga awal; tanpa riwayat = harga sekarang', () => {
    const m = model();
    expect(hargaPada(m, 'A', new Date('2026-10-10T00:00:00Z').getTime())).toBe(1000);
    expect(hargaPada(m, 'A', new Date('2026-09-15T00:00:00Z').getTime())).toBe(800);
    expect(hargaPada(m, 'A', new Date('2026-01-01T00:00:00Z').getTime())).toBe(800);
    expect(hargaPada(m, 'B', 0)).toBe(50000);
    expect(hargaPada(m, 'tidak-ada', 0)).toBeNull();
  });

  it('riwayatModalRows: modal menu/resep dihitung ulang tiap harga bahan berganti (terbaru dulu)', () => {
    const m = model();
    const menu = riwayatModalRows(m, { menuId: 'm1' });
    expect(menu.map((e) => Math.round(e.nilai))).toEqual([1730, 1704]);
    expect(menu[0].persen).toBeCloseTo((26 / 1704) * 100, 3);
    expect(menu[1].persen).toBeNull();
    expect(riwayatModalRows(m, { resepId: 'saos' }).map((e) => Math.round(e.nilai))).toEqual([2600, 2480]);
    expect(riwayatModalRows(m, { menuId: 'm2' })).toEqual([]);        // bahannya tidak pernah berubah harga
    expect(riwayatModalRows(m, { menuId: 'tidak-ada' })).toEqual([]);
  });

  it('riwayatModalRows: perubahan yang tidak mengubah modal (setelah dibulatkan) tidak dicatat sebagai entri baru', () => {
    // Kemasan (dipakai m1) berubah Rp50.000 -> Rp50.010: modal bergeser kurang dari Rp1.
    const m = buildModel({
      ...RAW,
      bahan: RAW.bahan.map((b) => (b.id === 'B' ? { ...b, harga: 50010 } : b)),
      riwayat: [...RAW.riwayat, { id: 'r3', bahan_id: 'B', harga: 50010, harga_sebelum: 50000, catatan: '', sumber: 'manual', dibuat_pada: '2026-10-20T00:00:00Z' }],
    });
    expect(riwayatModalRows(m, { menuId: 'm1' })).toHaveLength(2);
  });

  it('dampakUbah: modal sebelum/sesudah per menu tanpa mengubah model; hanya yang berubah; isi ikut dihitung', () => {
    const m = model();
    const d = dampakUbah(m, 'A', { harga: 2000 });
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0].menu.id).toBe('m1');
    expect(d.rows[0].sebelum.hpp).toBeCloseTo(1730);
    expect(d.rows[0].sesudah.hpp).toBeCloseTo(1860);
    expect(d.rows[0].selisih).toBeCloseTo(130);
    expect(m.bahan.A.harga).toBe(1000);                                // model asli tidak berubah
    const isi = dampakUbah(m, 'A', { isi: 500 });                      // isi separuh = harga per gr dua kali lipat
    expect(isi.rows[0].sesudah.hpp).toBeCloseTo(1860);
    expect(dampakUbah(m, 'A', { harga: 1000 }).rows).toEqual([]);      // tidak berubah
    expect(dampakUbah(m, 'tidak-ada', { harga: 1 })).toEqual({ rows: [], ganti: 0 });
  });

  it('dampakUbah: menandai menu yang berganti kategori margin', () => {
    const m = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 80, hi: 80 } }] });
    const d = dampakUbah(m, 'A', { harga: 2000 });
    expect(d.ganti).toBe(0);                                           // 82,7% -> 81,4%: masih HIGH
    const keras = dampakUbah(m, 'A', { harga: 20000 });
    expect(keras.rows[0].ganti).toBe(true);
    expect(keras.ganti).toBe(1);
  });

  it('opsiSatuan dan isiBawaan', () => {
    expect(opsiSatuan('kg')).toContain('renceng');
    expect(opsiSatuan('20 kg')).toContain('20 kg');
    expect(opsiSatuan('kg')).not.toContain('20 kg');
    expect(isiBawaan('kg', 'gr')).toBe(1000);
    expect(isiBawaan('liter', 'ml')).toBe(1000);
    expect(isiBawaan('kg', 'pcs')).toBeNull();
    expect(isiBawaan('pack', 'gr')).toBeNull();
  });

  it('satuan beli dan satuan pembagi: bawaan bila belum diatur, ikut pengaturan bila ada', () => {
    const m = model();
    expect(m.satuanBeli).toEqual(SATUAN_UMUM);
    expect(m.satuanDasar).toEqual(SATUAN_DASAR_UMUM);
    const atur = buildModel({ ...RAW, setting: [...RAW.setting, { key: 'satuan_beli', value: ['kg', ' dus ', 'DUS', ''] }, { key: 'satuan_dasar', value: ['gr', 'sdm'] }] });
    expect(atur.satuanBeli).toEqual(['kg', 'dus']);
    expect(atur.satuanDasar).toEqual(['gr', 'sdm']);
    const rusak = buildModel({ ...RAW, setting: [{ key: 'satuan_beli', value: [] }, { key: 'satuan_dasar', value: 'gr' }] });
    expect(rusak.satuanBeli).toEqual(SATUAN_UMUM);
    expect(rusak.satuanDasar).toEqual(SATUAN_DASAR_UMUM);
  });

  it('rapikanSatuan: pangkas, buang kosong dan kembar (tanpa peduli huruf), batasi 20 huruf; opsiSatuan ikut daftar sendiri', () => {
    expect(rapikanSatuan([' Kg ', 'kg', '', null, 'dus'])).toEqual(['Kg', 'dus']);
    expect(rapikanSatuan('bukan daftar')).toEqual([]);
    expect(rapikanSatuan(['x'.repeat(30)])[0]).toHaveLength(20);
    expect(opsiSatuan('ikat', ['kg', 'dus'])).toEqual(['kg', 'dus', 'ikat']);
    expect(opsiSatuan('dus', ['kg', 'dus'])).toEqual(['kg', 'dus']);
  });

  it('pemakaiSatuan: hitung bahan per satuan beli dan per satuan pembagi', () => {
    const m = model();
    expect(pemakaiSatuan(m, 'satuan')).toEqual({ kg: 1, pack: 2 });
    expect(pemakaiSatuan(m, 'unit')).toEqual({ gr: 2, pcs: 1 });
  });
});

describe('draft form komposisi dan dampak resep', () => {
  const m = buildModel(RAW);

  it('draftDariMenu / draftDariResep: salinan baris dengan takaran teks; tidak berubah = draftBerubah false', () => {
    const dm = draftDariMenu(m.menu[0]);
    expect(dm).toEqual([
      { key: 'j1', id: 'j1', kind: 'resep', ref: 'porsi', qty: '1' },
      { key: 'j2', id: 'j2', kind: 'bahan', ref: 'B', qty: '1.5' },
    ]);
    const dr = draftDariResep(m.resep.porsi);
    expect(dr.map((d) => [d.kind, d.ref, d.qty])).toEqual([['resep', 'saos', '50'], ['bahan', 'A', '100']]);
    expect(draftBerubah(dm, draftDariMenu(m.menu[0]))).toBe(false);
  });

  it('draftBerubah: takaran beda, baris dihapus, baris ditambah; "1" dan "1,0" dianggap sama', () => {
    const asli = draftDariMenu(m.menu[0]);
    expect(draftBerubah(asli, asli.map((d, i) => (i ? { ...d, qty: '2' } : d)))).toBe(true);
    expect(draftBerubah(asli, asli.slice(1))).toBe(true);
    expect(draftBerubah(asli, [...asli, { key: 'baru-bahan-A', id: null, kind: 'bahan', ref: 'A', qty: '10' }])).toBe(true);
    expect(draftBerubah(asli, asli.map((d) => ({ ...d, qty: d.qty === '1' ? '1,0' : d.qty })))).toBe(false);
  });

  it('draftValid: semua takaran harus angka lebih dari 0', () => {
    const asli = draftDariMenu(m.menu[0]);
    expect(draftValid(asli)).toBe(true);
    expect(draftValid([{ ...asli[0], qty: '0' }])).toBe(false);
    expect(draftValid([{ ...asli[0], qty: '' }])).toBe(false);
    expect(draftValid([{ ...asli[0], qty: 'abc' }])).toBe(false);
    expect(draftValid([])).toBe(true);
  });

  it('itemsMenuDariDraft / itemsResepDariDraft: bentuk item model (resepId vs subResepId), urutan 1..n, takaran angka', () => {
    expect(itemsMenuDariDraft(draftDariMenu(m.menu[0]))).toEqual([
      { id: 'j1', urutan: 1, bahanId: null, resepId: 'porsi', qty: 1 },
      { id: 'j2', urutan: 2, bahanId: 'B', resepId: null, qty: 1.5 },
    ]);
    expect(itemsResepDariDraft(draftDariResep(m.resep.porsi))).toEqual([
      { id: 'i3', urutan: 1, bahanId: null, subResepId: 'saos', qty: 50 },
      { id: 'i4', urutan: 2, bahanId: 'A', subResepId: null, qty: 100 },
    ]);
  });

  it('modelDenganResep: model asli tidak berubah; hitungan ikut isi baru', () => {
    const items = itemsResepDariDraft(draftDariResep(m.resep.porsi).map((d) => (d.ref === 'A' ? { ...d, qty: '200' } : d)));
    const m2 = modelDenganResep(m, 'porsi', { items });
    expect(m.resep.porsi.items.find((i) => i.bahanId === 'A').qty).toBe(100);
    expect(makeCtx(m2).resepTotal('porsi')).toBeCloseTo(makeCtx(m).resepTotal('porsi') + 100 * 1);   // +100 gr ayam @ Rp1/gr
  });

  it('dampakUbahResep: menu pemakai berubah modalnya; hasil batch dibagi lebih besar = modal turun', () => {
    const items = itemsResepDariDraft(draftDariResep(m.resep.saos).map((d) => (d.ref === 'A' ? { ...d, qty: '700' } : d)));
    const d = dampakUbahResep(m, 'saos', { items });
    expect(d.rows.map((r) => r.menu.id)).toEqual(['m1']);
    expect(d.rows[0].selisih).toBeCloseTo((100 * 1 / 1000) * 50);          // +100 gr ayam di batch 1000, dipakai 50
    const hasilBesar = dampakUbahResep(m, 'saos', { hasilQty: 2000 });
    expect(hasilBesar.rows[0].selisih).toBeLessThan(0);
    expect(dampakUbahResep(m, 'saos', {}).rows).toEqual([]);               // tidak ada perubahan = tidak ada dampak
    expect(dampakUbahResep(m, 'tidak-ada', {}).rows).toEqual([]);
  });

  it('resepPerUnit: batch = total / hasil; per porsi = total', () => {
    expect(resepPerUnit({ hasilQty: 1000 }, 2600)).toBeCloseTo(2.6);
    expect(resepPerUnit({ hasilQty: null }, 230)).toBe(230);
  });

  it('ringkasanDaftar: margin rata-rata menu berkomposisi + jumlah LOW; belum ada komposisi = jumlah data', () => {
    expect(ringkasanDaftar(m)).toMatch(/^Margin rata-rata \d+,\d% · 0 menu LOW \(di bawah 30%\)$/);
    const kosong = buildModel({ ...RAW, menuItem: [] });
    expect(ringkasanDaftar(kosong)).toBe('3 bahan · 2 resep · 2 menu · komposisi belum diisi');
    const rendah = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 90, hi: 90 } }] });
    expect(ringkasanDaftar(rendah)).toContain('2 menu LOW (di bawah 90%)');
  });
});

describe('salin komposisi dari menu lain', () => {
  it('draft salinan: semua baris baru (id null, key unik) dengan jenis, acuan, dan takaran yang sama', () => {
    const m = model();
    const sumber = m.menu.find((x) => x.id === 'm1');
    const d = draftSalinDariMenu(sumber);
    expect(d).toHaveLength(sumber.items.length);
    expect(d.every((x) => x.id === null)).toBe(true);
    expect(new Set(d.map((x) => x.key)).size).toBe(d.length);
    expect(d.map(({ kind, ref, qty }) => ({ kind, ref, qty }))).toEqual(draftDariMenu(sumber).map(({ kind, ref, qty }) => ({ kind, ref, qty })));
    expect(draftValid(d)).toBe(true);
  });
  it('menu tujuan yang sudah punya komposisi: baris lamanya hilang dari draft (terhapus saat Simpan), draft dianggap berubah', () => {
    const m = model();
    const tujuan = m.menu.find((x) => x.id === 'm2');
    const hasil = draftSalinDariMenu(m.menu.find((x) => x.id === 'm1'));
    expect(hasil.some((x) => x.id === tujuan.items[0].id)).toBe(false);
    expect(draftBerubah(draftDariMenu(tujuan), hasil)).toBe(true);
  });
  it('hitungan modal menu tujuan sama dengan menu sumber setelah disalin', () => {
    const m = model();
    const sumber = m.menu.find((x) => x.id === 'm1');
    const tujuan = { ...m.menu.find((x) => x.id === 'm2'), items: itemsMenuDariDraft(draftSalinDariMenu(sumber)) };
    const sesudah = { ...m, menu: m.menu.map((x) => (x.id === tujuan.id ? tujuan : x)) };
    expect(menuInfo(sesudah, makeCtx(sesudah), tujuan).hpp).toBe(menuInfo(m, makeCtx(m), sumber).hpp);
  });
  it('daftar sumber: menu lain yang punya komponen, bisa dicari, tanpa menu yang sedang diedit; menu kosong tidak ditawarkan', () => {
    const m = model();
    expect(menuSumberSalin(m, 'm1').map((x) => x.id)).not.toContain('m1');
    expect(menuSumberSalin(m, 'm1').every((x) => x.items.length > 0)).toBe(true);
    const semua = menuSumberSalin(m, 'zzz');
    expect(semua.map((x) => x.nama)).toEqual([...semua.map((x) => x.nama)].sort((a, b) => a.localeCompare(b, 'id')));
    expect(menuSumberSalin(m, 'zzz', 'tidak-ada-menu-ini')).toEqual([]);
    const kosong = { ...m, menu: m.menu.map((x) => (x.id === 'm2' ? { ...x, items: [] } : x)) };
    expect(menuSumberSalin(kosong, 'm1').map((x) => x.id)).not.toContain('m2');
  });
});
