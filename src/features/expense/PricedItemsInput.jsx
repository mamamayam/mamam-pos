import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { NominalInput } from '../../components/ui';
import { emptyRow } from './expenseItems';

/**
 * PricedItemsInput — daftar poin Detail Pengeluaran yang tiap barisnya boleh diberi harga (mode "Harga per item").
 * Kembaran BulletListInput (Enter = poin baru, Backspace di poin kosong = hapus, tempel teks multi-baris dipecah
 * jadi poin), ditambah kolom harga per baris. Kolom harga = NominalInput yang SAMA dengan Jumlah (keypad angka dengan
 * kalkulator), bukan keyboard HP; keypad pindah ke kolom lain kalau kolom lain diketuk.
 *
 * Kontrak: value = [{ t: nama, p: harga berupa teks digit }] (minimal satu baris), onChange(rows).
 * Aturan hitung dan simpan ada di expenseItems.js; komponen ini hanya mengubah isian.
 */
const stripBullet = (line) => line.replace(/^\s*(?:[-•*]\s+|\d+[.)]\s+)/, '').trim();

export default function PricedItemsInput({ value, onChange, placeholder = 'Opsional, mis. Ayam 5 kg', nextPlaceholder = 'Poin berikutnya' }) {
  const rows = value && value.length ? value : [emptyRow()];
  const refs = useRef([]);
  const pendingFocus = useRef(null);

  // Pindahkan fokus setelah render yang menambah/menghapus poin.
  useEffect(() => {
    if (pendingFocus.current == null) return;
    const el = refs.current[pendingFocus.current];
    pendingFocus.current = null;
    if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch { /* abaikan */ } }
  });

  const patch = (i, part) => onChange(rows.map((r, idx) => (idx === i ? { ...r, ...part } : r)));

  const addAfter = (i) => {
    if (!rows[i].t.trim()) return;                    // jangan bikin poin kosong berderet
    pendingFocus.current = i + 1;
    onChange([...rows.slice(0, i + 1), emptyRow(), ...rows.slice(i + 1)]);
  };

  const removeAt = (i) => {
    if (rows.length === 1) { onChange([emptyRow()]); return; }
    pendingFocus.current = Math.max(0, i - 1);
    onChange(rows.filter((_, idx) => idx !== i));
  };

  const handleKeyDown = (e, i) => {
    if (e.key === 'Enter') { e.preventDefault(); addAfter(i); }
    else if (e.key === 'Backspace' && rows[i].t === '' && rows.length > 1) { e.preventDefault(); removeAt(i); }
  };

  const handlePaste = (e, i) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (!/\r?\n/.test(text)) return;                  // satu baris: biarkan paste biasa
    e.preventDefault();
    const lines = text.split(/\r?\n/).map(stripBullet).filter(Boolean);
    if (lines.length === 0) return;
    const keepCurrent = rows[i].t.trim() || rows[i].p ? [rows[i]] : [];
    pendingFocus.current = i + keepCurrent.length + lines.length - 1;
    onChange([...rows.slice(0, i), ...keepCurrent, ...lines.map((t) => ({ t, p: '' })), ...rows.slice(i + 1)]);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 focus-within:border-accent-500 focus-within:ring-2 focus-within:ring-accent-500/20 transition-all duration-300" data-testid="priced-items">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 min-h-11" data-testid="priced-row">
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 shrink-0 ml-0.5" />
          {/* <form> hanya membungkus kolom nama: tombol Enter/"Next" keyboard HP yang tidak mengirim keydown tetap membuat poin baru. */}
          <form onSubmit={(e) => { e.preventDefault(); addAfter(i); }} className="flex-1 min-w-0">
            <input
              ref={(el) => { refs.current[i] = el; }}
              value={r.t}
              onChange={(e) => patch(i, { t: e.target.value })}
              onKeyDown={(e) => handleKeyDown(e, i)}
              onPaste={(e) => handlePaste(e, i)}
              enterKeyHint="next"
              autoComplete="off"
              placeholder={i === 0 ? placeholder : nextPlaceholder}
              aria-label={`Poin ${i + 1}`}
              data-testid="priced-name"
              className="w-full min-w-0 bg-transparent h-10 text-sm font-medium text-slate-800 dark:text-slate-100 outline-none placeholder:text-slate-300 dark:placeholder:text-slate-600"
            />
          </form>
          <div className="relative w-24 h-[34px] shrink-0">
            <span aria-hidden="true" className="absolute left-2 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 dark:text-slate-500 pointer-events-none">Rp</span>
            <NominalInput
              bare
              title={`Harga ${r.t.trim() || `poin ${i + 1}`}`}
              value={r.p}
              onChange={(e) => patch(i, { p: e.target.value })}
              placeholder="Harga"
              aria-label={`Harga poin ${i + 1}`}
              data-testid="priced-price"
              className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-7 pr-2 text-right truncate text-[13.5px] font-bold tabular-nums text-slate-800 dark:text-slate-100 outline-none focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-500/20"
            />
          </div>
          {rows.length > 1 && (
            <button type="button" onClick={() => removeAt(i)} aria-label="Hapus poin" className="p-1 rounded-full text-slate-300 dark:text-slate-600 hover:text-red-500 active:scale-90 transition-all shrink-0">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
