import { useMemo, useState } from 'react';
import { Copy, Share2, PackageCheck } from 'lucide-react';
import { Card, Badge, Button, EmptyState } from '../../components/ui';
import { showToast } from '../../lib/toast';
import { stockRows, sortByStatus, countByStatus, filterRows, shareText, formatQty, dayLabel, FILTER_LABEL, STATUS_META } from './stockMath';

/**
 * StockSummary — tab Ringkasan (owner): stok terakhir yang TERSIMPAN per item, status Habis / Menipis / Aman.
 * Status dihitung dari batas menipis (min_qty) tiap item, diatur di tab Kelola.
 * Tombol Salin/Bagikan mengikuti filter yang sedang dipilih (Menipis = hanya yang menipis, dst; Semua = semua item).
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
  const shown = useMemo(() => sortByStatus(filterRows(rows, filter)), [rows, filter]);

  const lastRow = rows.filter((r) => r.day).sort((a, b) => (a.day < b.day ? 1 : -1))[0];

  const text = () => shareText(rows, filter, dayLabel(lastRow?.day));
  const copyList = async () => {
    try { await navigator.clipboard.writeText(text()); showToast(`Daftar ${FILTER_LABEL[filter].toLowerCase()} disalin`); }
    catch { showToast('Gagal menyalin daftar', { type: 'error' }); }
  };
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  const shareList = async () => {
    try { await navigator.share({ title: 'Stok Belanja', text: text() }); }
    catch (e) { if (e?.name !== 'AbortError') showToast('Gagal membagikan daftar', { type: 'error' }); }   // AbortError = pengguna menutup menu bagikan
  };

  if (!rows.length) {
    return <EmptyState icon={<PackageCheck className="w-full h-full" />} title="Belum ada item" description="Tambahkan kategori dan item di tab Kelola." />;
  }

  return (
    <div className="space-y-3" data-testid="stok-ringkasan">
      <p className="text-xs font-medium text-slate-400 dark:text-slate-500">
        {lastRow ? `Terakhir disimpan ${dayLabel(lastRow.day)}${lastRow.savedBy ? ` · ${lastRow.savedBy}` : ''}` : 'Belum ada hasil stok yang disimpan'}
      </p>

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

      <div className="flex items-center justify-between gap-2" data-testid="stok-aksi-daftar">
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 min-w-0 truncate">{FILTER_LABEL[filter]} · {shown.length} item</p>
        <div className="flex gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={copyList} disabled={!shown.length} icon={<Copy className="w-4 h-4" />}>Salin</Button>
          {canShare && <Button variant="secondary" size="sm" onClick={shareList} disabled={!shown.length} icon={<Share2 className="w-4 h-4" />}>Bagikan</Button>}
        </div>
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
