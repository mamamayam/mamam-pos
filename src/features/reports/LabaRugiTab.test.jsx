import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Yang diuji: tombol Income Statement di paling bawah Laporan (hanya yang berizin laporan.labaKotor) dan sheet-nya.
const state = { canProfit: true, menuCount: 1, categories: ['Belanja', 'Sewa'], opname: null, waste: [] };
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: (n) => `Rp ${n}` }) }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: (p) => (p === 'laporan.labaKotor' ? state.canProfit : false) }) }));
vi.mock('../../hook/useReportData', () => ({
  useReportData: () => ({
    sales: [{ total: 1000, payment_method: 'Tunai', order_type: 'Takeaway', items: Array.from({ length: state.menuCount }, (_, i) => ({ menu_item_id: `m${i}`, name: `Menu ${i}`, qty: state.menuCount - i, price: 1000 })) }],
    expenses: [{ category: 'Belanja', amount: 400 }],
    categories: state.categories,
    loading: false, error: null, reload: () => {},
  }),
}));
vi.mock('../../hook/useOpname', () => ({ useStatementStock: () => ({ loading: false, stock: state.opname }) }));
vi.mock('../../hook/useWaste', () => ({ useWasteRange: () => ({ loading: false, catatan: state.waste }) }));
vi.mock('../../components/ui', async () => {
  const real = await vi.importActual('../../components/ui');
  return { ...real, Modal: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null) };
});

// Sheet ditutup di SSR, jadi yang diperiksa = props yang dikirim LabaRugiTab ke sheet.
vi.mock('./IncomeStatementSheet', () => ({ default: (props) => { state.sheetProps = props; return null; } }));

import LabaRugiTab from './LabaRugiTab';

const render = (month = '2026-10') => renderToString(<LabaRugiTab range={{ fromDate: '2026-10-01', toDate: '2026-10-31' }} periodLabel="Oktober 2026" month={month} />);

beforeEach(() => { state.canProfit = true; state.menuCount = 1; state.categories = ['Belanja', 'Sewa']; state.opname = null; state.waste = []; });

describe('LabaRugiTab — tombol Income Statement', () => {
  it('owner: tombol ada, dan letaknya SETELAH Menu Terlaris (paling bawah)', () => {
    const html = render();
    expect(html).toContain('data-testid="btn-income-statement"');
    expect(html.indexOf('Menu Terlaris')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="btn-income-statement"')).toBeGreaterThan(html.indexOf('Menu Terlaris'));
  });
  it('tanpa izin laporan.labaKotor: tombol tidak ada', () => {
    state.canProfit = false;
    expect(render()).not.toContain('btn-income-statement');
  });
  it('sheet tertutup saat layar dibuka (isinya baru tampil setelah tombol diketuk)', () => {
    expect(render()).not.toContain('sheet-income-statement');
  });
});

describe('LabaRugiTab — tombol Lainnya di Menu Terlaris', () => {
  const rows = (html) => (html.match(/data-testid="menu-row"/g) || []).length;
  it('lebih dari 10 menu terjual: hanya 10 tampil + tombol "Lainnya" dengan sisa menu', () => {
    state.menuCount = 25;
    const html = render().replace(/<!-- -->/g, '');
    expect(rows(html)).toBe(10);
    expect(html).toContain('data-testid="btn-menu-lainnya"');
    expect(html).toContain('Lainnya (15 menu lagi)');
    expect(html.indexOf('btn-menu-lainnya')).toBeGreaterThan(html.indexOf('Menu Terlaris'));
  });
  it('10 menu atau kurang: semua tampil, tanpa tombol', () => {
    state.menuCount = 10;
    const html = render();
    expect(rows(html)).toBe(10);
    expect(html).not.toContain('btn-menu-lainnya');
  });
});

describe('LabaRugiTab — stok opname dan waste masuk Income Statement', () => {
  it('stok awal/akhir dari opname dan waste dari catatan ikut dihitung', () => {
    state.opname = { awal: 100, akhir: 50 };
    state.waste = [{ total_value: 30, total_qty: 2 }];
    render();
    const st = state.sheetProps.statement;
    expect(st.hpp).toMatchObject({ stokAwal: 100, stokAkhir: 50, waste: 30, belanja: 400, total: 100 + 400 - 50 - 30 });
    expect(st.hpp.pending).toEqual({ stokAwal: false, stokAkhir: false, waste: false });
    expect(st.beban.waste).toEqual({ total: 30, pending: false });
    expect(state.sheetProps.monthly).toBe(true);
  });
  it('tanpa data stok: semuanya belum diisi; periode bukan bulanan: monthly false', () => {
    render();
    expect(state.sheetProps.statement.hpp.pending).toEqual({ stokAwal: true, stokAkhir: true, waste: true });
    render(null);
    expect(state.sheetProps.monthly).toBe(false);
  });
});
