import { useState } from 'react';
import { PillTabs, Alert, Button } from '../../components/ui';
import { useAuth } from '../../auth/AuthContext';
import { useStockData } from '../../hook/useStockData';
import StockFill from './StockFill';
import StockManage from './StockManage';
import StockHistory from './StockHistory';
import WasteView from './WasteView';

/**
 * StockView — Stok Belanja (menggantikan Stock List di web absensi). Hasil TIDAK dikirim ke WhatsApp: tersimpan
 * di aplikasi, owner memantau hasil tiap hari di Riwayat (status habis/menipis per item), dan menyimpan hasil membuka "Absen Pulang" di web absensi.
 *  - Staf (tanpa izin `stok.kelola`): tab Isi Stok dan Waste (hanya mencatat).
 *  - Owner: Riwayat (tab pertama, terbuka lebih dulu: stok harian + stok opname), Waste (ringkasan + pilihan), dan Kelola.
 *    Owner tidak mengisi checklist; kode bypass ada di layar Absensi (tab Bypass).
 * Tab Waste tidak bergantung pada data stok (tabelnya sendiri, migrasi 022), jadi tetap terbuka walau migrasi 021 belum jalan.
 */
const OWNER_TABS = [
  { value: 'riwayat', label: 'Riwayat' },
  { value: 'waste', label: 'Waste' },
  { value: 'kelola', label: 'Kelola' },
];
const STAFF_TABS = [
  { value: 'isi', label: 'Isi Stok' },
  { value: 'waste', label: 'Waste' },
];

export default function StockView() {
  const { can } = useAuth();
  const manage = can('stok.kelola');
  const stock = useStockData();
  const [tab, setTab] = useState(manage ? 'riwayat' : 'isi');
  const tabs = manage ? OWNER_TABS : STAFF_TABS;
  const active = tabs.some((t) => t.value === tab) ? tab : tabs[0].value;

  let body;
  if (active === 'waste') body = <WasteView manage={manage} />;
  else if (stock.loading) body = <p className="text-center text-sm text-slate-400 dark:text-slate-500 py-10">Memuat...</p>;
  else if (!stock.ready) body = <Alert type="banner" variant="warning" className="!text-left !font-medium">{stock.error}</Alert>;
  else if (stock.error) {
    body = (
      <div className="space-y-3">
        <Alert type="banner" variant="error">{stock.error}</Alert>
        <Button variant="secondary" size="full" onClick={stock.reload}>Coba lagi</Button>
      </div>
    );
  } else if (active === 'isi') body = <StockFill stock={stock} />;
  else if (active === 'kelola') body = <StockManage stock={stock} />;
  else body = <StockHistory stock={stock} />;

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="max-w-3xl w-full space-y-4 pb-10">
        <PillTabs options={tabs} value={active} onChange={setTab} />
        {body}
      </div>
    </div>
  );
}
