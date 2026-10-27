import { useState } from 'react';
import { ArrowUp, ArrowDown, Trash2, Plus } from 'lucide-react';
import { Card, Button } from '../../components/ui';
import { useAppContext } from '../../context/AppContext';
import { showToast } from '../../lib/toast';
import { parseQty, formatQty } from './stockMath';

/**
 * StockManage — tab Kelola (owner, izin `stok.kelola`): kategori, item, satuan, batas menipis, wajib/opsional, urutan.
 * Tiap perubahan langsung tersimpan (seperti Kelola Kategori Pengeluaran): teks disimpan saat kolom ditinggalkan (blur).
 * Hapus = hard delete; menghapus item/kategori ikut menghapus riwayat isiannya.
 * Form TAMBAH tidak menutup: toast lalu dikosongkan untuk item berikutnya.
 */
const FIELD = 'min-w-0 px-2.5 py-2 text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-xl outline-none focus:border-accent-500 focus:ring-2 focus:ring-accent-500/20 placeholder:text-slate-300 dark:placeholder:text-slate-600';
const ICON_BTN = 'w-8 h-8 shrink-0 rounded-xl flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 active:scale-95';
const LBL = 'text-slate-400 dark:text-slate-500';
const toastError = (e) => showToast(e?.message || 'Terjadi kesalahan', { type: 'error' });
const run = (fn, okMsg) => Promise.resolve().then(fn).then(() => { if (okMsg) showToast(okMsg); }).catch(toastError);

function ItemRow({ item, stock, confirmDelete }) {
  const save = (patch) => run(() => stock.updateItem(item.id, patch));
  return (
    <div className="py-2.5 border-t border-slate-100 dark:border-slate-800" data-testid={`kelola-item-${item.id}`}>
      <div className="flex items-center gap-2">
        <input
          key={`n-${item.id}-${item.name}`} defaultValue={item.name} aria-label="Nama item" className={`${FIELD} flex-1`}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== item.name) save({ name: v }); else e.target.value = item.name; }}
        />
        <button type="button" className={ICON_BTN} aria-label={`Hapus ${item.name}`} onClick={() => confirmDelete(`Yakin menghapus item "${item.name}"? Riwayat isiannya ikut terhapus.`, () => run(() => stock.deleteItem(item.id), 'Item dihapus'))}><Trash2 className="w-4 h-4" /></button>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <input
          key={`u-${item.id}-${item.unit}`} defaultValue={item.unit} aria-label="Satuan" placeholder="satuan" className={`${FIELD} w-16`}
          onBlur={(e) => { const v = e.target.value.trim() || 'pcs'; if (v !== item.unit) save({ unit: v }); }}
        />
        <span className={`text-xs ${LBL}`}>Batas</span>
        <input
          key={`m-${item.id}-${item.min_qty}`} defaultValue={formatQty(item.min_qty) || '0'} inputMode="decimal" aria-label="Batas menipis" className={`${FIELD} w-14 text-center`}
          onBlur={(e) => { const v = parseQty(e.target.value) ?? 0; if (v !== item.min_qty) save({ min_qty: v }); else e.target.value = formatQty(item.min_qty) || '0'; }}
        />
        <button
          type="button" onClick={() => save({ required: !item.required })} aria-label={item.required ? 'Jadikan opsional' : 'Jadikan wajib'}
          className={`h-8 px-2.5 rounded-xl text-xs font-bold ${item.required ? 'bg-accent-50 dark:bg-accent-500/10 text-accent-700 dark:text-accent-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}
        >{item.required ? 'Wajib' : 'Opsional'}</button>
        <span className="flex-1" />
        <button type="button" className={ICON_BTN} aria-label="Naik" onClick={() => run(() => stock.moveItem(item.id, -1))}><ArrowUp className="w-4 h-4" /></button>
        <button type="button" className={ICON_BTN} aria-label="Turun" onClick={() => run(() => stock.moveItem(item.id, 1))}><ArrowDown className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function AddItem({ category, stock }) {
  const [f, setF] = useState({ name: '', unit: '', min: '' });
  const add = () => run(async () => {
    await stock.addItem(category.id, { name: f.name, unit: f.unit, min_qty: parseQty(f.min) ?? 0 });
    setF({ name: '', unit: '', min: '' });
  }, 'Item ditambah');
  return (
    <div className="flex items-center gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
      <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Item baru" aria-label={`Item baru di ${category.name}`} className={`${FIELD} flex-1`} />
      <input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="satuan" aria-label="Satuan item baru" className={`${FIELD} w-16`} />
      <Button size="sm" onClick={add} disabled={!f.name.trim()} icon={<Plus className="w-4 h-4" />} aria-label="Tambah item" />
    </div>
  );
}

export default function StockManage({ stock }) {
  const { triggerConfirm } = useAppContext();
  const [newCat, setNewCat] = useState('');
  const addCat = () => run(async () => { await stock.addCategory(newCat); setNewCat(''); }, 'Kategori ditambah');

  return (
    <div className="space-y-3" data-testid="stok-kelola">
      {stock.master.map((c) => (
        <Card key={c.id} padding="md">
          <div className="flex items-center gap-2 mb-1">
            <input
              key={`c-${c.id}-${c.name}`} defaultValue={c.name} aria-label="Nama kategori" className={`${FIELD} flex-1 !text-sm font-heading font-bold`}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) run(() => stock.renameCategory(c.id, v)); else e.target.value = c.name; }}
            />
            <button type="button" className={ICON_BTN} aria-label="Naik" onClick={() => run(() => stock.moveCategory(c.id, -1))}><ArrowUp className="w-4 h-4" /></button>
            <button type="button" className={ICON_BTN} aria-label="Turun" onClick={() => run(() => stock.moveCategory(c.id, 1))}><ArrowDown className="w-4 h-4" /></button>
            <button type="button" className={ICON_BTN} aria-label={`Hapus kategori ${c.name}`} onClick={() => triggerConfirm(`Yakin menghapus kategori "${c.name}" beserta ${c.items.length} item di dalamnya?`, () => run(() => stock.deleteCategory(c.id), 'Kategori dihapus'))}><Trash2 className="w-4 h-4" /></button>
          </div>
          {c.items.map((i) => <ItemRow key={i.id} item={i} stock={stock} confirmDelete={triggerConfirm} />)}
          <AddItem category={c} stock={stock} />
        </Card>
      ))}

      <div className="flex gap-2">
        <input value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="Nama kategori baru" aria-label="Nama kategori baru" className={`${FIELD} flex-1 !py-3 !text-sm`} />
        <Button variant="secondary" onClick={addCat} disabled={!newCat.trim()}>Tambah</Button>
      </div>
      <p className={`text-xs text-center ${LBL}`}>Batas menipis: stok sama atau di bawah angka ini dianggap hampir habis (0 = hanya Habis yang ditandai). Perubahan langsung tersimpan.</p>
    </div>
  );
}
