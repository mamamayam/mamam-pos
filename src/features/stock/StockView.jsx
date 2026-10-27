import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { PageHeader, PillTabs, Alert, Button } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { useStockData } from '../../hook/useStockData';
import { stockRows, countByStatus } from './stockMath';
import StockFill from './StockFill';
import StockSummary from './StockSummary';
import StockManage from './StockManage';
import StockHistory from './StockHistory';

/**
 * StockView — Stok Belanja (menggantikan Stock List di web absensi). Hasil TIDAK dikirim ke WhatsApp: tersimpan
 * di aplikasi, owner memantau yang habis/menipis di Ringkasan, dan menyimpan hasil membuka "Absen Pulang" di web absensi.
 *  - Staf (tanpa izin `stok.kelola`): hanya tab Isi.
 *  - Owner: Ringkasan, Isi (+ kode bypass), Kelola, Riwayat.
 */
const OWNER_TABS = [
  { value: 'ringkasan', label: 'Ringkasan' },
  { value: 'isi', label: 'Isi' },
  { value: 'kelola', label: 'Kelola' },
  { value: 'riwayat', label: 'Riwayat' },
];

export default function StockView() {
  const { can } = useAuth();
  const manage = can('stok.kelola');
  const stock = useStockData();
  const [tab, setTab] = useState('ringkasan');
  const active = manage ? tab : 'isi';

  const need = (() => { const c = countByStatus(stockRows(stock.master, stock.latest)); return c.habis + c.menipis; })();
  const subtitle = manage ? `${stock.master.reduce((n, c) => n + c.items.length, 0)} item · ${need} perlu dibeli` : 'Isi stok hari ini';

  let body;
  if (stock.loading) body = <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">Memuat...</p>;
  else if (!stock.ready) body = <Alert type="banner" variant="warning" className="!text-left !font-medium">{stock.error}</Alert>;
  else if (stock.error) {
    body = (
      <div className="space-y-3">
        <Alert type="banner" variant="error">{stock.error}</Alert>
        <Button variant="secondary" size="full" onClick={stock.reload}>Coba lagi</Button>
      </div>
    );
  } else if (active === 'ringkasan') body = <StockSummary master={stock.master} latest={stock.latest} />;
  else if (active === 'isi') body = <StockFill stock={stock} manage={manage} />;
  else if (active === 'kelola') body = <StockManage stock={stock} />;
  else body = <StockHistory master={stock.master} enabled />;

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="max-w-3xl w-full space-y-4 pb-10">
        <PageHeader icon={<ClipboardList className="w-6 h-6" />} title="Stok Belanja" subtitle={subtitle} />
        {manage && <PillTabs options={OWNER_TABS} value={active} onChange={setTab} />}
        {body}
      </div>
    </div>
  );
}
