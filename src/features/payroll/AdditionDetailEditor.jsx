import { Plus, X } from 'lucide-react';
import { Input, NominalInput, Select } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import {
  DETAIL_KIND, CUSTOM_CUT, CUT_UNIT, detailTitle, emptyRow, withCutType, detailTotal, detailPieces,
} from './additionDetail';

/**
 * AdditionDetailEditor — isian rincian Tambahan (Ongkir: nama customer + jumlah; Potong Ayam: jenis + jml + harga).
 * Nominal Tambahan = total rincian (dihitung di AdjustmentFields / quickEntryMath, bukan di sini).
 * `detail` = { kind, rows } dengan angka berupa teks digit; aturan dan validasi ada di additionDetail.js.
 */
const REMOVE = 'shrink-0 mt-1.5 w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 active:bg-slate-100 dark:active:bg-slate-800';

export default function AdditionDetailEditor({ detail, onChange, onClose, cutPrices }) {
  const { formatRupiah } = useAppContext();
  const { kind, rows } = detail;
  const isOngkir = kind === DETAIL_KIND.ONGKIR;

  const patchRow = (i, patch) => onChange({ ...detail, rows: rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const changeType = (i, type) => onChange({ ...detail, rows: rows.map((r, j) => (j === i ? withCutType(r, type, cutPrices) : r)) });
  const addRow = () => onChange({ ...detail, rows: [...rows, emptyRow(kind, cutPrices)] });
  const removeRow = (i) => onChange({ ...detail, rows: rows.length === 1 ? [emptyRow(kind, cutPrices)] : rows.filter((_, j) => j !== i) });

  const total = detailTotal(detail);

  return (
    <div className="rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3 space-y-2.5" data-testid="detail-editor">
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{detailTitle(kind)}</span>
        <button type="button" onClick={onClose} data-testid="detail-close" className="text-xs font-semibold text-slate-500 dark:text-slate-400 active:text-accent-600">Tutup</button>
      </div>

      {rows.map((r, i) => (
        <div key={i} className="space-y-1.5" data-testid="detail-input-row">
          {isOngkir ? (
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0"><Input placeholder="Nama customer" value={r.customer} onChange={(e) => patchRow(i, { customer: e.target.value })} aria-label="Nama customer" /></div>
              <div className="w-32 shrink-0"><NominalInput title="Jumlah ongkir" placeholder="0" value={r.amount} onChange={(e) => patchRow(i, { amount: e.target.value })} /></div>
              <button type="button" aria-label="Hapus baris" onClick={() => removeRow(i)} className={REMOVE}><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <Select value={r.type} onChange={(e) => changeType(i, e.target.value)} aria-label="Jenis potongan">
                    {cutPrices.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                    <option value={CUSTOM_CUT}>{CUSTOM_CUT}</option>
                  </Select>
                </div>
                <div className="w-16 shrink-0"><Input type="number" inputMode="numeric" min="1" placeholder="Jml" value={r.qty} onChange={(e) => patchRow(i, { qty: e.target.value })} aria-label={`Jumlah ${CUT_UNIT}`} /></div>
                <div className="w-28 shrink-0"><NominalInput title={`Harga per ${CUT_UNIT}`} placeholder="0" value={r.price} onChange={(e) => patchRow(i, { price: e.target.value })} /></div>
                <button type="button" aria-label="Hapus baris" onClick={() => removeRow(i)} className={REMOVE}><X className="w-4 h-4" /></button>
              </div>
              {r.type === CUSTOM_CUT && <Input placeholder="Nama potongan (mis. Kepala ayam)" value={r.name} onChange={(e) => patchRow(i, { name: e.target.value })} aria-label="Nama potongan" />}
            </>
          )}
        </div>
      ))}

      <button type="button" onClick={addRow} data-testid="detail-add-row" className="flex items-center gap-1.5 text-sm font-semibold text-accent-600 dark:text-accent-400 active:opacity-70">
        <Plus className="w-4 h-4" /> Tambah baris
      </button>

      <div className="flex items-baseline justify-between border-t border-slate-200 dark:border-slate-800 pt-2 text-sm">
        <span className="text-slate-500 dark:text-slate-400">{isOngkir ? 'Total ongkir' : `Total upah potong · ${detailPieces(detail)} ${CUT_UNIT}`}</span>
        <span className="font-bold text-slate-800 dark:text-slate-100" data-testid="detail-total">{formatRupiah(total)}</span>
      </div>
    </div>
  );
}
