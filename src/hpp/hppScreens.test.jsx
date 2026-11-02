import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { renderToString } from 'react-dom/server';
import { RAW } from './fixture';
import { buildModel, dampakUbah } from './hppModel';
import LoginScreen from './LoginScreen.jsx';
import MenuTab from './MenuTab.jsx';
import BahanTab from './BahanTab.jsx';
import ResepTab from './ResepTab.jsx';
import MenuSheet from './MenuSheet.jsx';
import BahanSheet from './BahanSheet.jsx';
import ResepSheet from './ResepSheet.jsx';
import DampakSheet from './DampakSheet.jsx';
import SettingsSheet from './SettingsSheet.jsx';
import KomposisiForm from './KomposisiForm.jsx';
import { NotifKeluar, Sheet, Snack, Sparkline, Stepper, durasiKeluar, DURASI_KELUAR_MS } from './ui.jsx';
import { draftDariMenu, draftDariResep } from './hppModel';

const render = (el) => renderToString(el).replace(/<!-- -->/g, '');
const noop = () => {};
const actions = new Proxy({}, { get: () => noop });
const model = buildModel(RAW);

describe('layar HPP (render server)', () => {
  it('login: email + password + Masuk, tanpa data HPP', () => {
    const html = render(<LoginScreen onMasuk={noop} />);
    expect(html).toContain('Mamam HPP');
    expect(html).toContain('Email');
    expect(html).toContain('Password');
    expect(html).toContain('Masuk');
    expect(html).toContain('Kembali ke POS');
    expect(html).not.toContain('Ayam');
  });

  it('tab Menu: kategori menguncup di awal; pencarian ada di bilah atas (prop q), bukan di tab; tanpa chip kategori', () => {
    const html = render(<MenuTab model={model} onOpen={noop} onAcuan={noop} adaPerubahan={false} />);
    expect(html).not.toContain('Cari menu');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Semua 2');
    expect(html).toContain('Paket · 1');
    expect(html).toContain('Satuan · 1');
    expect(html).not.toContain('Paket Ayam');                 // isi kategori belum terbuka
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Jadikan harga sekarang sebagai acuan');
    expect(render(<MenuTab model={model} q="kemasan" onOpen={noop} onAcuan={noop} adaPerubahan={false} />)).toContain('Kemasan Saja');   // mencari membuka kategori yang cocok
    expect(render(<MenuTab model={model} q="zzz" onOpen={noop} onAcuan={noop} adaPerubahan={false} />)).toContain('Tidak ada menu yang cocok');
  });

  it('tab Menu: kategori terbuka menampilkan modal, harga jual, dan margin per menu', () => {
    const html = render(<MenuTab model={model} onOpen={noop} onAcuan={noop} adaPerubahan={false} awalBuka />);
    expect(html).toContain('Paket Ayam');
    expect(html).toContain('Rp 1.730');
    expect(html).toContain('Jual Rp 10.000');
    expect(html).toContain('82,7% HIGH');
    expect(html).not.toContain('Riwayat modal');              // detail baris belum dibuka
  });

  it('tab Menu: detail baris = komposisi, modal/jual/profit, riwayat modal turunan, dan tombol Edit', () => {
    const html = render(<MenuTab model={model} onOpen={noop} onAcuan={noop} adaPerubahan={false} awalBuka awalTerbuka={['m1']} />);
    expect(html).toContain('Ayam goreng');
    expect(html).toContain('Biaya lain');
    expect(html).toContain('Profit');
    expect(html).toContain('Riwayat modal');
    expect(html).toContain('Rp 1.704');                       // modal saat Ayam masih Rp800/kg
    expect(html).toContain('▲ 1,5%');
    expect(html).toContain('>Edit<');
  });

  it('tab Menu: tombol acuan muncul saat ada perubahan; SEDANG tampil di baris saat batas dipisah', () => {
    const m2 = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 40, hi: 90 } }] });
    const html = render(<MenuTab model={m2} onOpen={noop} onAcuan={noop} adaPerubahan awalBuka />);
    expect(html).toContain('82,7% SEDANG');
    expect(html).toContain('Jadikan harga sekarang sebagai acuan');
  });

  it('tab Bahan baku: kategori menguncup di awal, tanpa chip kategori, pencarian lewat prop q', () => {
    const html = render(<BahanTab model={model} onOpen={noop} />);
    expect(html).not.toContain('Cari bahan');
    expect(html).toContain('Primer · 1');
    expect(html).toContain('Lainnya · 1');
    expect(html).not.toContain('Semua 3');
    expect(html).not.toContain('Rp 50.000');                  // isi Packaging belum terbuka
    expect(html).toContain('1 bahan');                        // catatan bahan tanpa harga
    expect(render(<BahanTab model={model} q="ayam" onOpen={noop} />)).toContain('Ayam');
    expect(render(<BahanTab model={model} q="zzz" onOpen={noop} />)).toContain('Tidak ada bahan yang cocok');
  });

  it('tab Bahan baku: baris menampilkan satuan, harga per unit dasar, perubahan terakhir, dan bahan tanpa harga', () => {
    const html = render(<BahanTab model={model} onOpen={noop} awalBuka />);
    expect(html).toContain('per kg (1.000 gr)');
    expect(html).toContain('Rp 1.000');
    expect(html).toContain('≈ Rp 1/gr');
    expect(html).toContain('▲ 25,0%');
    expect(html).toContain('Harga awal');                     // Kemasan belum pernah berubah
    expect(html).toContain('Belum diisi');
    expect(html).toContain('Lainnya');                        // Garam tanpa kategori
    expect(html).not.toContain('dipakai di');
    expect(html).not.toContain('Riwayat harga');              // detail baris belum dibuka
  });

  it('tab Bahan baku: detail baris = riwayat terbaru dulu (nilai dengan satuan beli) + tombol Update harga (Isi harga bila kosong)', () => {
    const html = render(<BahanTab model={model} onOpen={noop} awalBuka awalTerbuka={['A', 'C']} />);
    expect(html).toContain('Riwayat harga');
    expect(html).toContain('Rp 1.000/kg');
    expect(html).toContain('Rp 800/kg');
    expect(html).toContain('Update harga');
    expect(html).toContain('Isi harga');
    expect(html).toContain('Harga belum diisi');
    expect(html.indexOf('▲ 25,0%')).toBeLessThan(html.indexOf('>awal<'));
    expect(html).not.toContain('Lihat semua');                // hanya 2 entri
  });

  it('tab Resep: grup menguncup di awal; baris menampilkan hasil, modal, dan penanda belum diisi', () => {
    const tutup = render(<ResepTab model={model} onOpen={noop} />);
    expect(tutup).not.toContain('Cari resep');
    expect(tutup).toContain('Menu utama · 1');
    expect(tutup).toContain('Saos · 1');
    expect(tutup).not.toContain('Hasil 1.000 gr');
    const buka = render(<ResepTab model={model} onOpen={noop} awalBuka />);
    expect(buka).toContain('Hasil 1.000 gr');
    expect(buka).toContain('Rp 2.600');
    expect(buka).toContain('Per porsi');
    expect(buka).toContain('Rp 230');
    expect(buka).toContain('▲');                              // chip perubahan modal terakhir (harga ayam naik)
    const kosong = buildModel({ ...RAW, resepItem: [] });
    expect(render(<ResepTab model={kosong} onOpen={noop} awalBuka />)).toContain('Belum diisi');
  });

  it('tab Resep: detail baris = isi, total/hasil/per unit, riwayat modal, dan tombol Edit', () => {
    const html = render(<ResepTab model={model} onOpen={noop} awalBuka awalTerbuka={['saos']} />);
    expect(html).toContain('Kemasan');
    expect(html).toContain('Total batch');
    expect(html).toContain('Per gr');
    expect(html).toContain('Riwayat modal');
    expect(html).toContain('Rp 2.480');                       // saat Ayam masih Rp800/kg
    expect(html).toContain('>Edit<');
  });

  it('form Edit menu: nama, kategori, harga jual (− +), komposisi, biaya lain, pratinjau modal, Simpan nonaktif sebelum ada perubahan', () => {
    const html = render(<MenuSheet model={model} menuId="m1" actions={actions} onClose={noop} />);
    expect(html).toContain('Edit menu');
    expect(html).toContain('value="Paket Ayam"');
    expect(html).toContain('Kategori menu');
    expect(html).toContain('aria-label="Kurangi Harga jual outlet"');
    expect(html).toContain('value="10000"');
    expect(html).toContain('Komposisi');
    expect(html).toContain('Ayam goreng');
    expect(html).toContain('Tambah komponen');
    expect(html).toContain('Biaya lain');
    expect(html).toContain('value="500"');
    expect(html).toContain('Modal Rp 1.730 → <b class="text-slate-900">Rp 1.730</b>');
    expect(html).not.toContain('harga jual minimal');
    expect(html).toMatch(/disabled=""[^>]*>Simpan</);
    expect(html).toContain('>Batal<');
    expect(html).not.toContain('Ubah komposisi');             // tidak ada lagi mode ubah
    const low = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 90, hi: 90 } }] });
    expect(render(<MenuSheet model={low} menuId="m1" actions={actions} onClose={noop} />)).toContain('harga jual minimal Rp 17.500');
  });

  it('form Update harga: nama, harga per satuan dengan tombol − +, satuan disembunyikan di balik Ubah, tanpa catatan dan persentase', () => {
    const html = render(<BahanSheet model={model} bahanId="A" actions={actions} onClose={noop} />);
    expect(html).toContain('Update harga');
    expect(html).toContain('value="Ayam"');
    expect(html).toContain('Harga per kg');
    expect(html).toContain('aria-label="Kurangi Harga baru"');
    expect(html).toContain('aria-label="Tambah Harga baru"');
    expect(html).toContain('Satuan: <b class="text-slate-800">kg (1.000 gr)</b>');
    expect(html).toContain('>Ubah<');
    expect(html).toContain('Rp 1.000/kg ÷ 1.000 gr = <b class="text-slate-900">Rp 1</b>/gr');
    expect(html).not.toContain('Catatan');
    expect(html).not.toContain('+10%');
    expect(html).not.toContain('−10%');
    expect(html).not.toContain('renceng');                    // pilihan satuan tersembunyi
    expect(html).not.toContain('Riwayat harga');              // riwayat ada di detail baris
    expect(html).not.toContain('Lihat menu terdampak');       // belum ada perubahan
    expect(html).toMatch(/disabled=""[^>]*>Simpan</);         // belum ada perubahan = Simpan nonaktif
  });

  it('form Update harga: tombol Ubah membuka pilihan satuan, isi per satuan, dan kategori', () => {
    const html = render(<BahanSheet model={model} bahanId="A" actions={actions} onClose={noop} awalUbah />);
    expect(html).toContain('Satuan beli');
    expect(html).toContain('>renceng<');
    expect(html).toContain('Isi per kg (dibagi per gr)');
    expect(html).toContain('Kategori bahan');
    expect(html).toContain('>Primer<');
    expect(html).not.toContain('>Ubah<');
  });

  it('form Update harga tanpa harga: kolom kosong, Simpan nonaktif', () => {
    const html = render(<BahanSheet model={model} bahanId="C" actions={actions} onClose={noop} />);
    expect(html).toContain('Isi nama, harga, dan isi per satuan');
    expect(html).toMatch(/disabled=""[^>]*>Simpan</);
  });

  it('popup menu terdampak: dikelompokkan per kategori menu, modal sebelum → sesudah dan persennya', () => {
    const d = dampakUbah(model, 'A', { harga: 2000 });
    const html = render(<DampakSheet model={model} judul="Ayam: Rp 1 → Rp 2/gr" rows={d.rows} onClose={noop} />);
    expect(html).toContain('Menu terdampak');
    expect(html).toContain('Ayam: Rp 1 → Rp 2/gr');
    expect(html).toContain('Paket · 1');
    expect(html).toContain('Paket Ayam');
    expect(html).toContain('Rp 1.730 → Rp 1.860');
    expect(html).toContain('▲ 7,5%');
    expect(html).toContain('>Tutup<');
    expect(render(<DampakSheet model={model} judul="x" rows={[]} onClose={noop} />)).toContain('Tidak ada menu yang berubah modalnya');
  });

  it('form Edit resep (batch): nama, hasil per batch, komposisi, pratinjau per unit, Simpan nonaktif', () => {
    const html = render(<ResepSheet model={model} resepId="saos" actions={actions} onClose={noop} />);
    expect(html).toContain('Edit resep');
    expect(html).toContain('value="Saos"');
    expect(html).toContain('Hasil per batch');
    expect(html).toContain('aria-label="Takaran Ayam"');
    expect(html).toContain('Tambah komponen');
    expect(html).toContain('Per gr: Rp 2,6 → <b class="text-slate-900">Rp 2,6</b>');
    expect(html).toContain('Total batch Rp 2.600 → Rp 2.600');
    expect(html).toMatch(/disabled=""[^>]*>Simpan</);
    expect(html).not.toContain('Ubah isi');
  });

  it('form Edit resep (per porsi): tanpa kolom hasil per batch', () => {
    const html = render(<ResepSheet model={model} resepId="porsi" actions={actions} onClose={noop} />);
    expect(html).toContain('Ayam goreng');
    expect(html).not.toContain('Hasil per batch');
    expect(html).toContain('Per porsi: Rp 230');
    const kosong = buildModel({ ...RAW, resepItem: [] });
    expect(render(<ResepSheet model={kosong} resepId="saos" actions={actions} onClose={noop} />)).toContain('Belum ada komponen.');
  });

  it('pengaturan: batas margin, harga online, dua editor kategori, tombol Keluar', () => {
    const html = render(<SettingsSheet model={model} actions={actions} email="owner@x.test" onKeluar={noop} onClose={noop} />);
    expect(html).toContain('Batas margin');
    expect(html).toContain('LOW jika margin di bawah');
    expect(html).toContain('HIGH jika margin mulai dari');
    expect(html).toContain('Harga online = outlet +');
    expect(html).toContain('Kategori bahan');
    expect(html).toContain('Kategori menu');
    expect(html).toContain('owner@x.test');
    expect(html).toContain('Keluar');
    expect(html).toContain('Saat ini: 0 LOW, 0 SEDANG, 2 HIGH dari 2 menu');
  });
});

describe('popup HPP: kerangka sama dengan app utama (Overlay)', () => {
  const css = fs.readFileSync(new URL('./hppAnim.css', import.meta.url), 'utf8');
  const baca = (f) => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');

  it('Sheet: lembar putih dengan handle bar, judul, tombol X bulat (aria-label Tutup), dan isi', () => {
    const html = render(<Sheet title="Tes Popup" onClose={noop}><p>isi popup</p></Sheet>);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Tes Popup"');
    expect(html).toContain('>Tes Popup<');
    expect(html).toContain('aria-label="Tutup"');
    expect(html).toContain('rounded-full bg-slate-100 p-2');     // tombol X bulat seperti Modal app utama
    expect(html).toContain('w-10');                              // handle bar
    expect(html).toContain('rounded-t-3xl bg-white');
    expect(html).toContain('<p>isi popup</p>');
    expect(html).not.toContain('data-keluar');
  });

  it('Sheet memakai Overlay app utama (varian responsive: animasi masuk/keluar dan tarik ke bawah untuk menutup)', () => {
    const src = baca('ui.jsx');
    expect(src).toMatch(/import Overlay from '\.\.\/components\/ui\/Overlay'/);
    expect(src).toMatch(/<Overlay[\s\S]*variant="responsive"/);
    const overlay = fs.readFileSync(new URL('../components/ui/Overlay.jsx', import.meta.url), 'utf8');
    expect(overlay).toMatch(/useSwipeDown/);
    expect(overlay).toMatch(/variant === 'sheet' \|\| variant === 'responsive'/);   // swipe aktif untuk varian ini
  });

  it('Sheet menjadi lapisan di stack navigasi: Back menutup popup', () => {
    const src = baca('ui.jsx');
    expect(src).toMatch(/useBackLayer\(true, tutup\)/);
    expect(src).toMatch(/from '\.\/hppBackStack'/);
  });

  it('Esc, X, tarik ke bawah, ketuk latar, dan Back semuanya lewat tutup() (animasi keluar dulu, baru onClose)', () => {
    const src = baca('ui.jsx');
    const sheet = src.slice(src.indexOf('export function Sheet'));
    expect(sheet).toMatch(/onClose=\{tutup\}/);                 // Overlay: ketuk latar dan tarik ke bawah
    expect(sheet).toMatch(/onClick=\{tutup\}/);                 // tombol X
    expect(sheet).toMatch(/e\.key === 'Escape'\) tutup\(\)/);
    expect(sheet).toMatch(/setTimeout\(onClose, durasiKeluar\(\)\)/);
    expect(sheet).toMatch(/open=\{!keluar\}/);
  });

  it('durasi menunggu animasi keluar = 300 ms (sama dengan Overlay responsive); 0 bila gerakan dikurangi', () => {
    expect(DURASI_KELUAR_MS).toBe(300);
    expect(durasiKeluar(() => ({ matches: false }))).toBe(300);
    expect(durasiKeluar(() => ({ matches: true }))).toBe(0);
    expect(durasiKeluar(undefined)).toBe(300);
    const overlay = fs.readFileSync(new URL('../components/ui/Overlay.jsx', import.meta.url), 'utf8');
    expect(overlay).toMatch(/responsive: \{[^}]*ms: 300/);
  });

  it('animasi kecil (isian Simpan/Batal, notifikasi) ada di hppAnim.css; gerakan dikurangi dihormati', () => {
    for (const k of ['hpp-reveal', 'hpp-toast-in']) expect(css).toContain(`@keyframes ${k}`);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*animation: none/);
    expect(css).not.toContain('hpp-panel');                      // animasi popup kini milik Overlay
  });

  it('semua popup HPP memakai Sheet yang sama (tidak ada dialog buatan sendiri)', () => {
    for (const f of ['MenuSheet.jsx', 'BahanSheet.jsx', 'ResepSheet.jsx', 'DampakSheet.jsx', 'SettingsSheet.jsx']) {
      const src = baca(f);
      expect(src, f).toMatch(/<Sheet\b/);
      expect(src, f).not.toMatch(/role="dialog"/);
    }
  });

  it('HppApp: tiga tab dengan jumlah, bilah tab + pencarian menempel (sticky), ringkasan margin; notifikasi dampak membuka popup Menu terdampak', () => {
    const src = baca('HppApp.jsx');
    expect(src).toMatch(/grid-cols-3/);
    expect(src).toMatch(/sticky top-14/);
    expect(src).toMatch(/ringkasanDaftar\(model\)/);
    expect(src).toMatch(/\{jumlah\[t\.key\]\}/);
    expect(src).toMatch(/placeholder="Cari bahan, saos, menu…"/);
    expect(src).toMatch(/tab === 'resep' && <ResepTab/);
    expect(src).toMatch(/<Snack /);
    expect(src).toMatch(/t: 'dampak'/);
    expect(src).toMatch(/<DampakSheet /);
  });

  it('HppApp: tab Resep / Menu adalah lapisan stack (Back kembali ke Bahan baku); alamat mengikuti tab lewat replaceState (bukan pushState)', () => {
    const src = baca('HppApp.jsx');
    expect(src).toMatch(/useBackLayer\(tab !== 'bahan', \(\) => setTab\('bahan'\)\)/);
    expect(src).toMatch(/history\.replaceState\(window\.history\.state/);
    expect(src).not.toMatch(/history\.pushState\(/);
    expect(src).not.toMatch(/addEventListener\('popstate'/);
  });

  it('form Edit/Update tidak menyimpan apa pun sebelum Simpan: tidak ada aksi simpan yang dipanggil saat render atau saat mengetik', () => {
    for (const f of ['BahanSheet.jsx', 'ResepSheet.jsx', 'MenuSheet.jsx']) {
      const src = baca(f);
      expect(src, f).not.toMatch(/onBlur/);
      expect(src, f).toMatch(/actions\.simpan(Bahan|Resep|Menu)\(/);
    }
  });

  it('daftar komposisi tidak mengubah database langsung: KomposisiForm tidak menerima actions', () => {
    const src = baca('KomposisiForm.jsx');
    expect(src).not.toMatch(/actions/);
    expect(src).not.toMatch(/hppRepo/);
  });
});

describe('notif keluar HPP (Back dari Menu): sama dengan ExitToast app utama', () => {
  const baca = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('tampil: teks "Ketuk lagi untuk keluar", role status, tidak menangkap sentuhan, z-[400] di atas popup', () => {
    const html = render(<NotifKeluar tampil />);
    expect(html).toContain('Ketuk lagi untuk keluar');
    expect(html).toContain('role="status"');
    expect(html).toContain('pointer-events-none');
    expect(html).toContain('z-[400]');
  });

  it('tidak tampil: tidak merender apa pun', () => {
    expect(render(<NotifKeluar tampil={false} />)).toBe('');
  });

  it('teks, kelas posisi, dan kelas pil identik dengan ExitToast app utama', () => {
    const utama = baca('../components/ui/ExitToast.jsx');
    const hpp = render(<NotifKeluar tampil />);
    expect(utama).toContain('Ketuk lagi untuk keluar');
    for (const kelas of ['fixed inset-x-0 z-[400] flex justify-center px-4', 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))]', 'short:bottom-[calc(4rem+env(safe-area-inset-bottom))]',
      'rounded-full bg-slate-900/95 px-4 py-2.5 text-sm font-semibold text-white shadow-lg']) {
      expect(utama, kelas).toContain(kelas);
      expect(hpp, kelas).toContain(kelas);
    }
  });

  it('animasi masuk/keluar 180 ms (sama dengan ExitToast: duration 0.18) dan hormati gerakan dikurangi', () => {
    const css = baca('./hppAnim.css');
    expect(baca('../components/ui/ExitToast.jsx')).toMatch(/duration: 0\.18/);
    expect(css).toMatch(/\.hpp-exit-in \{ animation: hpp-exit-in 180ms/);
    expect(css).toMatch(/\.hpp-exit-out \{ animation: hpp-exit-out 180ms/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)[\s\S]*hpp-exit-in/);
  });

  it('HppApp memasang notif di akar (juga saat memuat/galat) dan memakai useExitHint milik HPP', () => {
    const src = baca('./HppApp.jsx');
    expect(src).toMatch(/useExitHint\(\)/);
    expect(src).toMatch(/<NotifKeluar tampil=\{tampilKeluar\} \/>/);
  });
});

describe('daftar komposisi di form (KomposisiForm)', () => {
  it('menu: baris dengan takaran − +, tombol hapus berlabel, dan Tambah komponen (pemilih belum terbuka)', () => {
    const html = render(<KomposisiForm model={model} untuk={{ tipe: 'menu' }} draft={draftDariMenu(model.menu[0])} onChange={noop} />);
    expect(html).toContain('Ayam goreng');
    expect(html).toContain('Kemasan');
    expect(html).toContain('aria-label="Takaran Kemasan"');
    expect(html).toContain('aria-label="Hapus Kemasan"');
    expect(html).toContain('>pcs<');
    expect(html).toContain('>porsi<');
    expect(html).toContain('Tambah komponen');
    expect(html).not.toContain('Cari bahan');
  });

  it('draft kosong: tulisan "Belum ada komponen."', () => {
    expect(render(<KomposisiForm model={model} untuk={{ tipe: 'menu' }} draft={[]} onChange={noop} />)).toContain('Belum ada komponen.');
  });

  it('resep: komponen berupa sub-resep memakai satuan hasil resep itu (gr)', () => {
    const html = render(<KomposisiForm model={model} untuk={{ tipe: 'resep', resepId: 'porsi' }} draft={draftDariResep(model.resep.porsi)} onChange={noop} />);
    expect(html).toContain('aria-label="Takaran Saos"');
    expect(html).toContain('>gr<');
  });
});

describe('komponen baru popup/daftar HPP', () => {
  it('Sheet: isi boleh berupa fungsi yang menerima tutup()', () => {
    const html = render(<Sheet title="Tes" onClose={noop}>{(tutup) => <button type="button" onClick={tutup}>Tutup saya</button>}</Sheet>);
    expect(html).toContain('Tutup saya');
  });

  it('Stepper: tombol − dan + berlabel, kolom angka, dan awalan/akhiran', () => {
    const html = render(<Stepper value="38000" onChange={noop} step={500} awalan="Rp" akhiran="gr" ariaLabel="Harga" />);
    expect(html).toContain('aria-label="Kurangi Harga"');
    expect(html).toContain('aria-label="Tambah Harga"');
    expect(html).toContain('value="38000"');
    expect(html).toContain('>Rp<');
    expect(html).toContain('>gr<');
    expect(render(<Stepper value="abc" onChange={noop} ariaLabel="Harga" />)).toContain('aria-invalid="true"');
  });

  it('Sparkline: butuh minimal dua titik', () => {
    expect(render(<Sparkline nilai={[1]} />)).toBe('');
    expect(render(<Sparkline nilai={[1, 2, 3]} />)).toContain('<polyline');
  });

  it('Snack: tampil dengan tombol aksi, atau tidak merender apa pun tanpa pesan', () => {
    const html = render(<Snack pesan="Tersimpan · 3 menu terdampak" aksi="Lihat" onAksi={noop} onTutup={noop} />);
    expect(html).toContain('Tersimpan · 3 menu terdampak');
    expect(html).toContain('>Lihat<');
    expect(html).toContain('z-[60]');
    expect(render(<Snack pesan={null} onTutup={noop} />)).toBe('');
  });
});
