import { Lock, Unlock } from 'lucide-react';
import { Card } from '../../components/ui';
import { useStockGate } from '../../hook/useStockData';
import BypassCard from './BypassCard';

/**
 * BypassPanel — isi tab Bypass di layar Absensi (owner): status Absen Pulang hari ini (terbuka atau belum)
 * lalu kode bypass. Status HANYA terbuka/terkunci, tanpa rincian isian checklist (permintaan pemilik 28 Okt 2026).
 */
export default function BypassPanel() {
  const { open, loading, error } = useStockGate();
  const known = open !== null;
  const title = known ? (open ? 'Absen pulang terbuka' : 'Absen pulang terkunci')
    : loading ? 'Memeriksa status absen pulang...' : 'Status absen pulang belum bisa dimuat';
  const tone = !known ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
    : open ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
      : 'bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400';
  return (
    <div className="space-y-3" data-testid="bypass-panel">
      <Card padding="md">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${tone}`}>
            {open ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50" data-testid="stok-gate-judul">{title}</p>
            {error && !known && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{error}</p>}
          </div>
        </div>
      </Card>
      <BypassCard />
    </div>
  );
}
