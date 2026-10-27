import { useMemo, useState } from 'react';
import { Copy, PackageCheck } from 'lucide-react';
import { Card, Badge, Button, EmptyState } from '../../components/ui';
import { showToast } from '../../lib/toast';
import { stockRows, sortByStatus, countByStatus, buyListText, formatQty, dayLabel, STATUS_META } from './stockMath';

/**
 * StockSummary — tab Ringkasan (owner): stok terakhir yang TERSIMPAN per item, status Habis / Menipis / Aman,
 * dan daftar yang perlu dibeli. Status dihitung dari batas menipis (min_qty) tiap item, diatur di tab Kelola.
 */
const TILES = [
  { key: 'semua', label: 'SEMUA' },
  { key: 'habis', label: 'HABIS' },
  { key: 'menipis', label: 'MENIPIS' },
  { key: 'aman', label: 'AMAN' },
  { key: 'belum', label: 'BELUM DICEK' },
];
const ACTIVE = 'bg-gradient-to-r from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600 text-white border-transparent';
const INACTIVE = 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300';

export default function StockSummary({ master, latest }) {
  const [filter, setFilter] = useState('semua');
  const rows = useMemo(() => stockRows(master, latest), [master, latest]);
  const counts = useMemo(() => countByStatus(rows), [rows]);
  const shown = useMemo(() => sortByStatus(rows).filter((r) => filter === 'semua' || r.status === filter), [rows, filter]);
  const need = counts.habis + counts.menipis;

  const lastRow = rows.filter((r) => r.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];

  const copyList = async () => {
    try { await navigator.clipboard.writeText(buyListText(rows, dayLabel(lastRow?.day))); showToast('Daftar belanja disalin'); }
    catch { showToast('Gagal menyalin daftar', { type: 'error' }); }
  };

  if (!rows.length) {
    return <EmptyState icon={<PackageCheck className="w-full h-full" />} title="Belum ada item" description="Tambahkan kategori dan item di tab Kelola." />;
  }

  return (
    <div className="space-y-3" data-testid="stok-ringkasan">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
        {lastRow ? `Terakhir disimpan ${dayLabel(lastRow.day)}${lastRow.savedBy ? ` · ${lastRow.savedBy}` : ''}` : 'Belum ada hasil stok yang disimpan'}
      </p>

      <Card variant="dark" padding="md" className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400 font-bold tracking-wide">PERLU DIBELI</p>
          <p className="font-heading text-2xl font-bold" data-testid="stok-perlu-dibeli">{need} item</p>
          <p className="text-xs text-slate-400">{counts.habis} habis · {counts.menipis} menipis</p>
        </div>
        <Button variant="secondary" size="sm" onClick={copyList} disabled={!need} icon={<Copy className="w-4 h-4" />}>Salin daftar</Button>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {TILES.map((t) => (
          <button
            key={t.key} type="button" onClick={() => setFilter(t.key)} data-testid={`stok-filter-${t.key}`}
            className={`${t.key === 'semua' ? 'col-span-2' : ''} min-w-0 text-left rounded-2xl px-3.5 py-2.5 border transition-all duration-300 active:scale-95 ${filter === t.key ? ACTIVE : INACTIVE}`}
          >
            <p className="text-xs font-bold tracking-wide opacity-80 truncate">{t.label}</p>
            <p className="font-heading font-bold text-sm mt-0.5">{t.key === 'semua' ? rows.length : counts[t.key]} item</p>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {shown.length === 0 && <p className="text-center text-sm font-semibold text-slate-400 dark:text-slate-500 py-8">Tidak ada item</p>}
        {shown.map((r) => (
          <Card key={r.item.id} padding="sm" className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{r.item.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{r.category.name} · batas menipis {formatQty(r.item.min_qty) || 0} {r.item.unit}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-heading font-bold text-base text-slate-900 dark:text-slate-50 leading-tight">
                {r.qty === null ? '—' : formatQty(r.qty)}<span className="text-xs font-semibold text-slate-400 dark:text-slate-500"> {r.item.unit}</span>
              </p>
              <Badge variant={STATUS_META[r.status].badge}>{STATUS_META[r.status].label}</Badge>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
