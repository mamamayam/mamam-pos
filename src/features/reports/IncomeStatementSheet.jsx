import { Modal } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { percentOf, formatPercent } from './incomeStatementMath';

/**
 * IncomeStatementSheet — Laba Rugi bertingkat (angka + persen dari Total Pendapatan), dibuka dari tombol
 * "Income Statement" di paling bawah Laporan. Hanya menampilkan; semua hitungan di `incomeStatementMath.js`.
 *
 *   Pendapatan (tunai, QRIS, transfer, split, ojol per aplikasi) → HPP → Laba Kotor → Beban Operasional → Net Profit
 *
 * Rincian Beban Operasional = satu baris per kategori pengeluaran di app (nama kategori apa adanya), jadi kategori yang
 * ditambah / diganti di app ikut berubah di sini tanpa mengubah kode ini.
 *
 * Props: isOpen, onClose, statement (hasil `buildIncomeStatement`), periodLabel (teks periode di judul).
 */
const COLS = 'grid grid-cols-[minmax(0,1fr)_auto_3.25rem] items-center gap-x-2';
const LEVEL = { 1: 'pl-3', 2: 'pl-7' };
const STRONG = 'font-bold text-slate-800 dark:text-slate-100';

export default function IncomeStatementSheet({ isOpen, onClose, statement: s, periodLabel }) {
  const { formatRupiah } = useAppContext();
  const total = s?.totalPendapatan ?? 0;
  const pc = (n) => formatPercent(percentOf(n, total));

  // Baris biasa. level 1 = isi bagian, level 2 = rincian di bawah baris level 1.
  const line = (label, amount, { level = 1, strong = false, pending = false, bar = null, badge = null, testId } = {}) => (
    <div key={label} className={`${COLS} px-4 py-1.5`} data-testid={testId}>
      <div className={`min-w-0 ${LEVEL[level]} ${strong ? STRONG : level === 2 ? 'text-xs text-slate-400 dark:text-slate-500' : 'text-slate-600 dark:text-slate-300'} ${pending ? 'italic' : ''}`}>
        <span>{label}</span>{badge}
        {bar != null && (
          <div className="mt-1 h-1 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className="h-full rounded-full bg-accent-500/60" style={{ width: `${bar}%` }} />
          </div>
        )}
      </div>
      <span className={`text-right tabular-nums ${strong ? STRONG : level === 2 ? 'text-xs text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}`}>
        {pending ? <span className="text-xs text-slate-400">—</span> : formatRupiah(amount)}
      </span>
      <span className="text-right text-[11px] tabular-nums text-slate-400">{pending ? '' : pc(amount)}</span>
    </div>
  );

  const soon = (label) => line(label, 0, {
    pending: true,
    badge: <span className="ml-1.5 align-[1px] not-italic text-[9.5px] font-bold uppercase tracking-wide rounded-md px-1.5 py-px bg-accent-100 text-accent-700 dark:bg-accent-500/20 dark:text-accent-300">Menyusul</span>,
  });

  const section = (title, hint) => (
    <div className="px-4 pt-3 pb-1">
      <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{title}</p>
      {hint && <p className="text-[10.5px] text-slate-400">{hint}</p>}
    </div>
  );

  const totalRow = (label, amount, testId, pctText) => (
    <div key={label} className={`${COLS} px-4 py-2 mt-1 bg-slate-100 dark:bg-slate-800 ${STRONG}`} data-testid={testId}>
      <span className="min-w-0">{label}</span>
      <span className="text-right tabular-nums">{formatRupiah(amount)}</span>
      <span className="text-right text-[11px] tabular-nums">{pctText ?? pc(amount)}</span>
    </div>
  );

  const profitRow = (label, amount, testId, big = false) => {
    const ok = amount >= 0;
    return (
      <div key={label} data-testid={testId}
        className={`${COLS} mx-3 rounded-xl px-3 ${big ? 'py-3.5' : 'py-2.5'} font-bold ${ok ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400'}`}>
        <span className="min-w-0">{label}</span>
        <span className={`text-right tabular-nums ${big ? 'text-base' : ''}`}>{formatRupiah(amount)}</span>
        <span className="text-right text-[11px] tabular-nums">{pc(amount)}</span>
      </div>
    );
  };

  const body = () => {
    const p = s.pendapatan, h = s.hpp, b = s.beban;
    const ojolTop = p.ojol.platforms[0]?.total > 0 ? p.ojol.platforms[0].name : null;
    return (
      <>
        <div className={`${COLS} px-4 py-2 border-b border-slate-100 dark:border-slate-800 text-[10px] font-bold uppercase tracking-wider text-slate-400`}>
          <span>Keterangan</span><span className="text-right">Nominal</span><span className="text-right">%</span>
        </div>

        {section('Pendapatan (Revenue)')}
        {line('Tunai', p.tunai)}
        {line('QRIS', p.qris)}
        {line('Transfer', p.transfer)}
        {p.split > 0 && line('Split Payment', p.split)}
        {p.lainnya > 0 && line('Metode lain / tidak tercatat', p.lainnya)}
        {line('Ojol', p.ojol.total, { strong: true, testId: 'is-ojol' })}
        {p.ojol.platforms.map((pf) => line(pf.name, pf.total, {
          level: 2,
          bar: p.ojol.total ? Math.round(percentOf(pf.total, p.ojol.total)) : 0,
          badge: pf.name === ojolTop ? <span className="ml-1.5 text-[9.5px] font-bold uppercase tracking-wide rounded-md px-1.5 py-px bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-400">Terbesar</span> : null,
          testId: `is-ojol-${pf.name}`,
        }))}
        {totalRow('Total Pendapatan', total, 'is-total-pendapatan', '100,0%')}

        <div className="h-2" />
        {section('Harga Pokok Produksi (HPP)', 'Stok awal + belanja − stok akhir − waste')}
        {h.pending.stokAwal ? soon('Stok awal bulan') : line('Stok awal bulan', h.stokAwal)}
        {line('+ Belanja bulan ini', h.belanja, { testId: 'is-belanja' })}
        {line('+ Bayar Ayam', h.bayarAyam, { testId: 'is-bayar-ayam' })}
        {h.pending.stokAkhir ? soon('− Stok akhir bulan') : line('− Stok akhir bulan', h.stokAkhir)}
        {h.pending.waste ? soon('− Waste') : line('− Waste', h.waste)}
        {totalRow('Total HPP', h.total, 'is-total-hpp')}

        <div className="h-2" />
        {profitRow('Laba Kotor (Gross Profit)', s.labaKotor, 'is-laba-kotor')}

        <div className="h-2" />
        {section('Beban Operasional', 'Rincian mengikuti kategori pengeluaran di app')}
        {line('Gaji karyawan', b.gaji.total, { strong: true, testId: 'is-gaji' })}
        {b.gaji.items.map((c) => line(c.category, c.total, { level: 2, testId: `is-gaji-${c.category}` }))}
        {b.operasional.items.map((c) => line(c.category, c.total, { testId: `is-beban-${c.category}` }))}
        {b.operasional.items.length === 0 && <p className="px-4 py-1.5 pl-7 text-xs text-slate-400">Belum ada kategori biaya lain.</p>}
        {totalRow('Total Beban Operasional', b.total, 'is-total-beban')}

        <div className="h-2" />
        {profitRow('Net Profit (Laba Bersih)', s.netProfit, 'is-net', true)}
        <div className="h-3" />
      </>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} sheet size="lg" maxHeight title="Income Statement">
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-3" data-testid="sheet-income-statement">
        <p className="text-xs text-slate-400">Laporan Laba/Rugi · MamamAyam{periodLabel ? ` · Periode ${periodLabel}` : ''}</p>
        {s && (
          <div className="rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {body()}
          </div>
        )}
        <p className="text-[11px] text-slate-400 text-center px-2">
          Persentase = bagian dari Total Pendapatan. Dihitung dari catatan pengeluaran yang sudah dibayar; utang yang belum dibayar belum ikut.
        </p>
      </div>
    </Modal>
  );
}
