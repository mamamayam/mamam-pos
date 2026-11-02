import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// Yang diuji: isi sheet Income Statement (urutan bagian, angka, persen, "Menyusul", rugi). Rumusnya dites di incomeStatementMath.test.js.
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}` }) }));
vi.mock('../../components/ui', async () => {
  const real = await vi.importActual('../../components/ui');
  return { ...real, Modal: ({ isOpen, children, title }) => (isOpen ? <div data-title={title}>{children}</div> : null) };
});

import IncomeStatementSheet from './IncomeStatementSheet';
import { buildIncomeStatement } from './incomeStatementMath';

const sale = (total, payment_method, ojol_platform = null) => ({ total, payment_method, ojol_platform });
const exp = (category, amount) => ({ category, amount });

const statement = buildIncomeStatement({
  sales: [sale(500, 'Tunai'), sale(250, 'QRIS'), sale(150, 'Ojol', 'Gofood'), sale(100, 'Ojol', 'Shopeefood')],
  expenses: [exp('Belanja', 300), exp('Bayar Ayam', 200), exp('Gaji mingguan', 50), exp('Kasbon', 10), exp('Biaya listrik', 20)],
});
// React SSR menyisipkan <!-- --> di antara teks yang digabung; dibuang supaya pencocokan teks wajar.
const render = (props) => renderToString(<IncomeStatementSheet isOpen onClose={() => {}} statement={statement} periodLabel="Oktober 2026" {...props} />).replace(/<!-- -->/g, '');
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('IncomeStatementSheet', () => {
  it('tertutup: tidak merender apa pun', () => {
    expect(renderToString(<IncomeStatementSheet isOpen={false} onClose={() => {}} statement={statement} />)).toBe('');
  });
  it('judul memuat periode', () => {
    expect(text(render())).toContain('Periode Oktober 2026');
  });
  it('urutan bagian: Pendapatan → HPP → Laba Kotor → Beban Operasional → Net Profit', () => {
    const t = text(render());
    const order = ['Pendapatan (Revenue)', 'Total Pendapatan', 'Harga Pokok Produksi (HPP)', 'Total HPP', 'Laba Kotor (Gross Profit)', 'Beban Operasional', 'Total Beban Operasional', 'Net Profit (Laba Bersih)'];
    const idx = order.map((o) => t.indexOf(o));
    expect(idx.every((i) => i >= 0)).toBe(true);
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });
  it('pendapatan: tiap metode, ojol per aplikasi (yang terbesar diberi penanda), total 100%', () => {
    const html = render();
    expect(html).toContain('Tunai');
    expect(html).toContain('QRIS');
    expect(html).toContain('data-testid="is-ojol-Gofood"');
    expect(html).toContain('data-testid="is-ojol-Grabfood"');
    expect(text(html)).toContain('Terbesar');
    expect(text(html)).toContain('Total Pendapatan Rp 1000 100,0%');
    expect(text(html)).toContain('Ojol Rp 250 25,0%');
  });
  it('HPP: belanja + bayar ayam; stok awal/akhir dan waste tampil "Belum diisi" (3x) kalau belum ada datanya', () => {
    const t = text(render());
    expect(t).toContain('+ Belanja bulan ini Rp 300 30,0%');
    expect(t).toContain('+ Bayar Ayam Rp 200 20,0%');
    expect(t).toContain('Total HPP Rp 500 50,0%');
    expect(t.match(/Belum diisi/g)).toHaveLength(3);
  });
  it('stok yang sudah diisi tampil sebagai angka, bukan "Belum diisi"; waste ikut jadi Kerugian waste di beban', () => {
    const filled = buildIncomeStatement({ sales: [sale(1000, 'Tunai')], expenses: [exp('Belanja', 300)], stock: { awal: 100, akhir: 50, waste: 10 } });
    const t = text(render({ statement: filled }));
    expect(t).not.toContain('Belum diisi');
    expect(t).toContain('− Stok akhir bulan Rp 50');
    expect(t).toContain('Kerugian waste Rp 10');
    expect(t).toContain('Total HPP Rp 340');
  });
  it('periode bukan bulanan: stok awal/akhir bertanda "Hanya bulanan"', () => {
    const t = text(render({ monthly: false }));
    expect(t.match(/Hanya bulanan/g)).toHaveLength(2);
    expect(t.match(/Belum diisi/g)).toHaveLength(1);
  });
  it('laba kotor, beban operasional (gaji = gaji mingguan + kasbon), dan net profit', () => {
    const t = text(render());
    expect(t).toContain('Laba Kotor (Gross Profit) Rp 500 50,0%');
    expect(t).toContain('Gaji karyawan Rp 60 6,0%');
    expect(t).toContain('Biaya listrik Rp 20 2,0%');
    expect(t).toContain('Total Beban Operasional Rp 80 8,0%');
    expect(t).toContain('Net Profit (Laba Bersih) Rp 420 42,0%');
  });
  it('rincian beban = satu baris per kategori di app (gaji dan kasbon per kategori, bukan gabungan)', () => {
    const t = text(render());
    expect(t).toContain('Gaji mingguan Rp 50 5,0%');
    expect(t).toContain('Kasbon Rp 10 1,0%');
    expect(t).not.toContain('semua jenis');
    expect(t).not.toContain('Biaya lainnya');
    expect(t).not.toContain('Biaya sewa');
  });
  it('kategori baru di app langsung tampil walau belum ada catatan (Rp 0); kategori diganti nama ikut berubah', () => {
    const baru = buildIncomeStatement({ sales: [sale(1000, 'Tunai')], expenses: [exp('Biaya listrik', 20)], categories: ['Sewa Ruko', 'Token Listrik'] });
    const html = render({ statement: baru });
    const t = text(html);
    expect(html).toContain('data-testid="is-beban-Sewa Ruko"');
    expect(t).toContain('Sewa Ruko Rp 0 0,0%');
    expect(t).toContain('Token Listrik Rp 0 0,0%');
    expect(t).toContain('Biaya listrik Rp 20 2,0%');   // nama lama di catatan tetap tampil, total tidak hilang
    expect(t).toContain('Total Beban Operasional Rp 20 2,0%');
  });
  it('tanpa kategori lain: ada keterangan, bukan baris kosong', () => {
    const t = text(render({ statement: buildIncomeStatement({ sales: [sale(100, 'Tunai')], expenses: [exp('Belanja', 10)] }) }));
    expect(t).toContain('Belum ada kategori biaya lain.');
  });
  it('rugi tampil merah, untung tampil hijau', () => {
    expect(render()).toMatch(/data-testid="is-net"[^>]*text-green-700/);
    const rugi = buildIncomeStatement({ sales: [sale(100, 'Tunai')], expenses: [exp('Belanja', 300)] });
    const html = render({ statement: rugi });
    expect(html).toMatch(/data-testid="is-net"[^>]*text-red-700/);
    expect(text(html)).toContain('Net Profit (Laba Bersih) Rp -200 -200,0%');
  });
  it('catatan dasar hitung (utang belum dibayar belum ikut) tampil', () => {
    expect(text(render())).toContain('utang yang belum dibayar belum ikut');
  });
});
