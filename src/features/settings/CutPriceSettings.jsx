import { useState, useEffect } from 'react';
import { Drumstick, Plus, X } from 'lucide-react';
import { Card, Button, Input, NominalInput } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { sanitizeCutPrices, validateCutPrices, CUT_UNIT } from '../payroll/additionDetail';

/**
 * Pengaturan > Harga Potong Ayam: jenis potongan beserta upah per kg (bawaan Bld, Sayap, Karkas Rp 3.000).
 * Dipakai rincian Tambahan kategori Potong Ayam. Harga di tiap baris catatan disalin saat dicatat, jadi
 * mengubah harga di sini hanya berlaku untuk catatan baru. Pilihan "Lainnya" (nama dan harga bebas) selalu ada.
 */
export default function CutPriceSettings({ settings, saveSetting }) {
  const { triggerAlert } = useAppContext();
  const saved = sanitizeCutPrices(settings.potong_ayam_prices);
  const [rows, setRows] = useState(() => saved.map((c) => ({ name: c.name, price: String(c.price) })));
  const [busy, setBusy] = useState(false);

  // Muat ulang isian saat pengaturan tersimpan berubah (mis. setelah selesai dimuat dari server).
  const savedKey = JSON.stringify(saved);
  useEffect(() => { setRows(saved.map((c) => ({ name: c.name, price: String(c.price) }))); }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps -- savedKey mewakili saved

  const dirty = JSON.stringify(rows.map((r) => ({ name: r.name.trim(), price: Number(String(r.price).replace(/\D/g, '')) || 0 }))) !== savedKey;
  const patch = (i, p) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));

  const save = async () => {
    const v = validateCutPrices(rows);
    if (!v.ok) { triggerAlert(v.message); return; }
    setBusy(true);
    try { await saveSetting('potong_ayam_prices', v.list); triggerAlert('Harga potong ayam disimpan.'); }
    catch (e) { triggerAlert(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="space-y-4" data-testid="cut-price-settings">
      <div>
        <p className="font-heading font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Drumstick className="w-4 h-4 text-accent-600" /> Harga Potong Ayam</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Upah per {CUT_UNIT} untuk rincian Tambahan. Hanya berlaku untuk catatan baru.</p>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-start gap-2" data-testid="cut-price-row">
            <div className="flex-1 min-w-0"><Input placeholder="Jenis" value={r.name} maxLength={30} onChange={(e) => patch(i, { name: e.target.value })} aria-label="Jenis potongan" /></div>
            <div className="w-32 shrink-0"><NominalInput title={`Harga per ${CUT_UNIT}`} placeholder="0" value={r.price} onChange={(e) => patch(i, { price: e.target.value })} /></div>
            <button type="button" aria-label="Hapus jenis" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              className="shrink-0 mt-1.5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 active:bg-slate-100 dark:active:bg-slate-800"><X className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={() => setRows((rs) => [...rs, { name: '', price: '' }])} data-testid="cut-price-add"
          className="flex items-center gap-1.5 text-sm font-semibold text-accent-600 dark:text-accent-400 active:opacity-70"><Plus className="w-4 h-4" /> Tambah jenis</button>
      </div>

      <Button size="full" onClick={save} loading={busy} disabled={!dirty} data-testid="cut-price-save">Simpan Harga</Button>
    </Card>
  );
}
