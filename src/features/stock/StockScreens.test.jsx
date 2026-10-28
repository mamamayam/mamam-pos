import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Modal memakai portal (butuh DOM); di uji SSR cukup dikosongkan. Yang diuji: apa yang tampil untuk staf vs owner,
// status gate, tombol Simpan, dan Riwayat.
vi.mock('../../components/ui', async (orig) => ({ ...(await orig()), Modal: () => null }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ triggerConfirm: () => {}, triggerAlert: () => {} }) }));
const auth = { owner: true };
const history = { rows: [] };
const pengisiState = { name: '' };
vi.mock('./stockPengisi', async (orig) => ({ ...(await orig()), readPengisi: () => pengisiState.name }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: (p) => (p === 'stok.kelola' ? auth.owner : false) }) }));

const item = (id, o = {}) => ({ id, category_id: 'c1', name: id.toUpperCase(), unit: 'pcs', min_qty: 0, required: true, ...o });
const master = [
  { id: 'c1', name: 'Minuman', items: [item('a', { min_qty: 5 }), item('b', { min_qty: 2 })] },
  { id: 'c2', name: 'Kulkas', items: [item('d', { category_id: 'c2' })] },
];
const stock = {
  loading: false, ready: true, error: '', master, day: null, today: '2026-10-26', counts: {}, latest: {}, locked: false, doneIds: [],
  reload: () => {}, setCount: () => {}, persist: async () => {}, flush: async () => {}, finishCategory: async () => {}, save: async () => {}, reopenDay: async () => {},
  addCategory: async () => {}, renameCategory: async () => {}, deleteCategory: async () => {}, moveCategory: async () => {},
  addItem: async () => {}, updateItem: async () => {}, deleteItem: async () => {}, moveItem: async () => {},
};
vi.mock('../../hook/useStockData', () => ({
  useStockData: () => stock,
  useStockHistory: () => ({ rows: history.rows, loading: false, error: '', reload: () => {} }),
  useStockEmployees: () => ({ names: ['Dewi', 'Sri Depi'], loading: false, error: '', reload: () => {} }),
}));

import StockFill from './StockFill';
import StockView from './StockView';
import StockHistory from './StockHistory';
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
  Object.assign(stock, { day: null, counts: {}, latest: {}, locked: false, doneIds: [] });
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
  it('staf: langsung tab Isi tanpa tab lain', () => {
    auth.owner = false;
    pengisiState.name = 'Dewi';
    const html = renderToString(<StockView />);
    expect(html).toContain('data-testid="stok-isi"');
    expect(html).not.toContain('Riwayat');
    expect(html).not.toContain('Kelola');
  });
  it('owner: dua tab (Riwayat, Kelola), Riwayat paling depan dan langsung terbuka; tanpa tab Isi, Bypass, Ringkasan', () => {
    history.rows = [];
    const html = renderToString(<StockView />);
    for (const t of ['Riwayat', 'Kelola']) expect(html).toContain(t);
    expect(html).not.toContain('>Isi<');
    expect(html).not.toContain('>Bypass<');   // kode bypass pindah ke layar Absensi
    expect(html).not.toContain('Ringkasan');
    expect(html.indexOf('Riwayat')).toBeLessThan(html.indexOf('>Kelola<'));
    expect(html).toContain('Belum ada riwayat');
  });
  it('migrasi belum dijalankan: petunjuk', () => {
    Object.assign(stock, { ready: false, error: 'Stok Belanja belum aktif: jalankan migrasi' });
    expect(renderToString(<StockView />)).toContain('belum aktif');
    Object.assign(stock, { ready: true, error: '' });
  });
});

describe('StockHistory (tab Riwayat)', () => {
  it('tiap hari tampil sebagai satu baris ringkas yang bisa diketuk, tanpa badge habis/menipis/aman', () => {
    history.rows = [{ day: '2026-10-25', saved_by: 'Dewi', saved_at: '2026-10-25T12:00:00Z', counts: [{ item_id: 'a', qty: 0 }, { item_id: 'b', qty: 2 }, { item_id: 'd', qty: 9 }] }];
    const html = clean(renderToString(<StockHistory master={master} enabled />));
    expect(html).toContain('Min, 25 Okt');
    expect(html).toContain('Dewi');
    expect(html).not.toMatch(/\d+ (habis|menipis|aman)/);
    expect(html).toMatch(/<(button|div)[^>]*role="button"|<button/);   // Card dengan onClick = bisa diketuk
    history.rows = [];
  });
});
