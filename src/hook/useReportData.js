import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { fetchAllPages } from '../lib/fetchAllPages';
import { dayStartISO, nextDayStartISO } from '../features/reports/reportsMath';

/**
 * useReportData — penjualan lunas + pengeluaran untuk satu rentang tanggal LOKAL
 * (inklusif). fromDate/toDate null = tanpa batas. ONLINE-FIRST, semua dibaca
 * bertahap (paginasi) supaya periode besar tidak terpotong diam-diam di 1000 baris.
 *
 * Penjualan difilter pada paid_at (waktu presisi) memakai batas hari LOKAL:
 * [awal hari fromDate, awal hari setelah toDate). Pengeluaran difilter pada
 * transaction_date (kolom tanggal).
 */
const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };

const SALE_COLUMNS = 'id, display_number, order_type, customer_name, status, subtotal, voucher_discount, manual_discount_amount, tax_amount, service_amount, delivery_fee, total, payment_method, amount_paid, change_amount, ojol_platform, ojol_order_number, split_payments_json, paid_at, created_at, device_id, device_name';
const ITEM_COLUMNS = 'menu_item_id, name, variant_name, note, qty, price, hpp';

export function useReportData({ fromDate, toDate, withSales = true, withExpenses = true }) {
  const [sales, setSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);

  const reload = useCallback(async () => {
    try {
      const [salesRows, expenseRows] = await Promise.all([
        // withSales=false: layar yang tidak butuh penjualan melewati query-nya.
        withSales ? fetchAllPages((from, to) => {
          let q = supabase.from('transactions')
            .select(`${SALE_COLUMNS}, items:transaction_items(${ITEM_COLUMNS})`)
            .eq('status', 'paid');
          if (fromDate) q = q.gte('paid_at', dayStartISO(fromDate));
          if (toDate) q = q.lt('paid_at', nextDayStartISO(toDate));
          return q.order('paid_at', { ascending: false }).order('id').range(from, to);
        }, 'penjualan') : Promise.resolve([]),
        // Riwayat (withExpenses=false) tidak butuh pengeluaran: lewati query-nya.
        withExpenses ? fetchAllPages((from, to) => {
          let q = supabase.from('expenses').select('*').eq('direction', 'pengeluaran');
          if (fromDate) q = q.gte('transaction_date', fromDate);
          if (toDate) q = q.lte('transaction_date', toDate);
          return q.order('transaction_date', { ascending: false }).order('id').range(from, to);
        }, 'pengeluaran') : Promise.resolve([]),
      ]);
      setSales(salesRows);
      setExpenses(expenseRows.map(e => ({ ...e, transaction_date: String(e.transaction_date).slice(0, 10) })));
      setError(null);
      setUpdatedAt(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, withSales, withExpenses]);

  useEffect(() => { setLoading(true); reload(); }, [reload]);

  // Hapus PERMANEN (item transaksi ikut terhapus lewat ON DELETE CASCADE).
  const deleteTransaction = async (id) => {
    const { error: e } = await supabase.from('transactions').delete().eq('id', id);
    if (e) fail(e, 'Gagal menghapus transaksi');
    await reload();
  };

  // Hapus banyak sekaligus (mode "Pilih" di Riwayat). Sama: permanen + cascade.
  const bulkDeleteTransactions = async (ids) => {
    const { error: e } = await supabase.from('transactions').delete().in('id', ids);
    if (e) fail(e, 'Gagal menghapus transaksi terpilih');
    await reload();
  };

  return { sales, expenses, loading, error, updatedAt, reload, deleteTransaction, bulkDeleteTransactions };
}
