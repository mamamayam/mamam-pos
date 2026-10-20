import { useState, useEffect } from 'react';
import { Modal, Button, Select, PillTabs } from '../../components/ui';
import CategoryModal from '../../components/CategoryModal';
import AdjustmentFields from '../payroll/AdjustmentFields';
import { usePayrollCategories } from '../../hook/usePayrollCategories';
import { useAppContext } from '../../context/AppContext';
import { toLocalDateString } from '../../utils/formatters';
import { PAYMENT_METHODS } from './quickEntryMath';
import { isAutoDetailLabel } from '../payroll/additionDetail';
import { showToast } from '../../lib/toast';
import useDirty from '../../hook/useDirty';

/**
 * QuickAdjustmentSheet — form Tambah / Potongan karyawan dari Beranda (bottom sheet).
 * Isian jenis, kategori (bisa dikelola), keterangan, nominal, dan tanggal = komponen yang
 * sama dengan form di Penggajian (AdjustmentFields). Tambahannya hanya pilihan karyawan,
 * Sumber Dana (khusus Potongan), dan "Dicatat oleh" (staf yang mengajukan Tambah).
 *
 * Aturan:
 *  - Tambah: owner langsung disetujui; staf = pengajuan, menunggu persetujuan owner.
 *  - Potongan: langsung dicatat, sekaligus jadi pengeluaran karyawan; tunai mengurangi Dompet.
 *
 * Mode UBAH (prop `editing`; dipakai Penggajian & Pengeluaran untuk mengubah Potongan, dan Beranda untuk
 * Tambah maupun Potongan): form yang SAMA, terisi data catatan, karyawan dikunci, jenis dikunci.
 * `editing = { item, onSave(id, form) }`; `item` = { id, type ('potongan' bawaan | 'tambahan'), employeeId,
 * employeeName, category, label, amount, date, paymentMethod, detail }.
 * `paymentMethod` null = potongan lama tanpa pengeluaran terhubung (Sumber Dana disembunyikan).
 * `detail` = rincian Tambah (Ongkir / Potong Ayam), kalau ada.
 *
 * Sheet memakai Modal bersama: tombol Back HP menutupnya dan bisa di-swipe turun. Kalau isiannya sudah diubah,
 * menutup lewat cara apa pun memunculkan konfirmasi buang isian (Modal `dirty`).
 *
 * Setelah simpan: toast, dan catatan BARU tidak menutup sheet melainkan mengosongkan form (jenis yang sama,
 * "Dicatat oleh" tetap) untuk catatan berikutnya. Mode ubah menutup sheet setelah simpan.
 */
const emptyForm = (type) => ({ type, label: '', amount: '', date: toLocalDateString(), category: '' });   // category '' = pilihan pertama

export default function QuickAdjustmentSheet({ isOpen, kind, onClose, quick, canApprove, editing = null }) {
  const { triggerAlert, triggerConfirm } = useAppContext();
  const cats = usePayrollCategories();
  const firstCat = (type) => (cats.categories[type] || [])[0] || '';

  const [form, setForm] = useState(() => emptyForm(kind));
  const [employeeId, setEmployeeId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Tunai');
  const [requestedBy, setRequestedBy] = useState('');
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tiap dibuka: form bersih sesuai tile yang ditekan. "Dicatat oleh" mengingat pilihan terakhir.
  useEffect(() => {
    if (!isOpen) return;
    if (editing) {
      const it = editing.item;
      // Keterangan otomatis (= nama kategori / ringkasan rincian) dikosongkan supaya ikut berubah bersama isiannya.
      const autoLabel = it.label === it.category || isAutoDetailLabel(it.detail, it.label);
      setForm({ type: it.type === 'tambahan' ? 'tambahan' : 'potongan', label: autoLabel ? '' : it.label, amount: String(it.amount), date: it.date, category: it.category, detail: it.detail || null });
      setEmployeeId(it.employeeId); setPaymentMethod(it.paymentMethod || 'Tunai'); setRequestedBy('');
      return;
    }
    setForm(emptyForm(kind)); setEmployeeId(''); setPaymentMethod('Tunai');
    setRequestedBy(quick.lastRequester.current || '');
  }, [isOpen, kind, editing?.item.id]); // eslint-disable-line react-hooks/exhaustive-deps -- reset hanya saat dibuka

  const { dirty, rebase } = useDirty(isOpen, [form, employeeId, paymentMethod, requestedBy]);

  const resetForm = () => {
    setForm(emptyForm(form.type)); setEmployeeId(''); setPaymentMethod('Tunai');
    rebase();
  };

  const run = async (fn) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
    finally { setBusy(false); }
  };

  const category = form.category || firstCat(form.type);
  const isAddition = form.type === 'tambahan';
  const needsApproval = isAddition && !canApprove;
  // Sumber Dana tidak relevan untuk Tambahan, dan untuk potongan lama yang tidak punya pengeluaran terhubung.
  const hideSource = isAddition || (!!editing && !editing.item.paymentMethod);

  const handleSubmit = () => run(async () => {
    const f = { employeeId, category, label: form.label, amount: form.amount, date: form.date, requestedBy, paymentMethod, detail: isAddition ? form.detail : null };
    if (editing) {
      await editing.onSave(editing.item.id, f);
      showToast('Perubahan tersimpan');
      onClose();
      return;
    }
    if (isAddition) {
      const status = await quick.submitAddition(f);
      if (status === 'menunggu') showToast('Terkirim ke owner. Tambahan baru dihitung di gaji setelah disetujui.', { duration: 4500 });
      else showToast('Tambahan tersimpan');
    } else {
      await quick.submitDeduction(f);
      showToast('Potongan tersimpan');
    }
    resetForm();
  });

  // Dua slot ditumpuk di satu sel grid (yang tidak aktif disembunyikan), jadi tinggi formulir
  // selalu sama dan tidak naik-turun saat ganti Tambahan/Potongan.
  const ghost = 'col-start-1 row-start-1';

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} dirty={dirty} sheet size="lg" maxHeight title={editing ? (isAddition ? 'Ubah Tambahan' : 'Ubah Potongan') : isAddition ? 'Catat Tambahan' : 'Catat Potongan'}>
        <div className="p-5 pt-2 space-y-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <Select label="Karyawan" value={employeeId} onChange={e => setEmployeeId(e.target.value)} disabled={!!editing}>
            {editing
              ? <option value={editing.item.employeeId}>{editing.item.employeeName}</option>
              : <><option value="">Pilih karyawan</option>{quick.employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}</>}
          </Select>

          <AdjustmentFields form={{ ...form, category }} onChange={setForm} categories={cats.categories} onManage={() => setCatModalOpen(true)} lockType={!!editing} />

          {/* Slot tetap: Sumber Dana (Potongan) / Dicatat oleh (Tambahan dari staf) menempati sel yang
              sama, jadi tinggi formulir sama untuk Tambahan maupun Potongan. */}
          <div className="grid">
            <div className={`${ghost} space-y-1.5 ${hideSource ? 'invisible pointer-events-none' : ''}`} aria-hidden={hideSource} inert={hideSource}>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Sumber Dana</p>
              <PillTabs size="sm" value={paymentMethod} onChange={setPaymentMethod}
                options={PAYMENT_METHODS.map(m => ({ value: m, label: m }))} />
            </div>
            {!canApprove && (
              <div className={`${ghost} ${needsApproval ? '' : 'invisible pointer-events-none'}`} aria-hidden={!needsApproval} inert={!needsApproval}>
                <Select label="Dicatat oleh" value={requestedBy} onChange={e => setRequestedBy(e.target.value)}>
                  <option value="">Pilih namamu</option>
                  {quick.employees.map(emp => <option key={emp.id} value={emp.name}>{emp.name}</option>)}
                </Select>
              </div>
            )}
          </div>

          <Button size="full" onClick={handleSubmit} disabled={busy}>
            {busy ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : needsApproval ? 'Ajukan ke Owner' : isAddition ? 'Simpan Tambahan' : 'Simpan Potongan'}
          </Button>
        </div>
      </Modal>

      <CategoryModal
        isOpen={catModalOpen}
        onClose={() => setCatModalOpen(false)}
        title={`Kelola Kategori ${isAddition ? 'Tambahan' : 'Potongan'}`}
        categories={cats.categories[form.type] || []}
        setCategories={(next) => run(() => cats.setCategoriesPersist(form.type, next))}
        triggerAlert={triggerAlert}
        triggerConfirm={triggerConfirm}
        deleteMessage={(cat) => `Yakin ingin menghapus kategori "${cat}"? Catatan lama tetap tersimpan dengan nama kategori ini.`}
        onRenameAsync={(oldCat, newCat) => {
          run(() => cats.renameCategory(form.type, oldCat, newCat));
          if (category === oldCat) setForm(f => ({ ...f, category: newCat }));
        }}
        onDeleteAsync={(deletedCat) => {
          run(() => cats.deleteCategory(form.type, deletedCat));
          if (category === deletedCat) setForm(f => ({ ...f, category: (cats.categories[f.type] || []).find(c => c !== deletedCat) || '' }));
        }}
      />
    </>
  );
}
