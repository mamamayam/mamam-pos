import { useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { Card, Badge, Alert, Button, EmptyState } from '../../components/ui';
import { useStockHistory } from '../../hook/useStockData';
import { daySummary, dayLabel } from './stockMath';

/** StockHistory — tab Riwayat (owner): hari-hari yang sudah disimpan, siapa yang mengisi, dan hitungan Habis/Menipis. */
export default function StockHistory({ master, enabled }) {
  const { rows, loading, error, reload } = useStockHistory(enabled);
  const list = useMemo(() => rows.map((r) => ({ ...r, summary: daySummary(master, r.counts) })), [rows, master]);

  if (error) return <Alert type="banner" variant="error">{error}</Alert>;
  if (!list.length) {
    return loading
      ? <p className="text-center text-sm text-slate-400 py-8">Memuat riwayat...</p>
      : <EmptyState title="Belum ada riwayat" description="Hasil stok yang sudah disimpan akan muncul di sini." />;
  }

  const time = (iso) => { try { return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }).replace(':', '.'); } catch { return ''; } };
  return (
    <div className="space-y-2" data-testid="stok-riwayat">
      {list.map((r) => (
        <Card key={r.day} padding="md">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{dayLabel(r.day)}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">{r.saved_by ? `${r.saved_by} · ` : ''}{time(r.saved_at)}</p>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-2">
            <Badge variant="danger">{r.summary.habis} habis</Badge>
            <Badge variant="warning">{r.summary.menipis} menipis</Badge>
            <Badge variant="success">{r.summary.aman} aman</Badge>
          </div>
        </Card>
      ))}
      <Button variant="secondary" size="sm" className="w-full" onClick={reload} icon={<RefreshCw className="w-4 h-4" />}>Muat ulang</Button>
      <p className="text-xs text-center text-slate-400 dark:text-slate-500">Hitungan memakai batas menipis item yang berlaku sekarang.</p>
    </div>
  );
}
