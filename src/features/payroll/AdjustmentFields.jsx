import { Plus } from 'lucide-react';
import { PillTabs, Input, NominalInput } from '../../components/ui';
import CategorySelect from '../../components/CategorySelect';
import AdditionDetailEditor from './AdditionDetailEditor';
import { useAppSettings } from '../../hook/useAppSettings';
import { detailKindForCategory, startDetail, detailTotal, detailForForm, sanitizeCutPrices } from './additionDetail';

/**
 * AdjustmentFields — isian Tambahan/Potongan gaji (jenis, kategori yang bisa dikelola,
 * keterangan, nominal, tanggal). Dipakai form di Penggajian DAN sheet Tambah/Potongan di
 * Beranda, supaya keduanya selalu sama persis.
 *
 * `form` = { type: 'potongan' | 'tambahan', category, label, amount, date, detail? }
 * `categories` = { tambahan: string[], potongan: string[] } (usePayrollCategories().categories)
 * `lockType` = sembunyikan pilihan Tambahan/Potongan (dipakai saat MENGUBAH catatan yang sudah ada: jenisnya tidak boleh berganti)
 *
 * Tambahan berkategori Ongkir / Potong Ayam punya opsi "Tambahkan detail": nominal jadi total rincian
 * (terkunci) dan tersimpan di `form.detail` (lihat additionDetail.js).
 */
export default function AdjustmentFields({ form, onChange, categories, onManage, minDate, maxDate, labelPlaceholder = 'Keterangan', lockType = false }) {
  const { settings } = useAppSettings();
  const cutPrices = sanitizeCutPrices(settings.potong_ayam_prices);
  const firstCat = (type) => (categories[type] || [])[0] || '';
  const kind = form.type === 'tambahan' ? detailKindForCategory(form.category) : null;
  // Rincian dari database (mode ubah) tidak punya `type`: disesuaikan dulu supaya kolom Jenis terisi (detailForForm).
  const detail = kind && form.detail?.kind === kind ? detailForForm(form.detail, cutPrices) : null;

  return (
    <>
      {!lockType && (
        <PillTabs value={form.type} onChange={(v) => onChange({ ...form, type: v, category: firstCat(v), detail: null })}
          options={[{ value: 'tambahan', label: 'Tambahan' }, { value: 'potongan', label: 'Potongan' }]} />
      )}
      <CategorySelect value={form.category} onChange={(v) => onChange({ ...form, category: v, detail: null })} options={categories[form.type] || []} onManage={onManage} />

      {kind && !detail && (
        <button type="button" onClick={() => onChange({ ...form, detail: startDetail(kind, cutPrices) })} data-testid="detail-open"
          className="flex items-center gap-1.5 text-sm font-semibold text-accent-600 dark:text-accent-400 active:opacity-70">
          <Plus className="w-4 h-4" /> Tambahkan detail
        </button>
      )}
      {detail && <AdditionDetailEditor detail={detail} cutPrices={cutPrices} onChange={(d) => onChange({ ...form, detail: d })} onClose={() => onChange({ ...form, detail: null })} />}

      <Input placeholder={detail ? 'Keterangan (kosong = otomatis)' : labelPlaceholder} value={form.label} onChange={e => onChange({ ...form, label: e.target.value })} />
      {detail
        ? <NominalInput readOnly title="Nominal" value={String(detailTotal(detail))} hint="Otomatis dari detail" />
        : <NominalInput title="Nominal" placeholder="Nominal" value={form.amount} onChange={e => onChange({ ...form, amount: e.target.value })} />}
      <Input type="date" value={form.date} min={minDate} max={maxDate} onChange={e => onChange({ ...form, date: e.target.value })} />
    </>
  );
}
