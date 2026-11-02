import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Copy, MessageCircle, Plus } from 'lucide-react';
import { Card, Badge, Button, Modal, Textarea } from '../../components/ui';
import { base } from '../../components/ui/Input';
import useDirty from '../../hook/useDirty';
import { copyText } from '../../lib/copyText';
import { showToast } from '../../lib/toast';
import { STATUS_META } from './stockMath';
import { suggestShoppingItems, addCustomItem, checkedCount, shoppingText } from './shoppingList';

const LBL = 'text-slate-400 dark:text-slate-500';

/**
 * ShoppingListSheet — daftar belanja dari isi stok satu hari, untuk ditempel di WhatsApp.
 * Item Habis/Menipis muncul dan dicentang otomatis (sisa masak muncul tapi tidak dicentang); jumlah diketik bebas
 * ("5 kg"); item di luar stok bisa ditambah. Teks WhatsApp terbentuk otomatis di panel bawah yang bisa dilipat
 * (tertutup di awal supaya layar tidak penuh), bisa diedit manual, lalu Salin atau buka WhatsApp.
 * Tidak ada yang disimpan ke server: daftar hanya hidup selama sheet terbuka.
 *
 * `groups` = hasil `dayItems(...).groups` (belum disaring), `dateLabel` = tanggal belanja untuk judul teks,
 * `sourceLabel` = tanggal stok yang jadi sumber.
 */
export default function ShoppingListSheet({ open, onClose, groups, dateLabel, sourceLabel }) {
  const [items, setItems] = useState(() => suggestShoppingItems(groups));
  const [extra, setExtra] = useState('');
  const [manual, setManual] = useState(null);     // teks hasil ketikan tangan; null = ikut hasil otomatis
  const [expanded, setExpanded] = useState(false);

  // Dibuka lagi = mulai dari usulan baru.
  useEffect(() => {
    if (!open) return;
    setItems(suggestShoppingItems(groups));
    setExtra(''); setManual(null); setExpanded(false);
  }, [open, groups]);

  const { dirty, rebase } = useDirty(open, [items.map((i) => [i.id, i.checked, i.qty]), extra, manual]);
  const auto = useMemo(() => shoppingText(items, dateLabel), [items, dateLabel]);
  const text = manual ?? auto;
  const count = checkedCount(items);

  // Mengubah daftar membuat teks mengikuti daftar lagi (ketikan tangan sebelumnya dibuang).
  const update = (fn) => { setItems(fn); setManual(null); };
  const toggle = (id) => update((list) => list.map((i) => (i.id === id ? { ...i, checked: !i.checked } : i)));
  const setQty = (id, qty) => update((list) => list.map((i) => (i.id === id ? { ...i, qty } : i)));
  const add = () => {
    if (!extra.trim()) return;
    update((list) => addCustomItem(list, extra));
    setExtra('');
  };

  const needItems = () => { if (count === 0) { showToast('Centang minimal satu item dulu', { type: 'error' }); return true; } return false; };
  const copy = async () => {
    if (needItems()) return;
    if (await copyText(text)) { showToast('Daftar belanja disalin'); rebase(); }
    else { setExpanded(true); showToast('Tidak bisa menyalin otomatis. Tekan lama teksnya lalu pilih Salin.', { type: 'error' }); }
  };
  const openWhatsApp = () => {
    if (needItems()) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    rebase();
  };

  return (
    <Modal isOpen={open} onClose={onClose} sheet size="lg" maxHeight title="Daftar belanja" dirty={dirty}>
      <div className="p-5 pt-1 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]" data-testid="stok-belanja-daftar">
        <p className={`text-xs ${LBL}`}>Dari stok {sourceLabel}. Centang yang mau dibeli, isi jumlahnya (mis. 5 kg).</p>

        {items.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-4" data-testid="belanja-kosong">Tidak ada item habis atau menipis. Tambahkan sendiri di bawah.</p>
        ) : (
          <Card padding="none" className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-2.5" data-testid={`belanja-baris-${i.id}`}>
                <input
                  id={`belanja-${i.id}`} type="checkbox" checked={i.checked} onChange={() => toggle(i.id)}
                  className="w-5 h-5 shrink-0 accent-accent-500" data-testid={`belanja-cek-${i.id}`}
                />
                <label htmlFor={`belanja-${i.id}`} className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{i.name}</span>
                  <span className="flex items-center gap-1.5 mt-0.5">
                    {i.status ? <Badge variant={STATUS_META[i.status].badge}>{STATUS_META[i.status].label}</Badge> : <Badge variant="neutral">Tambahan</Badge>}
                    {i.category && <span className={`text-xs truncate ${LBL}`}>{i.category}</span>}
                  </span>
                </label>
                <input
                  value={i.qty} onChange={(e) => setQty(i.id, e.target.value)} placeholder="Jumlah" aria-label={`Jumlah ${i.name}`}
                  className={`${base('muted')} !w-24 !p-2 text-center shrink-0`} data-testid={`belanja-jumlah-${i.id}`}
                />
              </div>
            ))}
          </Card>
        )}

        <div className="flex items-center gap-2">
          <input
            value={extra} onChange={(e) => setExtra(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
            placeholder="Tambah item, mis. Kantong kresek" aria-label="Tambah item belanja"
            className={`${base('muted')} flex-1 min-w-0`} data-testid="belanja-tambah-input"
          />
          <Button variant="secondary" onClick={add} aria-label="Tambah item" icon={<Plus className="w-4 h-4" />} data-testid="belanja-tambah" />
        </div>

        {/* Panel teks WhatsApp: menempel di bawah, tertutup di awal; Salin dan WhatsApp tetap terjangkau saat tertutup. */}
        <div className="sticky bottom-0 -mx-5 px-5 pt-2 pb-1 bg-white dark:bg-slate-900" data-testid="belanja-panel">
          <Card padding="none" className="shadow-lg">
            <div className="flex items-center gap-2 p-2 pl-4">
              <button
                type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded} data-testid="belanja-panel-toggle"
                className="flex-1 min-w-0 flex items-center gap-2 py-2 text-left active:opacity-70"
              >
                {expanded ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronUp className="w-4 h-4 shrink-0" />}
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Teks WhatsApp</span>
                <span className={`text-xs ${LBL}`}>{count} item</span>
              </button>
              <Button size="sm" onClick={copy} icon={<Copy className="w-3.5 h-3.5" />} data-testid="belanja-salin">Salin</Button>
              <Button variant="secondary" size="sm" onClick={openWhatsApp} aria-label="Buka WhatsApp" icon={<MessageCircle className="w-3.5 h-3.5" />} data-testid="belanja-wa">WA</Button>
            </div>
            {expanded && (
              <div className="px-4 pb-3" data-testid="belanja-teks">
                <Textarea
                  rows={8} variant="muted" value={text} aria-label="Teks daftar belanja" className="font-mono !text-[13px] leading-relaxed"
                  onChange={(e) => setManual(e.target.value)}
                />
              </div>
            )}
          </Card>
        </div>
      </div>
    </Modal>
  );
}
