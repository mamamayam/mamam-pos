import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Modal memakai portal (butuh DOM); di uji SSR cukup dikosongkan. Yang diuji: apa yang tampil untuk staf vs owner,
// status gate, tombol Simpan, dan Riwayat.
vi.mock('../../components/ui', async (orig) => ({ ...(await orig()), Modal: () => null }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ triggerConfirm: () => {}, triggerAlert: () => {} }) }));
const auth = { owner: true };
const history = { rows: [], days: [] };
const opnameHist = { months: [], allMonths: [], error: '' };
const wasteState = { jenis: [], penyaluran: [], catatan: [], ready: true, loading: false, error: '' };
const pengisiState = { name: '' };
vi.mock('./stockPengisi', async (orig) => ({ ...(await orig()), readPengisi: () => pengisiState.name }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: (p) => (p === 'stok.kelola' ? auth.owner : false) }) }));

const item = (id, o = {}) => ({ id, category_id: 'c1', name: id.toUpperCase(), unit: 'pcs', min_qty: 0, required: true, ...o });
const master = [
  { id: 'c1', name: 'Minuman', items: [item('a', { min_qty: 5 }), item('b', { min_qty: 2 })] },
  { id: 'c2', name: 'Kulkas', items: [item('d', { category_id: 'c2' })] },
];
const stock = {
  loading: false, ready: true, error: '', master, fillMaster: master, opname: false, setOpname: async () => {}, day: null, today: '2026-10-26', counts: {}, latest: {}, locked: false, doneIds: [],
  reload: () => {}, setCount: () => {}, persist: async () => {}, flush: async () => {}, finishCategory: async () => {}, save: async () => {}, reopenDay: async () => {},
  addCategory: async () => {}, renameCategory: async () => {}, deleteCategory: async () => {}, moveCategory: async () => {},
  addItem: async () => {}, updateItem: async () => {}, deleteItem: async () => {}, moveItem: async () => {},
};
vi.mock('../../hook/useStockData', () => ({
  useStockData: () => stock,
  useStockHistory: () => ({ rows: history.rows, days: history.days, loading: false, error: '', reload: () => {}, loadCounts: async () => [] }),
  useStockEmployees: () => ({ names: ['Dewi', 'Sri Depi'], loading: false, error: '', reload: () => {} }),
}));
vi.mock('../../hook/useOpname', () => ({
  OPNAME_MIGRATION_HINT: 'Stok Opname belum aktif',
  useOpnameHistory: () => ({ ...opnameHist, loading: false, reload: () => {}, loadDetail: async () => [] }),
}));
vi.mock('../../hook/useWaste', () => ({
  useWaste: () => ({
    ...wasteState, reload: () => {}, addNote: async () => {}, addJenis: async () => {}, updateJenis: async () => {}, deleteJenis: async () => {},
    addPenyaluran: async () => {}, updatePenyaluran: async () => {}, deletePenyaluran: async () => {},
  }),
}));

import StockFill from './StockFill';
import StockView from './StockView';
import StockHistory from './StockHistory';
import StockManage from './StockManage';
import WasteView from './WasteView';
import { businessDate } from './stockMath';
import BypassCard from './BypassCard';
import { ABSENSI_URL } from './stockLinks';

// SSR menyisipkan <!-- --> di antara teks bersebelahan; dibuang supaya teks bisa dicocokkan utuh.
const clean = (html) => html.replace(/<!-- -->/g, '');
// Kelas Tailwind `disabled:` juga memuat kata "disabled"; yang dicek atribut HTML-nya saja.
const saveBtn = (html) => (html.match(/<button[^>]*data-testid="stok-simpan"[^>]*>/) || [''])[0];
const isDisabled = (tag) => /\sdisabled(="")?[\s>]/.test(tag);

beforeEach(() => {
  auth.owner = true;
  vi.stubEnv('VITE_STOCK_BYPASS_SECRET', '3132333435363738393031323334353637383930');
  Object.assign(stock, { day: null, counts: {}, latest: {}, locked: false, doneIds: [], opname: false, master, fillMaster: master });
  Object.assign(opnameHist, { months: [], allMonths: [], error: '' });
  Object.assign(wasteState, { jenis: [], penyaluran: [], catatan: [], ready: true, loading: false, error: '' });
  history.rows = []; history.days = [];
  pengisiState.name = '';
});

describe('StockFill (tab Isi, khusus staf)', () => {
  it('sebelum nama pengisi dipilih: hanya kartu nama (dropdown), kategori dan tombol Simpan belum tampil', () => {
    const html = clean(renderToString(<StockFill stock={stock} />));
    expect(html).toContain('data-testid="stok-pengisi-form"');
    expect(html).toContain('data-testid="stok-pengisi-select"');
    expect(html).toContain('Pilih nama');
    expect(html).not.toMatch(/<input[^>]*placeholder="Ketik nama"/);
    expect(html).toContain('Siapa yang mengisi stok hari ini?');
    expect(html).not.toContain('data-testid="stok-kategori-');
    expect(html).not.toContain('data-testid="stok-simpan"');
    expect(html).not.toContain('data-testid="bypass-card"');
  });
  it('setelah nama dipilih: kategori tampil dengan nama pengisi dan tombol Ganti', () => {
    pengisiState.name = 'Dewi';
    const html = clean(renderToString(<StockFill stock={stock} />));
    expect(html).not.toContain('data-testid="stok-pengisi-form"');
    expect(html).toContain('data-testid="stok-kategori-c1"');
    expect(html).toMatch(/Diisi oleh <span[^>]*>Dewi</);
    expect(html).toContain('>Ganti<');
  });
  it('gate terkunci sebelum disimpan dan Simpan nonaktif dengan alasannya', () => {
    pengisiState.name = 'Dewi';
    const html = renderToString(<StockFill stock={stock} />);
    expect(html).toContain('Absen pulang terkunci');
    expect(saveBtn(html)).not.toBe('');
    expect(isDisabled(saveBtn(html))).toBe(true);
    expect(html).toContain('kategori belum ditandai selesai');
  });
  it('semua kategori selesai dan terisi: Simpan aktif', () => {
    pengisiState.name = 'Dewi';
    Object.assign(stock, { doneIds: ['c1', 'c2'], counts: { a: { qty: 1 }, b: { qty: 0 }, d: { qty: 4 } } });
    const tag = saveBtn(renderToString(<StockFill stock={stock} />));
    expect(tag).not.toBe('');
    expect(isDisabled(tag)).toBe(false);
  });
  it('sudah disimpan: gate terbuka, tanpa tombol Simpan dan tanpa kartu nama, dengan tautan ke web absensi', () => {
    Object.assign(stock, { locked: true, day: { saved_by: 'Dewi', saved_at: '2026-10-26T12:00:00Z' }, doneIds: ['c1', 'c2'] });
    const html = clean(renderToString(<StockFill stock={stock} />));
    expect(html).toContain('Absen pulang terbuka');
    expect(html).toContain('oleh Dewi');
    expect(html).toContain('Stok sudah selesai diisi.');
    expect(html).not.toContain('Isian terkunci');
    expect(html).toMatch(new RegExp(`<a href="${ABSENSI_URL.replace(/[.]/g, '\\.')}"[^>]*data-testid="stok-link-absen"`));
    expect(html).toContain('Isi absen pulang sekarang');
    expect(html).not.toContain('stok-simpan');
    expect(html).not.toContain('stok-pengisi-form');
    expect(html).not.toContain('>Buka<');
  });
  it('tautan absensi tidak muncul sebelum stok disimpan', () => {
    pengisiState.name = 'Dewi';
    expect(renderToString(<StockFill stock={stock} />)).not.toContain('stok-link-absen');
  });
});

describe('StockFill mode stok opname', () => {
  it('mati: tanpa banner opname', () => {
    pengisiState.name = 'Dewi';
    expect(renderToString(<StockFill stock={stock} />)).not.toContain('stok-opname-banner');
  });
  it('aktif: banner tampil dan semua item wajib (item opsional jadi wajib, tanpa tautan Lewati)', () => {
    pengisiState.name = 'Dewi';
    const opsional = [{ id: 'c1', name: 'Minuman', items: [item('a', { required: false }), item('b', { required: false })] }];
    const fill = opsional.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, required: true })) }));
    Object.assign(stock, { master: opsional, fillMaster: fill, opname: true });
    const html = clean(renderToString(<StockFill stock={stock} />));
    expect(html).toContain('data-testid="stok-opname-banner"');
    expect(html).toContain('Mode stok opname');
    expect(html).toMatch(/0\/2 wajib terisi/);
    expect(html).not.toContain('Lewati');
  });
});

describe('BypassCard (kartu kode di tab Bypass layar Absensi)', () => {
  it('hanya kode: tanpa lencana "Hanya owner" dan tanpa kalimat penjelasan', () => {
    const html = clean(renderToString(<BypassCard />));
    expect(html).toContain('data-testid="bypass-card"');
    expect(html).toContain('Kode Bypass Absen Pulang');
    expect(html).not.toContain('Hanya owner');
    expect(html).not.toContain('Beri kode');
    expect(html).toMatch(/Berganti dalam \d+ detik\./);
  });
  it('tanpa rahasia terpasang: petunjuk, bukan kode', () => {
    vi.stubEnv('VITE_STOCK_BYPASS_SECRET', '');
    const html = renderToString(<BypassCard />);
    expect(html).not.toContain('data-testid="bypass-card"');
    expect(html).toContain('Kode bypass belum diatur');
  });
});

describe('StockView', () => {
  it('staf: dua tab (Isi Stok, Waste), langsung tab Isi; tanpa Riwayat dan Kelola', () => {
    auth.owner = false;
    pengisiState.name = 'Dewi';
    const html = clean(renderToString(<StockView />));
    expect(html).toContain('data-testid="stok-isi"');
    expect(html).toContain('>Isi Stok<');
    expect(html).toContain('>Waste<');
    expect(html).not.toContain('Riwayat');
    expect(html).not.toContain('Kelola');
  });
  it('owner: tiga tab (Riwayat, Waste, Kelola), Riwayat paling depan dan langsung terbuka; tanpa tab Isi, Bypass, Ringkasan', () => {
    const html = clean(renderToString(<StockView />));
    for (const t of ['Riwayat', 'Waste', 'Kelola']) expect(html).toContain(`>${t}<`);
    expect(html).not.toContain('>Isi');
    expect(html).not.toContain('>Bypass<');   // kode bypass pindah ke layar Absensi
    expect(html).not.toContain('Ringkasan');
    expect(html.indexOf('>Riwayat<')).toBeLessThan(html.indexOf('>Waste<'));
    expect(html.indexOf('>Waste<')).toBeLessThan(html.indexOf('>Kelola<'));
    expect(html).toContain('RIWAYAT STOK BELANJA HARIAN');
    expect(html).toContain('STOK OPNAME');
    expect(html).toContain('Belum ada riwayat');
  });
  it('migrasi belum dijalankan: petunjuk', () => {
    Object.assign(stock, { ready: false, error: 'Stok Belanja belum aktif: jalankan migrasi' });
    expect(renderToString(<StockView />)).toContain('belum aktif');
    Object.assign(stock, { ready: true, error: '' });
  });
});

describe('StockHistory (tab Riwayat)', () => {
  const day = (d, counts) => ({ day: d, saved_by: 'Dewi', saved_at: `${d}T12:00:00Z`, counts });
  it('harian: tiap hari satu baris (tanggal, pengisi, jumlah habis dan menipis) plus tombol Pilih hari lain', () => {
    history.rows = [day('2026-10-25', [{ item_id: 'a', qty: 0 }, { item_id: 'b', qty: 2 }, { item_id: 'd', qty: 9 }])];
    history.days = history.rows;
    const html = clean(renderToString(<StockHistory stock={stock} />));
    expect(html).toContain('Min, 25 Okt 2026');
    expect(html).toContain('diisi Dewi');
    expect(html).toContain('1 habis');
    expect(html).toContain('1 menipis');
    expect(html).toContain('data-testid="stok-pilih-hari-btn"');
    expect(html).toContain('Pilih hari lain');
  });
  it('hanya 3 hari terbaru yang ditampilkan di baris (sisanya lewat Pilih hari lain)', () => {
    const rows = ['2026-10-31', '2026-10-30', '2026-10-29'].map((d) => day(d, []));
    history.rows = rows;
    history.days = [...rows, day('2026-10-28', [])];
    const html = clean(renderToString(<StockHistory stock={stock} />));
    expect(html.match(/data-testid="stok-hari-baris-/g)).toHaveLength(3);
    expect(html).not.toContain('stok-hari-baris-2026-10-28');
  });
  it('opname: saklar mati, tiga bulan, bulan tanpa hitungan penuh tertulis belum dihitung, dan peringatan item tanpa harga', () => {
    opnameHist.months = [
      { ym: '2026-11', row: null, total: null, missing: 0 },
      { ym: '2026-10', row: { day: '2026-10-31', saved_by: 'Budi' }, total: 4500000, missing: 0 },
      { ym: '2026-09', row: { day: '2026-09-30', saved_by: 'Sari' }, total: 3800000, missing: 2 },
    ];
    opnameHist.allMonths = [{ ym: '2026-10', row: { day: '2026-10-31' } }];
    const html = clean(renderToString(<StockHistory stock={stock} />));
    expect(html).toContain('data-testid="opname-saklar"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('Mode stok opname');
    expect(html).toContain('Mati.');
    expect(html).toContain('November 2026');
    expect(html).toContain('belum dihitung');
    expect(html).toContain('Rp 4.500.000');
    expect(html).toContain('Rp 3.800.000');
    expect(html).toContain('2 item tanpa harga');
    expect(html).toContain('Pilih bulan lain');
    expect(html).toContain('data-testid="opname-tanpa-harga"');   // item d (tanpa harga) di master contoh
    expect(html.indexOf('RIWAYAT STOK BELANJA HARIAN')).toBeLessThan(html.indexOf('STOK OPNAME'));
  });
  it('opname aktif: saklar menyala dan keterangan Aktif', () => {
    stock.opname = true;
    const html = clean(renderToString(<StockHistory stock={stock} />));
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Aktif: semua item wajib');
  });
  it('migrasi 022 belum jalan: bagian opname menampilkan petunjuk, bagian harian tetap', () => {
    opnameHist.error = 'Stok Opname belum aktif: jalankan 022';
    const html = clean(renderToString(<StockHistory stock={stock} />));
    expect(html).toContain('Stok Opname belum aktif');
    expect(html).toContain('RIWAYAT STOK BELANJA HARIAN');
  });
});

describe('Kelola: dua card tertutup', () => {
  it('Wajib/opsional dan Harga modal tampil sebagai card tertutup di atas Kelola yang lama', () => {
    const html = clean(renderToString(<StockManage stock={stock} />));
    expect(html).toContain('data-testid="kelola-wajib"');
    expect(html).toContain('data-testid="kelola-harga"');
    expect(html).toContain('3 wajib · 0 opsional');
    expect(html).toContain('0 terisi · 3 belum ada harga');
    expect(html.indexOf('kelola-wajib')).toBeLessThan(html.indexOf('kelola-harga'));
    expect(html.indexOf('kelola-harga')).toBeLessThan(html.indexOf('kelola-item-a'));   // Kelola lama tetap ada di bawahnya
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="wajib-a"');   // isi baru terlihat setelah dibuka
  });
  it('ringkasan harga: semua terisi', () => {
    const priced = master.map((c) => ({ ...c, items: c.items.map((i) => ({ ...i, unit_cost: 1000 })) }));
    const html = clean(renderToString(<StockManage stock={{ ...stock, master: priced }} />));
    expect(html).toContain('Semua 3 item sudah ada harga');
  });
});

describe('Waste', () => {
  const jenis = [{ id: 'j1', name: 'Dada', price: 9000 }, { id: 'j2', name: 'Sayap', price: 0 }];
  const penyaluran = [{ id: 'p1', name: 'Dimakan karyawan' }, { id: 'p2', name: 'Dibuang' }];
  const note = { id: 'n1', day: businessDate(), recorded_by: 'Budi', penyaluran: 'Dibuang', total_qty: 4, total_value: 36000, rows: [{ type: 'Dada', qty: 4, price: 9000 }] };
  it('staf: form (jenis × porsi, penyaluran, diisi oleh, Simpan), tanpa harga dan tanpa pilihan owner', () => {
    auth.owner = false;
    Object.assign(wasteState, { jenis, penyaluran, catatan: [note] });
    const html = clean(renderToString(<WasteView manage={false} />));
    expect(html).toContain('data-testid="waste-form"');
    expect(html).toContain('Jenis ayam × porsi');
    expect(html).toContain('Tambah baris');
    expect(html).toContain('data-testid="waste-penyaluran"');
    expect(html).toContain('data-testid="waste-pengisi"');
    expect(html).toContain('Simpan Waste');
    expect(html).toMatch(/Belum bisa disimpan: isi jenis dan porsi, pilih penyaluran, pilih nama\./);
    expect(isDisabled((html.match(/<button[^>]*data-testid="waste-simpan"[^>]*>/) || [''])[0])).toBe(true);
    // catatan hari ini: deskripsi ada, nilai rupiah tidak
    expect(html).toContain('data-testid="waste-hari-ini"');
    expect(html).toContain('Dada 4');
    expect(html).not.toContain('Rp');
    expect(html).not.toContain('Pilihan waste');
    expect(html).not.toContain('waste-ringkasan');
  });
  it('owner: ringkasan bulan (total kerugian, per jenis), daftar catatan dengan nilai, dan Pilihan waste; tanpa form catat', () => {
    Object.assign(wasteState, { jenis, penyaluran, catatan: [note] });
    const html = clean(renderToString(<WasteView manage />));
    expect(html).toContain('data-testid="waste-ringkasan"');
    expect(html).toContain('Rp 36.000');
    expect(html).toContain('1 catatan · 4 porsi');
    expect(html).toContain('data-testid="waste-catatan"');
    expect(html).toContain('data-testid="waste-pilihan"');
    expect(html).toContain('Pilihan waste');
    expect(html).toContain('1 jenis belum punya harga (Sayap)');
    expect(html).not.toContain('data-testid="waste-form"');
  });
  it('migrasi 022 belum jalan: petunjuk', () => {
    Object.assign(wasteState, { ready: false, error: 'Waste belum aktif: jalankan 022' });
    expect(renderToString(<WasteView manage={false} />)).toContain('Waste belum aktif');
  });
});
