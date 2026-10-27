import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Modal memakai portal (butuh DOM); di uji SSR cukup dikosongkan. Yang diuji: apa yang tampil untuk staf vs owner,
// status gate, tombol Simpan, dan hitungan Ringkasan.
vi.mock('../../components/ui', async (orig) => ({ ...(await orig()), Modal: () => null }));
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ triggerConfirm: () => {}, triggerAlert: () => {} }) }));
const auth = { owner: true };
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
  useStockHistory: () => ({ rows: [], loading: false, error: '', reload: () => {} }),
}));

import StockFill from './StockFill';
import StockSummary from './StockSummary';
import StockView from './StockView';

// SSR menyisipkan <!-- --> di antara teks bersebelahan; dibuang supaya teks bisa dicocokkan utuh.
const clean = (html) => html.replace(/<!-- -->/g, '');
// Kelas Tailwind `disabled:` juga memuat kata "disabled"; yang dicek atribut HTML-nya saja.
const saveBtn = (html) => (html.match(/<button[^>]*data-testid="stok-simpan"[^>]*>/) || [''])[0];
const isDisabled = (tag) => /\sdisabled(="")?[\s>]/.test(tag);

beforeEach(() => {
  auth.owner = true;
  vi.stubEnv('VITE_STOCK_BYPASS_SECRET', '3132333435363738393031323334353637383930');
  Object.assign(stock, { day: null, counts: {}, latest: {}, locked: false, doneIds: [] });
});

describe('StockFill (tab Isi)', () => {
  it('staf: hanya mengisi, tanpa kartu kode bypass', () => {
    const html = renderToString(<StockFill stock={stock} manage={false} />);
    expect(html).toContain('data-testid="stok-isi"');
    expect(html).not.toContain('data-testid="bypass-card"');
  });
  it('owner: ada kartu kode bypass', () => {
    expect(renderToString(<StockFill stock={stock} manage />)).toContain('data-testid="bypass-card"');
  });
  it('owner tanpa rahasia terpasang: petunjuk, bukan kode', () => {
    vi.stubEnv('VITE_STOCK_BYPASS_SECRET', '');
    const html = renderToString(<StockFill stock={stock} manage />);
    expect(html).not.toContain('data-testid="bypass-card"');
    expect(html).toContain('Kode bypass belum diatur');
  });
  it('gate terkunci sebelum disimpan dan Simpan nonaktif dengan alasannya', () => {
    const html = renderToString(<StockFill stock={stock} manage={false} />);
    expect(html).toContain('Absen pulang terkunci');
    expect(saveBtn(html)).not.toBe('');
    expect(isDisabled(saveBtn(html))).toBe(true);
    expect(html).toContain('kategori belum ditandai selesai');
  });
  it('semua kategori selesai dan terisi: Simpan aktif', () => {
    Object.assign(stock, { doneIds: ['c1', 'c2'], counts: { a: { qty: 1 }, b: { qty: 0 }, d: { qty: 4 } } });
    const tag = saveBtn(renderToString(<StockFill stock={stock} manage={false} />));
    expect(tag).not.toBe('');
    expect(isDisabled(tag)).toBe(false);
  });
  it('sudah disimpan: gate terbuka, tanpa tombol Simpan; hanya owner melihat tombol Buka', () => {
    Object.assign(stock, { locked: true, day: { saved_by: 'Dewi', saved_at: '2026-10-26T12:00:00Z' }, doneIds: ['c1', 'c2'] });
    const staff = clean(renderToString(<StockFill stock={stock} manage={false} />));
    expect(staff).toContain('Absen pulang terbuka');
    expect(staff).toContain('oleh Dewi');
    expect(staff).not.toContain('stok-simpan');
    expect(staff).not.toContain('>Buka<');
    expect(renderToString(<StockFill stock={stock} manage />)).toContain('>Buka<');
  });
});

describe('StockSummary (tab Ringkasan)', () => {
  it('menghitung Habis / Menipis dan perlu dibeli dari stok tersimpan', () => {
    const latest = { a: { qty: 0, day: '2026-10-25', saved_by: 'Dewi' }, b: { qty: 2 }, d: { qty: 9 } };   // a habis, b menipis (<= 2), d aman
    const html = clean(renderToString(<StockSummary master={master} latest={latest} />));
    expect(html).toMatch(/data-testid="stok-perlu-dibeli"[^>]*>2 item</);
    expect(html).toContain('1 habis');
    expect(html).toContain('1 menipis');
    expect(html).toContain('Terakhir disimpan Min, 25 Okt · Dewi');
  });
  it('baris aksi menyebut filter aktif dan jumlah item yang akan disalin', () => {
    const latest = { a: { qty: 0 }, b: { qty: 2 }, d: { qty: 9 } };
    const html = clean(renderToString(<StockSummary master={master} latest={latest} />));
    expect(html).toMatch(/data-testid="stok-aksi-daftar"[^>]*><p[^>]*>Semua item · 3 item</);   // 'belum' tidak ada: hanya 3 item punya stok
    expect(html).toContain('>Salin<');
  });
  it('tanpa item: petunjuk Kelola', () => {
    expect(renderToString(<StockSummary master={[]} latest={{}} />)).toContain('Belum ada item');
  });
});

describe('StockView', () => {
  it('staf: langsung tab Isi tanpa tab lain', () => {
    auth.owner = false;
    const html = renderToString(<StockView />);
    expect(html).toContain('data-testid="stok-isi"');
    expect(html).not.toContain('Ringkasan');
    expect(html).not.toContain('Kelola');
  });
  it('owner: empat tab, mulai dari Ringkasan', () => {
    const html = renderToString(<StockView />);
    for (const t of ['Ringkasan', 'Isi', 'Kelola', 'Riwayat']) expect(html).toContain(t);
    expect(html).toContain('data-testid="stok-ringkasan"');
  });
  it('migrasi belum dijalankan: petunjuk', () => {
    Object.assign(stock, { ready: false, error: 'Stok Belanja belum aktif: jalankan migrasi' });
    expect(renderToString(<StockView />)).toContain('belum aktif');
    Object.assign(stock, { ready: true, error: '' });
  });
});
