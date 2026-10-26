import { useState, useEffect, useMemo } from 'react';
import { Input, NominalInput, Select, Button, Modal, BulletListInput } from '../../components/ui';
import CategoryModal from '../../components/CategoryModal';
import CategorySelect from '../../components/CategorySelect';
import { storeExpenseCategories } from './expenseCategories';
import { useAppContext } from '../../context/AppContext';
import { toLocalDateString } from '../../utils/formatters';
import { showToast } from '../../lib/toast';
import useDirty from '../../hook/useDirty';

/**
 * ExpenseFormSheet — form Tambah/Edit Pengeluaran (bottom sheet) + Kelola Kategori.
 * Dipakai layar Pengeluaran DAN tombol "Pengeluaran" di Beranda, supaya keduanya
 * selalu sama persis (kategori dropdown yang bisa dikelola, Sumber Dana, kurir, detail).
 *
 * Props:
 *   isOpen, onClose
 *   editing  — catatan yang diedit ({ id, amount, category, supplier, note, date, paymentMethod, cashHolderEmployeeId }) atau null untuk baru
 *   data     — hasil useExpenseData() (categories, employees, saveExpense, setCategoriesPersist, renameCategory, deleteCategory)
 *   onSaved  — dipanggil setelah berhasil menyimpan (mis. memuat ulang daftar di belakangnya)
 *
 * Tanggal diperlakukan sebagai string "YYYY-MM-DD" apa adanya (jangan di-parse sebagai UTC).
 *
 * Setelah simpan: toast "tersimpan". Catatan BARU tidak menutup form, melainkan mengosongkannya untuk catatan
 * berikutnya (pemilik biasa mencatat banyak sekaligus). Mode ubah menutup form setelah simpan.
 * Menutup form yang sudah terisi (X, Back, tarik ke bawah, ketuk latar) memunculkan konfirmasi (Modal `dirty`).
 */

const dayOf = (v) => String(v).slice(0, 10);
// Detail disimpan sebagai teks, satu poin per baris. Catatan lama (satu baris) = satu poin.
const noteLines = (note) => String(note || '').split(/\r?\n/).map(t => t.trim()).filter(Boolean);
const toItems = (note) => { const l = noteLines(note); return l.length ? l : ['']; };

export default function ExpenseFormSheet({ isOpen, onClose, editing = null, data, onSaved }) {
  const { triggerAlert, triggerConfirm } = useAppContext();
  const { categories, employees, saveExpense, setCategoriesPersist, renameCategory, deleteCategory } = data;

  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [supplier, setSupplier] = useState('');
  const [detailItems, setDetailItems] = useState(['']);
  const [dateInput, setDateInput] = useState(toLocalDateString());
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [cashHolderId, setCashHolderId] = useState('kasir');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Isi ulang form tiap sheet dibuka: dari catatan yang diedit, atau kosong untuk catatan baru.
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      setAmount(String(editing.amount));
      setCategory(editing.category);
      setSupplier(editing.supplier || '');
      setDetailItems(toItems(editing.note));
      setDateInput(dayOf(editing.date));
      setPaymentMethod(editing.paymentMethod === 'Non-Tunai' ? 'Non-Tunai' : 'Tunai');
      setCashHolderId(editing.cashHolderEmployeeId || 'kasir');
    } else {
      setAmount(''); setCategory(''); setSupplier(''); setDetailItems(['']);
      setDateInput(toLocalDateString()); setPaymentMethod('Tunai'); setCashHolderId('kasir');
    }
  }, [isOpen, editing]);

  const { dirty, rebase } = useDirty(isOpen, [amount, category, supplier, detailItems, dateInput, paymentMethod, cashHolderId]);

  const resetForm = () => {
    setAmount(''); setCategory(''); setSupplier(''); setDetailItems(['']);
    setDateInput(toLocalDateString()); setPaymentMethod('Tunai'); setCashHolderId('kasir');
    rebase();
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const couriers = useMemo(
    () => employees.filter(e => e.role === 'kurir' && e.status !== 'resign'),
    [employees]
  );

  const showHolder = paymentMethod === 'Tunai' && couriers.length > 0;

  const handleSave = () => run(async () => {
    const holder = paymentMethod === 'Tunai' && cashHolderId !== 'kasir' ? couriers.find(c => c.id === cashHolderId) : null;
    await saveExpense({
      id: editing?.id || null, amount, category, note: detailItems.map(t => t.trim()).filter(Boolean).join('\n'),
      supplier: supplier.trim(), date: dateInput, paymentMethod,
      cashHolderEmployeeId: holder?.id || null, cashHolderName: holder?.name || null,
    });
    onSaved?.();
    if (editing) {
      showToast('Pengeluaran diperbarui');
      onClose();
    } else {
      showToast('Pengeluaran tersimpan');
      resetForm();
    }
  });

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} dirty={dirty} sheet size="lg" maxHeight title={editing ? 'Edit Pengeluaran' : 'Tambah Pengeluaran'}>
        <div className="p-5 pt-2 space-y-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {/* Urutan mengikuti kebiasaan mengisi: kategori -> toko -> detail belanjaan -> jumlah,
              lalu Sumber Dana dan Sumber Uang berdampingan (satu konteks), tanggal terakhir. */}
          <CategorySelect value={category} onChange={setCategory} options={storeExpenseCategories(categories)} onManage={() => setIsCategoryModalOpen(true)} />

          <Input label="Nama Toko/Supplier" value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Opsional" />

          <BulletListInput label="Detail" value={detailItems} onChange={setDetailItems} placeholder="Opsional, mis. Ayam 5 kg" />

          <div className="grid grid-cols-2 gap-4 items-start">
            <NominalInput label="Jumlah" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0" />
            <Input type="date" label="Tanggal Transaksi" value={dateInput} onChange={e => setDateInput(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4 items-end">
            <div className={showHolder ? '' : 'col-span-2'}>
              <Select label="Sumber Dana" value={paymentMethod}
                onChange={e => { setPaymentMethod(e.target.value); if (e.target.value === 'Non-Tunai') setCashHolderId('kasir'); }}>
                <option value="Tunai">Tunai</option>
                <option value="Non-Tunai">Non-Tunai</option>
              </Select>
            </div>
            {showHolder && (
              <div>
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1.5">Uang Siapa?</label>
                <Select title="Dibayar Pakai Uang Siapa?" value={cashHolderId} onChange={e => setCashHolderId(e.target.value)}>
                  <option value="kasir">Dompet</option>
                  {couriers.map(c => <option key={c.id} value={c.id}>{c.name} (Kurir)</option>)}
                </Select>
              </div>
            )}
          </div>

          <Button onClick={handleSave} disabled={busy} size="full" className="mt-2">
            {busy ? 'Menyimpan...' : editing ? 'Perbarui Data' : 'Simpan Data'}
          </Button>
        </div>
      </Modal>

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Kelola Kategori Pengeluaran"
        categories={categories}
        setCategories={(next) => run(() => setCategoriesPersist(next))}
        triggerAlert={triggerAlert}
        triggerConfirm={triggerConfirm}
        deleteMessage={(cat) => `Yakin ingin menghapus kategori "${cat}"? Catatan pengeluaran lama tetap tersimpan dengan nama kategori ini.`}
        onRenameAsync={(oldCat, newCat) => {
          run(() => renameCategory(oldCat, newCat));
          if (category === oldCat) setCategory(newCat);
        }}
        onDeleteAsync={(deletedCat) => {
          run(() => deleteCategory(deletedCat));
          if (category === deletedCat) setCategory(categories.find(c => c !== deletedCat) || '');
        }}
      />
    </>
  );
}
