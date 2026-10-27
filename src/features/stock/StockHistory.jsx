import { useMemo, useState } from 'react';
import { RefreshCw, ChevronRight } from 'lucide-react';
import { Card, Badge, Alert, Button, EmptyState, Modal } from '../../components/ui';
import { useStockHistory } from '../../hook/useStockData';
import { daySummary, dayItems, filterDayGroups, dayLabel, formatQty, STATUS_META } from './stockMath';

const time = (iso) => { try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.'); } catch { return ''; } };

/** Isi satu hari: tiap item beserta jumlah dan statusnya, dikelompokkan per kategori. Hanya baca. */
const FILTERS = [
  { key: 'semua', label: 'semua', variant: 'neutral' },
  { key: 'habis', label: 'habis', variant: 'danger' },
  { key: 'menipis', label: 'menipis', variant: 'warning' },
  { key: 'aman', label: 'aman', variant: 'success' },
];

function DaySheet({ day, master, onClose }) {
  const [filter, setFilter] = useState('semua');   // DaySheet dipasang ulang (key) tiap hari dibuka, jadi selalu mulai dari Semua
  const { groups: all, kosong } = useMemo(() => (day ? dayItems(master, day.counts) : { groups: [], kosong: 0 }), [day, master]);
  const groups = useMemo(() => filterDayGroups(all, filter), [all, filter]);
  return (
    <Modal isOpen={!!day} onClose={onClose} sheet size="lg" maxHeight title={day ? dayLabel(day.day) : ''}>
      {day && (
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="stok-riwayat-detail">
          <p className="text-xs text-slate-500 dark:text-slate-400">Disimpan {day.saved_by ? `oleh ${day.saved_by} ` : ''}pukul {time(day.saved_at)}</p>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saring menurut status">
            {FILTERS.map((f) => {
              const n = f.key === 'semua' ? day.summary.habis + day.summary.menipis + day.summary.aman : day.summary[f.key];
              const active = filter === f.key;
              return (
                <button key={f.key} type="button" aria-pressed={active} data-testid={`stok-filter-${f.key}`} onClick={() => setFilter(f.key)} className="rounded-full active:scale-95 transition-transform">
                  <Badge variant={f.variant} size="md" className={active ? 'ring-2 ring-current' : 'opacity-60'}>{n} {f.label}</Badge>
                </button>
              );
            })}
          </div>
          {groups.map((g) => (
            <div key={g.category.id}>
              <p className="text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">{g.category.name.toUpperCase()}</p>
              <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
                {g.rows.map((r) => (
                  <div key={r.item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0 truncate">{r.item.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-50">{formatQty(r.qty)}<span className="text-xs font-semibold text-slate-400 dark:text-slate-500"> {r.item.unit}</span></p>
                      <Badge variant={STATUS_META[r.status].badge}>{STATUS_META[r.status].label}</Badge>
                    </div>
                  </div>
                ))}
              </Card>
            </div>
          ))}
          {groups.length === 0 && <p className="text-center text-sm text-slate-400 py-6">{filter === 'semua' ? 'Tidak ada angka yang tersimpan pada hari ini.' : `Tidak ada item yang ${FILTERS.find((f) => f.key === filter).label} pada hari ini.`}</p>}
          {filter === 'semua' && kosong > 0 && groups.length > 0 && <p className="text-xs text-center text-slate-400 dark:text-slate-500">{kosong} item lain tidak diisi hari itu.</p>}
        </div>
      )}
    </Modal>
  );
}

/** StockHistory — tab Riwayat (owner): hari-hari yang sudah disimpan dan siapa yang mengisi (satu baris ringkas per hari). Ketuk satu hari untuk melihat isinya. */
export default function StockHistory({ master, enabled }) {
  const { rows, loading, error, reload } = useStockHistory(enabled);
  const [openDay, setOpenDay] = useState(null);
  const list = useMemo(() => rows.map((r) => ({ ...r, summary: daySummary(master, r.counts) })), [rows, master]);

  if (error) return <Alert type="banner" variant="error">{error}</Alert>;
  if (!list.length) {
    return loading
      ? <p className="text-center text-sm text-slate-400 py-8">Memuat riwayat...</p>
      : <EmptyState title="Belum ada riwayat" description="Hasil stok yang sudah disimpan akan muncul di sini." />;
  }

  return (
    <div className="space-y-2" data-testid="stok-riwayat">
      {list.map((r) => (
        <Card key={r.day} padding="sm" onClick={() => setOpenDay(r.day)}>
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{dayLabel(r.day)}</p>
            <div className="flex items-center gap-1 text-xs text-slate-400 dark:text-slate-500">
              <span>{r.saved_by ? `${r.saved_by} · ` : ''}{time(r.saved_at)}</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>
        </Card>
      ))}
      <Button variant="secondary" size="sm" className="w-full" onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Muat ulang</Button>
      <DaySheet key={openDay || 'tutup'} day={list.find((r) => r.day === openDay) || null} master={master} onClose={() => setOpenDay(null)} />
      <p className="text-xs text-center text-slate-400 dark:text-slate-500">Status di detail memakai batas menipis item yang berlaku sekarang.</p>
    </div>
  );
}
