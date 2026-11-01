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
import KomposisiPicker from './KomposisiPicker.jsx';
import { NumberField, NotifKeluar, Sheet, Snack, Sparkline, Stepper, statusIsian, durasiKeluar, DURASI_KELUAR_MS } from './ui.jsx';

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

  it('tab Menu: kategori menguncup di awal; ada pencarian, tanpa chip kategori dan pil margin', () => {
    const html = render(<MenuTab model={model} onOpen={noop} onAcuan={noop} adaPerubahan={false} />);
    expect(html).toContain('Cari menu');
    expect(html).not.toContain('Margin LOW');
    expect(html).not.toContain('Margin HIGH');
    expect(html).not.toContain('aria-pressed');
    expect(html).not.toContain('Semua 2');
    expect(html).toContain('Paket · 1');
    expect(html).toContain('Satuan · 1');
    expect(html).not.toContain('Paket Ayam');                 // isi kategori belum terbuka
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('Jadikan harga sekarang sebagai acuan');
  });

  it('tab Menu: kategori terbuka menampilkan modal, harga jual, dan margin per menu', () => {
    const html = render(<MenuTab model={model} onOpen={noop} onAcuan={noop} adaPerubahan={false} awalBuka />);
    expect(html).toContain('Paket Ayam');
    expect(html).toContain('Modal Rp1.730');
    expect(html).toContain('Jual Rp10.000');
    expect(html).toContain('82,7% HIGH');
    expect(html).not.toContain('Riwayat modal');              // detail baris belum dibuka
  });

  it('tab Menu: detail baris = komposisi, modal/jual/profit, riwayat modal turunan, dan tombol Edit', () => {
    const html = render(<MenuTab model={model} onOpen={noop} onAcuan={noop} adaPerubahan={false} awalBuka awalTerbuka={['m1']} />);
    expect(html).toContain('Ayam goreng');
    expect(html).toContain('Biaya lain');
    expect(html).toContain('Profit');
    expect(html).toContain('Riwayat modal');
    expect(html).toContain('Rp1.704');                        // modal saat Ayam masih Rp800/kg
    expect(html).toContain('▲ 1,5%');
    expect(html).toContain('>Edit<');
  });

  it('tab Menu: tombol acuan muncul saat ada perubahan; SEDANG tampil di baris saat batas dipisah', () => {
    const m2 = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 40, hi: 90 } }] });
    const html = render(<MenuTab model={m2} onOpen={noop} onAcuan={noop} adaPerubahan awalBuka />);
    expect(html).toContain('82,7% SEDANG');
    expect(html).toContain('Jadikan harga sekarang sebagai acuan');
  });

  it('tab Bahan baku: kategori menguncup di awal, tanpa chip kategori', () => {
    const html = render(<BahanTab model={model} onOpen={noop} />);
    expect(html).toContain('Cari bahan');
    expect(html).toContain('Primer · 1');
    expect(html).toContain('Lainnya · 1');
    expect(html).not.toContain('Semua 3');
    expect(html).not.toContain('Rp50.000');                   // isi Packaging belum terbuka
    expect(html).toContain('1 bahan');                        // catatan bahan tanpa harga
  });

  it('tab Bahan baku: baris menampilkan satuan, harga per unit dasar, perubahan terakhir, dan bahan tanpa harga', () => {
    const html = render(<BahanTab model={model} onOpen={noop} awalBuka />);
    expect(html).toContain('per kg (1.000 gr)');
    expect(html).toContain('Rp1.000');
    expect(html).toContain('≈ Rp1/gr');
    expect(html).toContain('▲ 25,0%');
    expect(html).toContain('Harga awal');                     // Kemasan belum pernah berubah
    expect(html).toContain('Belum diisi');
    expect(html).toContain('Lainnya');                        // Garam tanpa kategori
    expect(html).not.toContain('dipakai di');
    expect(html).not.toContain('Riwayat harga');              // detail baris belum dibuka
  });

  it('tab Bahan baku: detail baris = riwayat terbaru dulu + tombol Update harga (Isi harga bila kosong)', () => {
    const html = render(<BahanTab model={model} onOpen={noop} awalBuka awalTerbuka={['A', 'C']} />);
    expect(html).toContain('Riwayat harga');
    expect(html).toContain('Update harga');
    expect(html).toContain('Isi harga');
    expect(html).toContain('Harga belum diisi');
    expect(html.indexOf('▲ 25,0%')).toBeLessThan(html.indexOf('>awal<'));
    expect(html).not.toContain('Lihat semua');                // hanya 2 entri
  });

  it('tab Resep: grup menguncup di awal; baris menampilkan hasil, modal, dan penanda belum diisi', () => {
    const tutup = render(<ResepTab model={model} onOpen={noop} />);
    expect(tutup).toContain('Cari resep');
    expect(tutup).toContain('Menu utama · 1');
    expect(tutup).toContain('Saos · 1');
    expect(tutup).not.toContain('Hasil 1.000 gr');
    const buka = render(<ResepTab model={model} onOpen={noop} awalBuka />);
    expect(buka).toContain('Hasil 1.000 gr');
    expect(buka).toContain('Rp2.600');
    expect(buka).toContain('Per porsi · 2 bahan');
    expect(buka).toContain('Rp230');
    const kosong = buildModel({ ...RAW, resepItem: [] });
    expect(render(<ResepTab model={kosong} onOpen={noop} awalBuka />)).toContain('Belum diisi');
  });

  it('tab Resep: detail baris = isi, total/hasil/per unit, riwayat modal, dan tombol Edit', () => {
    const html = render(<ResepTab model={model} onOpen={noop} awalBuka awalTerbuka={['saos']} />);
    expect(html).toContain('Kemasan');
    expect(html).toContain('Total batch');
    expect(html).toContain('Per gr');
    expect(html).toContain('Riwayat modal');
    expect(html).toContain('Rp2.480');                        // saat Ayam masih Rp800/kg
    expect(html).toContain('>Edit<');
  });

  it('popup menu: modal, komposisi, biaya lain, dan saran harga minimal bila belum HIGH', () => {
    const html = render(<MenuSheet model={model} menuId="m1" actions={actions} onClose={noop} />);
    expect(html).toContain('Rp1.730');
    expect(html).toContain('Komposisi modal');
    expect(html).toContain('Ayam goreng');
    expect(html).toContain('Biaya lain');
    expect(html).not.toContain('harga jual minimal');
    const low = buildModel({ ...RAW, setting: [{ key: 'margin', value: { lo: 90, hi: 90 } }] });
    expect(render(<MenuSheet model={low} menuId="m1" actions={actions} onClose={noop} />)).toContain('harga jual minimal Rp17.500');
  });

  it('popup bahan = Update harga: harga per satuan dengan tombol − +, satuan disembunyikan di balik Ubah, tanpa persentase', () => {
    const html = render(<BahanSheet model={model} bahanId="A" actions={actions} onClose={noop} />);
    expect(html).toContain('Update harga');
    expect(html).toContain('Harga per kg');
    expect(html).toContain('aria-label="Kurangi Harga baru"');
    expect(html).toContain('aria-label="Tambah Harga baru"');
    expect(html).toContain('Satuan: <b class="text-slate-800">kg (1.000 gr)</b>');
    expect(html).toContain('>Ubah<');
    expect(html).toContain('Rp1.000/kg ÷ 1.000 gr = <b class="text-slate-900">Rp1</b>/gr');
    expect(html).not.toContain('+10%');
    expect(html).not.toContain('−10%');
    expect(html).not.toContain('renceng');                    // pilihan satuan tersembunyi
    expect(html).not.toContain('Riwayat harga');              // riwayat ada di detail baris
    expect(html).not.toContain('Lihat menu terdampak');       // belum ada perubahan
    expect(html).toMatch(/disabled=""[^>]*>Simpan</);         // belum ada perubahan = Simpan nonaktif
  });

  it('popup bahan: tombol Ubah membuka pilihan satuan, isi per satuan, dan kategori', () => {
    const html = render(<BahanSheet model={model} bahanId="A" actions={actions} onClose={noop} awalUbah />);
    expect(html).toContain('Satuan beli');
    expect(html).toContain('>renceng<');
    expect(html).toContain('Isi per kg (dibagi per gr)');
    expect(html).toContain('Kategori bahan');
    expect(html).toContain('>Primer<');
    expect(html).not.toContain('>Ubah<');
  });

  it('popup bahan tanpa harga: kolom kosong, Simpan nonaktif', () => {
    const html = render(<BahanSheet model={model} bahanId="C" actions={actions} onClose={noop} />);
    expect(html).toContain('belum diisi');
    expect(html).toContain('Isi harga dan isi per satuan');
    expect(html).toMatch(/disabled=""[^>]*>Simpan</);
  });

  it('popup menu terdampak: dikelompokkan per kategori menu, modal sebelum → sesudah dan persennya', () => {
    const d = dampakUbah(model, 'A', { harga: 2000 });
    const html = render(<DampakSheet model={model} judul="Ayam: Rp1 → Rp2/gr" rows={d.rows} onClose={noop} />);
    expect(html).toContain('Menu terdampak');
    expect(html).toContain('Ayam: Rp1 → Rp2/gr');
    expect(html).toContain('Paket · 1');
    expect(html).toContain('Paket Ayam');
    expect(html).toContain('Rp1.730 → Rp1.860');
    expect(html).toContain('▲ 7,5%');
    expect(html).toContain('>Tutup<');
    expect(render(<DampakSheet model={model} judul="x" rows={[]} onClose={noop} />)).toContain('Tidak ada menu yang berubah modalnya');
  });

  it('popup resep: modal, isi resep, dan tombol Ubah isi (mode ubah belum aktif)', () => {
    const html = render(<ResepSheet model={model} resepId="porsi" actions={actions} onClose={noop} />);
    expect(html).toContain('Ayam goreng');
    expect(html).toContain('Modal per porsi');
    expect(html).toContain('Rp230');
    expect(html).toContain('Isi resep');
    expect(html).toContain('Ubah isi');
    expect(html).not.toContain('Tambah ke resep');
    const kosong = buildModel({ ...RAW, resepItem: [] });
    expect(render(<ResepSheet model={kosong} resepId="saos" actions={actions} onClose={noop} />)).toContain('Isi resep belum diisi');
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

describe('isian harga: tersimpan hanya lewat tombol Simpan', () => {
  it('statusIsian: belum diketik / valid beda / sama / tidak valid / negatif / kosong', () => {
    expect(statusIsian(null, 1000)).toEqual({ kotor: false, valid: false, bisaSimpan: false, nilai: null });
    expect(statusIsian('1.500', 1000)).toEqual({ kotor: true, valid: true, bisaSimpan: true, nilai: 1500 });
    expect(statusIsian('1000', 1000)).toMatchObject({ kotor: true, valid: true, bisaSimpan: false });    // sama dengan yang tersimpan
    expect(statusIsian('abc', 1000)).toMatchObject({ kotor: true, valid: false, bisaSimpan: false });
    expect(statusIsian('-5', 1000)).toMatchObject({ valid: false, bisaSimpan: false });
    expect(statusIsian('', 1000)).toMatchObject({ kotor: true, valid: false, bisaSimpan: false });       // dikosongkan: tidak boleh disimpan
    expect(statusIsian('500', null)).toMatchObject({ bisaSimpan: true });                                // bahan yang belum berharga
  });

  it('belum diubah: hanya kolom, tanpa tombol Simpan/Batal', () => {
    const html = render(<NumberField value={1000} ariaLabel="Harga Tes" onCommit={noop} />);
    expect(html).toContain('value="1000"');
    expect(html).not.toContain('Simpan');
    expect(html).not.toContain('Batal');
  });

  it('sudah diketik: muncul Simpan (aktif) dan Batal, nilai ketikan tampil', () => {
    const html = render(<NumberField value={1000} ariaLabel="Harga Tes" onCommit={noop} awal="1500" />);
    expect(html).toContain('value="1500"');
    expect(html).toContain('aria-label="Simpan Harga Tes"');
    expect(html).toContain('aria-label="Batal ubah Harga Tes"');
    expect(html).not.toMatch(/disabled=""[^>]*aria-label="Simpan Harga Tes"/);
  });

  it('ketikan tidak valid atau sama dengan yang tersimpan: Simpan nonaktif', () => {
    expect(render(<NumberField value={1000} ariaLabel="Harga Tes" onCommit={noop} awal="abc" />)).toMatch(/disabled=""[^>]*aria-label="Simpan Harga Tes"/);
    expect(render(<NumberField value={1000} ariaLabel="Harga Tes" onCommit={noop} awal="1000" />)).toMatch(/disabled=""[^>]*aria-label="Simpan Harga Tes"/);
    expect(render(<NumberField value={1000} ariaLabel="Harga Tes" onCommit={noop} awal="abc" />)).toContain('aria-invalid="true"');
  });

  it('satuan (suffix) ikut tampil di samping kolom', () => {
    expect(render(<NumberField value={1000} ariaLabel="Harga Tes" onCommit={noop} suffix={<i>/kg</i>} />)).toContain('<i>/kg</i>');
  });

  it('keluar dari kolom TIDAK menyimpan: tidak ada onBlur di NumberField', () => {
    const src = fs.readFileSync(new URL('./ui.jsx', import.meta.url), 'utf8');
    const nf = src.slice(src.indexOf('export function NumberField'), src.indexOf('/** Panel gelap'));
    expect(nf).not.toMatch(/onBlur/);
    expect(nf).toMatch(/onCommit\(s\.nilai\)/);
  });

  it('popup menu (belum ada yang diketik): tidak ada tombol Simpan yang menggantung', () => {
    expect(render(<MenuSheet model={model} menuId="m1" actions={actions} onClose={noop} />)).not.toContain('>Simpan<');
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

  it('HppApp: tiga tab (Bahan baku, Resep, Menu); notifikasi dampak setelah harga berubah membuka popup Menu terdampak', () => {
    const src = baca('HppApp.jsx');
    expect(src).toMatch(/grid-cols-3/);
    expect(src).toMatch(/tab === 'resep' && <ResepTab/);
    expect(src).toMatch(/<Snack /);
    expect(src).toMatch(/t: 'dampak'/);
    expect(src).toMatch(/<DampakSheet /);
  });

  it('HppApp: tab Bahan baku / Resep adalah lapisan stack; alamat mengikuti tab lewat replaceState (bukan pushState)', () => {
    const src = baca('HppApp.jsx');
    expect(src).toMatch(/useBackLayer\(tab !== 'menu', \(\) => setTab\('menu'\)\)/);
    expect(src).toMatch(/history\.replaceState\(window\.history\.state/);
    expect(src).not.toMatch(/history\.pushState\(/);
    expect(src).not.toMatch(/addEventListener\('popstate'/);
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

describe('ubah komposisi', () => {
  it('popup menu: tombol Ubah komposisi ada; mode ubah belum aktif (tanpa Tambah komponen)', () => {
    const html = render(<MenuSheet model={model} menuId="m1" actions={actions} onClose={noop} />);
    expect(html).toContain('Ubah komposisi');
    expect(html).not.toContain('Tambah komponen');
    expect(html).not.toContain('Hapus Kemasan');
  });

  it('baris Biaya lain selalu ada, juga saat nilainya 0 (supaya bisa diisi lagi)', () => {
    const nol = buildModel({ ...RAW, menu: RAW.menu.map((m) => (m.id === 'm1' ? { ...m, biaya_lain: 0 } : m)) });
    const html = render(<MenuSheet model={nol} menuId="m1" actions={actions} onClose={noop} />);
    expect(html).toContain('Biaya lain');
    expect(html).toContain('aria-label="Biaya lain"');
  });

  it('picker menu: tab Bahan/Resep, pencarian, daftar bahan; yang sudah ada dinonaktifkan; Tambah nonaktif sebelum memilih', () => {
    const html = render(<KomposisiPicker model={model} untuk={{ tipe: 'menu' }} sudah={['b:B']} biayaLain={500} onTambah={noop} onBatal={noop} />);
    expect(html).toContain('Cari bahan');
    expect(html).toContain('>Bahan<');
    expect(html).toContain('>Resep<');
    expect(html).toContain('Ayam');
    expect(html).toContain('sudah ada');
    expect(html).toMatch(/disabled=""[^>]*>Tambah</);
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
