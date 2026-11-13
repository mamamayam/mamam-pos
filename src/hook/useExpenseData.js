import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { deviceStamp, deviceReady } from '../lib/deviceId';

/**
 * useExpenseData — layer data Pengeluaran, ONLINE-FIRST.
 *
 * BEDA dari mamam-global (sengaja, sesuai keputusan gelombang 1):
 *  - Kasbon/potongan karyawan TIDAK dicatat dari sini: lewat "Catat Cepat" di Beranda
 *    (RPC catat_potongan, migrasi 009) yang menulis potongan gaji + pengeluaran
 *    karyawan (expenses.employee_id) dalam satu transaksi.
 *  - HARD DELETE (tanpa RecycleBin/useRecycleBin) — hapus = hilang dari
 *    Supabase saat itu juga.
 *  - TANPA gating admin (isAdminMode) — semua orang boleh edit/hapus,
 *    karena C belum punya sistem login sama sekali.
 *  - `direction` selalu 'pengeluaran' di sini — 'pemasukan' (Income)
 *    ditunda ke gelombang berikutnya sesuai keputusan awal, tapi kolom
 *    di skema sudah disiapkan supaya tidak perlu migrasi ulang nanti.
 */

const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };

/**
 * `withExpenses: false` = hanya kategori + karyawan (tanpa memuat seluruh riwayat pengeluaran).
 * Dipakai form Pengeluaran di Beranda, yang cuma butuh menyimpan satu catatan.
 */
export function useExpenseData({ withExpenses = true } = {}) {
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Kategori disimpan di tabel expense_categories (persisten, termasuk
  // kategori yang belum dipakai transaksi apa pun) — bukan derive dari
  // data expenses, supaya "Kelola Kategori" konsisten dengan pola
  // Menu/Varian: kategori kosong tidak hilang saat reload.
  const catIdByName = useRef({});   // useRef: harus SATU objek yang sama di semua render

  const reload = useCallback(async () => {
    const [cats, exps, emps] = await Promise.all([
      supabase.from('expense_categories').select('*').order('sort_order').order('created_at'),
      withExpenses
        ? supabase.from('expenses').select('*').eq('direction', 'pengeluaran').order('transaction_date', { ascending: false }).order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      supabase.from('employees').select('id, name, role, status').order('name'),
    ]);
    if (cats.error || exps.error || emps.error) { setError((cats.error || exps.error || emps.error).message); setLoading(false); return; }
    setEmployees(emps.data || []);

    catIdByName.current = Object.fromEntries((cats.data || []).map(c => [c.name, c.id]));
    setCategories((cats.data || []).map(c => c.name));
    setExpenses((exps.data || []).map(e => ({
      id: e.id, amount: e.amount, category: e.category, note: e.detail, supplier: e.store_or_supplier_name,
      date: e.transaction_date, paymentMethod: e.payment_method,
      cashHolderEmployeeId: e.cash_holder_employee_id, cashHolderName: e.cash_holder_name,
      deviceId: e.device_id, deviceName: e.device_name,
      employeeId: e.employee_id || null,   // terisi = pengeluaran karyawan dari potongan (Catat Cepat): diubah lewat form Potongan (ubah_potongan)
    })));
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const saveExpense = async ({ id, amount, category, note, supplier, date, paymentMethod, cashHolderEmployeeId, cashHolderName }) => {
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new Error('Masukkan nominal pengeluaran yang valid!');
    if (!date) throw new Error('Pilih tanggal pengeluaran!');
    const cat = String(category || '').trim();
    if (!cat) throw new Error('Pilih kategori pengeluaran!');
    // Kategori yang diketik baru langsung masuk daftar kategori (sudah ada = tidak ngapa-ngapain).
    await ensureCategory(cat);

    const row = {
      amount: amt, category: cat, detail: note || null, store_or_supplier_name: supplier || null, transaction_date: date,
      payment_method: paymentMethod,
      cash_holder_employee_id: paymentMethod === 'Tunai' ? (cashHolderEmployeeId || null) : null,
      cash_holder_name: paymentMethod === 'Tunai' ? (cashHolderName || null) : null,
      direction: 'pengeluaran',
    };
    if (id) {
      const { error: e } = await supabase.from('expenses').update(row).eq('id', id);
      if (e) fail(e, 'Gagal menyimpan pengeluaran');
    } else {
      await deviceReady();
      const { error: e } = await supabase.from('expenses').insert({ ...row, ...deviceStamp() });
      if (e) fail(e, 'Gagal mencatat pengeluaran');
    }
    await reload();
  };

  const deleteExpense = async (id) => {
    const { error: e } = await supabase.from('expenses').delete().eq('id', id);
    if (e) fail(e, 'Gagal menghapus pengeluaran');
    await reload();
  };

  const bulkDeleteExpenses = async (ids) => {
    const { error: e } = await supabase.from('expenses').delete().in('id', ids);
    if (e) fail(e, 'Gagal menghapus pengeluaran terpilih');
    await reload();
  };

  // Kelola Kategori: diff terhadap tabel expense_categories (tambah/hapus/
  // urutkan), pola sama persis dengan syncCategoryList di useMenuData.js.
  const ensureCategory = async (name) => {
    const clean = (name || '').trim();
    if (!clean) throw new Error('Nama kategori wajib diisi.');
    if (catIdByName.current[clean]) return catIdByName.current[clean];
    const { data, error: e } = await supabase.from('expense_categories')
      .insert({ name: clean, sort_order: Object.keys(catIdByName.current).length }).select('id').single();
    if (e) fail(e, 'Gagal menambah kategori');
    catIdByName.current[clean] = data.id;
    return data.id;
  };

  const setCategoriesPersist = async (nextOrUpdater) => {
    const next = typeof nextOrUpdater === 'function' ? nextOrUpdater(categories) : nextOrUpdater;
    if (next === categories) return;
    const toAdd = next.filter(n => !categories.includes(n));
    for (const n of toAdd) await ensureCategory(n);
    const removed = categories.filter(n => !next.includes(n));
    for (const n of removed) {
      const id = catIdByName.current[n];
      if (id) {
        const { error: e } = await supabase.from('expense_categories').delete().eq('id', id);
        if (e) fail(e, 'Gagal menghapus kategori');
      }
    }
    const results = await Promise.all(next.map((n, idx) =>
      catIdByName.current[n] ? supabase.from('expense_categories').update({ sort_order: idx }).eq('id', catIdByName.current[n]) : null));
    const bad = results.find(r => r && r.error);
    if (bad) fail(bad.error, 'Gagal menyimpan urutan kategori');
    await reload();
  };

  const renameCategory = async (oldName, newName) => {
    const id = catIdByName.current[oldName];
    if (!id) return;
    const { error: e } = await supabase.from('expense_categories').update({ name: newName }).eq('id', id);
    if (e) fail(e, 'Gagal mengganti nama kategori');
    await reload();
  };

  // Hapus kategori: pengeluaran lama yang memakainya TETAP menyimpan nama
  // kategori sebagai teks bebas (kolom expenses.category bukan FK) — jadi
  // tidak perlu "pindahkan item" seperti di Menu. Histori tetap utuh.
  const deleteCategory = async (name) => {
    const id = catIdByName.current[name];
    if (!id) return;
    const { error: e } = await supabase.from('expense_categories').delete().eq('id', id);
    if (e) fail(e, 'Gagal menghapus kategori');
    await reload();
  };

  return {
    expenses, categories, employees, loading, error, reload,
    saveExpense, deleteExpense, bulkDeleteExpenses,
    setCategoriesPersist, renameCategory, deleteCategory,
  };
}
