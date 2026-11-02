import { useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, MessageCircle, Plus } from 'lucide-react';
import { Card, Button, Textarea } from '../../components/ui';
import { base } from '../../components/ui/Input';
import useDirty from '../../hook/useDirty';
import { copyText } from '../../lib/copyText';
import { showToast } from '../../lib/toast';
import { initialSelection, findRowId, addExtra, selectedItems, shoppingText } from './shoppingList';

const LBL = 'text-slate-400 dark:text-slate-500';

/**
 * Daftar belanja yang dicentang LANGSUNG di daftar stok sheet hari (tanpa popup baru), supaya sisa stok tetap kelihatan
 * di baris yang sama. State-nya satu hook (`useShopping`); tampilannya tiga potong: `ShopCheck` + `ShopQty` di tiap baris
 * stok, `ShopExtras` untuk item di luar stok, dan `ShopBar` (panel teks WhatsApp yang menempel di bawah, terlipat di awal).
 * Tidak ada yang disimpan ke server: daftar hanya hidup selama sheet hari terbuka.
 *
 * `groups` = hasil `dayItems(...).groups` (belum disaring; centang tetap ada walau filter status berganti),
 * `dateLabel` = tanggal belanja untuk judul teks.
 */
export function useShopping(groups, dateLabel) {
  const [on, setOn] = useState(false);              // mode belanja (centang tampil)
  const [sel, setSel] = useState({});               // { [itemId]: { on, qty } }
  const [extras, setExtras] = useState([]);         // item di luar stok
  const [manual, setManual] = useState(null);       // teks hasil ketikan tangan; null = ikut hasil otomatis
  const [expanded, setExpanded] = useState(false);  // panel teks terbuka?

  const { dirty, rebase } = useDirty(on, [sel, extras, manual]);
  const items = useMemo(() => selectedItems(groups, sel, extras), [groups, sel, extras]);
  const text = manual ?? shoppingText(items, dateLabel);

  // Mengubah daftar membuat teks mengikuti daftar lagi (ketikan tangan sebelumnya dibuang).
  const touch = () => setManual(null);
  const patch = (id, fn) => { setSel((s) => ({ ...s, [id]: fn(s[id] ?? { on: false, qty: '' }) })); touch(); };

  const needItems = () => {
    if (items.length === 0) { showToast('Centang minimal satu item dulu', { type: 'error' }); return true; }
    return false;
  };

  return {
    on, dirty, items, text, expanded, extras,
    start: () => { setSel(initialSelection(groups)); setExtras([]); setManual(null); setExpanded(false); setOn(true); },
    stop: () => { setOn(false); setExpanded(false); },
    isOn: (id) => Boolean(sel[id]?.on),
    qtyOf: (id) => sel[id]?.qty ?? '',
    toggle: (id) => patch(id, (s) => ({ ...s, on: !s.on })),
    setQty: (id, qty) => patch(id, (s) => ({ ...s, qty })),
    toggleExtra: (id) => { setExtras((list) => list.map((e) => (e.id === id ? { ...e, on: !e.on } : e))); touch(); },
    setExtraQty: (id, qty) => { setExtras((list) => list.map((e) => (e.id === id ? { ...e, qty } : e))); touch(); },
    /** Nama yang sama dengan item stok = centang item itu; selain itu jadi item tambahan. Mengembalikan false kalau nama kosong. */
    addByName: (name) => {
      if (!String(name ?? '').trim()) return false;
      const id = findRowId(groups, name);
      if (id) patch(id, (s) => ({ ...s, on: true }));
      else { setExtras((list) => addExtra(list, name)); touch(); }
      return true;
    },
    setText: setManual,
    toggleExpanded: () => setExpanded((v) => !v),
    copy: async () => {
      if (needItems()) return;
      if (await copyText(text)) { showToast('Daftar belanja disalin'); rebase(); }
      else { setExpanded(true); showToast('Tidak bisa menyalin otomatis. Tekan lama teksnya lalu pilih Salin.', { type: 'error' }); }
    },
    openWhatsApp: () => {
      if (needItems()) return;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
      rebase();
    },
  };
}

/** Kotak centang oranye dengan tanda centang putih (bukan checkbox bawaan browser, yang bisa tampil hitam). */
export function ShopCheck({ checked, onToggle, label, testId }) {
  return (
    <button
      type="button" role="checkbox" aria-checked={checked} aria-label={label} onClick={onToggle} data-testid={testId}
      className={`w-6 h-6 shrink-0 rounded-lg border-2 flex items-center justify-center transition-all active:scale-90 ${checked ? 'bg-accent-500 border-accent-500 text-white' : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`}
    >
      {checked && <Check className="w-4 h-4" strokeWidth={3} />}
    </button>
  );
}

/** Kolom jumlah beli (teks bebas, mis. "5 kg"); dipasang di bawah baris stok yang dicentang. */
export function ShopQty({ value, onChange, label, testId }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder="Jumlah beli, mis. 5 kg" aria-label={label} data-testid={testId}
      className={`${base('muted')} !p-2 !text-xs mt-2`}
    />
  );
}

/** Item di luar stok (mis. Kantong kresek) + kolom untuk menambahnya. Hanya tampil di mode belanja. */
export function ShopExtras({ shop }) {
  const [text, setText] = useState('');
  const add = () => { if (shop.addByName(text)) setText(''); };
  return (
    <div data-testid="belanja-tambahan">
      <p className="text-xs font-bold tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">TAMBAHAN DI LUAR STOK</p>
      <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
        {shop.extras.map((e) => (
          <div key={e.id} className="px-4 py-2.5" data-testid={`belanja-extra-${e.id}`}>
            <div className="flex items-center gap-3">
              <ShopCheck checked={e.on} onToggle={() => shop.toggleExtra(e.id)} label={e.name} />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 min-w-0 truncate">{e.name}</p>
            </div>
            {e.on && <ShopQty value={e.qty} onChange={(v) => shop.setExtraQty(e.id, v)} label={`Jumlah beli ${e.name}`} />}
          </div>
        ))}
        <div className="flex items-center gap-2 p-3">
          <input
            value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="Tambah item, mis. Kantong kresek" aria-label="Tambah item belanja"
            className={`${base('muted')} flex-1 min-w-0`} data-testid="belanja-tambah-input"
          />
          <Button variant="secondary" onClick={add} aria-label="Tambah item" icon={<Plus className="w-4 h-4" />} data-testid="belanja-tambah" />
        </div>
      </Card>
    </div>
  );
}

/**
 * Panel teks WhatsApp: menempel di bawah isi sheet (`sticky`), terlipat di awal supaya layar tidak penuh;
 * Salin dan WA tetap terjangkau saat terlipat. Teks bisa diedit manual setelah dibuka.
 */
export function ShopBar({ shop }) {
  const count = shop.items.length;
  return (
    <div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-1 bg-white dark:bg-slate-900" data-testid="belanja-panel">
      <Card padding="none" className="shadow-lg">
        <div className="flex items-center gap-2 p-2 pl-4">
          <button
            type="button" onClick={shop.toggleExpanded} aria-expanded={shop.expanded} data-testid="belanja-panel-toggle"
            className="flex-1 min-w-0 flex items-center gap-2 py-2 text-left active:opacity-70"
          >
            {shop.expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronUp className="w-4 h-4 shrink-0" />}
            <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Teks WhatsApp</span>
            <span className={`text-xs ${LBL}`}>{count} item</span>
          </button>
          <Button size="sm" onClick={shop.copy} icon={<Copy className="w-3.5 h-3.5" />} data-testid="belanja-salin">Salin</Button>
          <Button variant="secondary" size="sm" onClick={shop.openWhatsApp} aria-label="Buka WhatsApp" icon={<MessageCircle className="w-3.5 h-3.5" />} data-testid="belanja-wa">WA</Button>
        </div>
        {shop.expanded && (
          <div className="px-4 pb-3" data-testid="belanja-teks">
            <Textarea
              rows={8} variant="muted" value={shop.text} aria-label="Teks daftar belanja" className="font-mono !text-[13px] leading-relaxed"
              onChange={(e) => shop.setText(e.target.value)}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
