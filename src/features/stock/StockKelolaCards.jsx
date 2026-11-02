import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { showToast } from '../../lib/toast';
import { itemsWithoutPrice } from './opnameMath';

/**
 * Dua card baru di tab Kelola (owner), TERTUTUP dulu supaya ringkas:
 *  1. Wajib atau opsional (harian): item mana yang wajib diisi staf tiap hari (menahan Absen Pulang). Saat mode opname aktif semua otomatis wajib.
 *  2. Harga modal: harga per satuan tiap item, dasar nilai stok opname untuk Income Statement. Hanya owner (staf tidak melihat tab Kelola).
 * Tiap perubahan langsung tersimpan (seperti bagian Kelola lain). Kategori/item/satuan/batas/urutan tetap di bawahnya, tidak berubah.
 */
const LBL = 'text-slate-400 dark:text-slate-500';
const FIELD = 'min-w-0 px-2.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 placeholder:text-slate-300 dark:placeholder:text-slate-600';
const toastError = (e) => showToast(e?.message || 'Terjadi kesalahan', { type: 'error' });
const run = (fn, okMsg) => Promise.resolve().then(fn).then(() => { if (okMsg) showToast(okMsg); }).catch(toastError);

function Accordion({ title, summary, open, onToggle, testId, children }) {
  return (
    <Card padding="none" className="overflow-hidden" data-testid={testId}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 p-4 text-left">
        <div className="flex-1 min-w-0">
          <p className="font-heading text-sm font-bold text-slate-900 dark:text-slate-50">{title}</p>
          <p className={`text-xs ${LBL}`}>{summary}</p>
        </div>
        <ChevronRight className={`w-4 h-4 shrink-0 ${LBL} transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">{children}</div>}
    </Card>
  );
}

/** Pilihan dua sisi Wajib | Opsional untuk satu item. */
function RequiredToggle({ item, onChange }) {
  const btn = (on, label, value) => (
    <button
      type="button" aria-pressed={on === value} onClick={() => on !== value && onChange(value)}
      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${on === value ? (value ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 shadow-sm') : 'text-slate-400 dark:text-slate-500'}`}
    >{label}</button>
  );
  return <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0" role="group" aria-label={`Wajib atau opsional: ${item.name}`}>{btn(item.required, 'Wajib', true)}{btn(item.required, 'Opsional', false)}</div>;
}

function WajibCard({ stock }) {
  const [open, setOpen] = useState(false);
  const all = useMemo(() => stock.master.flatMap((c) => c.items), [stock.master]);
  const wajib = all.filter((i) => i.required).length;
  const setAll = (category, value) => run(async () => {
    for (const i of category.items) if (i.required !== value) await stock.updateItem(i.id, { required: value });
  }, value ? `Semua item ${category.name} jadi wajib` : `Semua item ${category.name} jadi opsional`);

  return (
    <Accordion title="Wajib atau opsional (harian)" summary={`${wajib} wajib · ${all.length - wajib} opsional`} open={open} onToggle={() => setOpen(!open)} testId="kelola-wajib">
      <p className={`text-xs ${LBL}`}>Item wajib harus diisi staf sebelum bisa menyimpan hasil (dan membuka Absen Pulang). Saat mode stok opname aktif, semua item otomatis wajib.</p>
      {stock.master.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/60 px-3 py-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{c.name} <span className={`font-medium ${LBL}`}>· {c.items.length} item</span></p>
            <div className="flex gap-3 shrink-0 text-[11px] font-semibold text-accent-600 dark:text-accent-400">
              <button type="button" onClick={() => setAll(c, true)} aria-label={`Semua ${c.name} wajib`}>Semua wajib</button>
              <button type="button" onClick={() => setAll(c, false)} aria-label={`Semua ${c.name} opsional`}>Semua opsional</button>
            </div>
          </div>
          {c.items.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 px-3 py-2 border-t border-slate-100 dark:border-slate-800" data-testid={`wajib-${i.id}`}>
              <div className="min-w-0">
                <p className="text-sm text-slate-800 dark:text-slate-100 truncate">{i.name}</p>
                <p className={`text-xs ${LBL}`}>{i.unit}</p>
              </div>
              <RequiredToggle item={i} onChange={(v) => run(() => stock.updateItem(i.id, { required: v }))} />
            </div>
          ))}
          {c.items.length === 0 && <p className={`text-xs px-3 py-2 ${LBL}`}>Belum ada item.</p>}
        </div>
      ))}
      <p className={`text-xs text-center ${LBL}`}>Perubahan langsung tersimpan.</p>
    </Accordion>
  );
}

/** Kolom harga satu item: digit saja, disimpan saat kolom ditinggalkan. Kosong = belum ada harga. */
function PriceRow({ item, stock }) {
  const has = item.unit_cost !== null && item.unit_cost !== undefined;
  const commit = (raw) => {
    const digits = String(raw).replace(/[^\d]/g, '');
    const next = digits === '' ? null : Number(digits);
    if (next === (has ? item.unit_cost : null)) return;
    run(() => stock.updateItem(item.id, { unit_cost: next }));
  };
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-slate-100 dark:border-slate-800 first:border-0" data-testid={`harga-${item.id}`}>
      <div className="min-w-0">
        <p className="text-sm text-slate-800 dark:text-slate-100 truncate">{item.name}</p>
        <p className={`text-xs ${LBL}`}>per {item.unit}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`text-xs ${LBL}`}>Rp</span>
        <input
          key={`p-${item.id}-${item.unit_cost ?? ''}`} defaultValue={has ? String(item.unit_cost) : ''} inputMode="numeric" placeholder="Isi harga" aria-label={`Harga modal ${item.name}`}
          onBlur={(e) => commit(e.target.value)}
          className={`${FIELD} w-24 text-right !font-bold ${has ? '' : 'border-red-300 dark:border-red-500/50 bg-red-50 dark:bg-red-500/10'}`}
        />
      </div>
    </div>
  );
}

function HargaCard({ stock }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('belum');
  const all = useMemo(() => stock.master.flatMap((c) => c.items), [stock.master]);
  const unpriced = itemsWithoutPrice(all).length;
  const groups = stock.master
    .map((c) => ({ ...c, shown: filter === 'belum' ? itemsWithoutPrice(c.items) : c.items }))
    .filter((c) => c.shown.length > 0);

  return (
    <Accordion
      title="Harga modal" open={open} onToggle={() => setOpen(!open)} testId="kelola-harga"
      summary={unpriced ? `${all.length - unpriced} terisi · ${unpriced} belum ada harga` : `Semua ${all.length} item sudah ada harga`}
    >
      <p className={`text-xs ${LBL}`}>Harga per satuan; dipakai menghitung nilai stok opname (jumlah × harga) untuk Income Statement. Hanya owner yang melihat ini.</p>
      <div className="flex gap-1.5" role="group" aria-label="Saring harga">
        {[['belum', `Belum ada harga (${unpriced})`], ['semua', `Semua (${all.length})`]].map(([k, label]) => (
          <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}
            className={`px-3 py-1 rounded-full text-xs font-bold border ${filter === k ? 'bg-accent-50 dark:bg-accent-500/10 border-accent-500 text-accent-700 dark:text-accent-400' : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>{label}</button>
        ))}
      </div>
      {groups.map((c) => (
        <div key={c.id} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <p className="bg-slate-50 dark:bg-slate-800/60 px-3 py-2 text-xs font-bold text-slate-700 dark:text-slate-200">{c.name}</p>
          {c.shown.map((i) => <PriceRow key={i.id} item={i} stock={stock} />)}
        </div>
      ))}
      {groups.length === 0 && <p className={`text-sm text-center py-3 ${LBL}`}>{filter === 'belum' ? 'Semua item sudah punya harga.' : 'Belum ada item.'}</p>}
      {filter === 'belum' && unpriced > 0 && <Button variant="secondary" size="full" onClick={() => setFilter('semua')}>Lihat semua item</Button>}
      <p className={`text-xs text-center ${LBL}`}>Harga disalin ke hasil hitungan penuh saat disimpan, jadi mengubahnya tidak mengubah nilai bulan lama.</p>
    </Accordion>
  );
}

export default function StockKelolaCards({ stock }) {
  return (
    <div className="space-y-3" data-testid="kelola-cards">
      <WajibCard stock={stock} />
      <HargaCard stock={stock} />
    </div>
  );
}
