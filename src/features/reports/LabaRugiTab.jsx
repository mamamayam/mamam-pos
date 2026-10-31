import { useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { useAuth } from '../../auth/AuthContext';
import { useReportData } from '../../hook/useReportData';
import { summarizeSales, summarizeExpenses, topMenus, menuListView } from './reportsMath';
import { buildIncomeStatement } from './incomeStatementMath';
import IncomeStatementSheet from './IncomeStatementSheet';
import ReportGate from './ReportGate';

/**
 * LabaRugiTab — Laba Rugi: Total Penjualan, Laba Kotor, Pengeluaran.
 *   Laba Kotor = Total Penjualan − Pengeluaran (SEMUA pengeluaran, lihat reportsMath).
 * Di bawahnya: pengeluaran per kategori, penjualan per metode bayar / tipe pesanan, dan menu terlaris.
 * (Daftar catatan pengeluaran ada di layar Pengeluaran, tidak diulang di sini.)
 * Kartu Laba Kotor hanya untuk yang berizin `laporan.labaKotor`.
 * Paling bawah: tombol Income Statement (izin `laporan.labaKotor` juga) yang membuka Laba Rugi bertingkat
 * (pendapatan, HPP, laba kotor, beban operasional, net profit) dari data yang sama. `periodLabel` = teks periode di judulnya.
 * Menu Terlaris menampilkan 10 teratas; tombol "Lainnya" di bawahnya membuka SEMUA menu yang terjual (urut porsi terbanyak) supaya
 * kelihatan menu mana yang laku dan mana yang tidak; "Ringkas" menutup lagi.
 */
export default function LabaRugiTab({ range, periodLabel = '' }) {
  const { formatRupiah } = useAppContext();
  const { can } = useAuth();
  const canProfit = can('laporan.labaKotor');
  const { sales, expenses, categories, loading, error, reload } = useReportData(range);
  const [statementOpen, setStatementOpen] = useState(false);
  const [allMenus, setAllMenus] = useState(false);

  const summary = useMemo(() => summarizeSales(sales), [sales]);
  const soldMenus = useMemo(() => topMenus(sales, Infinity), [sales]);
  const menuView = menuListView(soldMenus, allMenus);
  const expSummary = useMemo(() => summarizeExpenses(expenses), [expenses]);
  const statement = useMemo(() => (canProfit ? buildIncomeStatement({ sales, expenses, categories }) : null), [canProfit, sales, expenses, categories]);
  const pengeluaran = expSummary.total;
  const labaKotor = summary.total - pengeluaran;

  return (
    <ReportGate loading={loading} error={error} reload={reload}>
      <Card variant="dark" padding="lg" className="space-y-1">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Total Penjualan</p>
        <p className="font-heading text-3xl font-bold text-white" data-testid="sum-total">{formatRupiah(summary.total)}</p>
        <p className="text-xs text-slate-400">{summary.count} transaksi · rata-rata {formatRupiah(summary.average)}</p>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        {[['Laba Kotor', labaKotor, 'sum-kotor'], ['Pengeluaran', pengeluaran, 'sum-exp']].filter(([k]) => canProfit || k === 'Pengeluaran').map(([k, v, id]) => (
          <Card key={k} padding="md"><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{k}</p><p className="font-heading font-bold text-base text-slate-800 dark:text-slate-100" data-testid={id}>{formatRupiah(v)}</p></Card>
        ))}
      </div>

      <Card className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Pengeluaran per Kategori</p>
        {expSummary.byCategory.length === 0 ? <p className="text-xs text-slate-400">Belum ada data.</p> : expSummary.byCategory.map(c => (
          <div key={c.category} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{c.category} <span className="text-slate-400 text-xs">({c.count})</span></span><span className="font-bold text-slate-800 dark:text-slate-100">{formatRupiah(c.total)}</span></div>
        ))}
      </Card>

      {[['Per Metode Bayar', summary.byPayment], ['Per Tipe Pesanan', summary.byOrderType]].map(([title, rows]) => (
        <Card key={title} className="space-y-1.5">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">{title}</p>
          {rows.length === 0 ? <p className="text-xs text-slate-400">Belum ada data.</p> : rows.map(r => (
            <div key={r.key} className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">{r.key} <span className="text-slate-400 text-xs">({r.count})</span></span><span className="font-bold text-slate-800 dark:text-slate-100">{formatRupiah(r.total)}</span></div>
          ))}
        </Card>
      ))}

      <Card className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Menu Terlaris</p>
        {soldMenus.length === 0 ? <p className="text-xs text-slate-400">Belum ada data.</p> : menuView.rows.map((m, i) => (
          <div key={m.key} data-testid="menu-row" className="flex justify-between text-sm gap-3"><span className="text-slate-600 dark:text-slate-300 min-w-0 truncate"><span className="text-slate-400 mr-1.5">{i + 1}.</span>{m.name}</span><span className="shrink-0"><span className="font-bold text-slate-800 dark:text-slate-100">{m.qty}×</span> <span className="text-xs text-slate-400">{formatRupiah(m.revenue)}</span></span></div>
        ))}
        {menuView.canToggle && (
          <Button variant="secondary" size="sm" className="w-full mt-2" onClick={() => setAllMenus(v => !v)} data-testid="btn-menu-lainnya">
            {allMenus ? 'Ringkas' : `Lainnya (${menuView.hiddenCount} menu lagi)`}
          </Button>
        )}
      </Card>

      {canProfit && (
        <>
          <Button size="full" icon={<BarChart3 className="w-4 h-4" />} onClick={() => setStatementOpen(true)} data-testid="btn-income-statement">Income Statement</Button>
          <IncomeStatementSheet isOpen={statementOpen} onClose={() => setStatementOpen(false)} statement={statement} periodLabel={periodLabel} />
        </>
      )}
    </ReportGate>
  );
}
