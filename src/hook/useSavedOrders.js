import { useState, useEffect, useCallback } from 'react';
import { fetchSavedOrders } from '../features/pos/savedOrders';

/**
 * useSavedOrders — daftar pesanan tersimpan (belum dibayar) untuk keranjang POS.
 * Hanya memuat saat `active` (keranjang terbuka), dan menyegarkan tiap 30 detik selama itu,
 * supaya pesanan yang disimpan / dibayar dari HP lain ikut tampil.
 */
export function useSavedOrders(active = true) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    try {
      setOrders(await fetchSavedOrders());
      setError(null);
    } catch (e) {
      setError(e.message || 'Gagal memuat pesanan tersimpan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    reload();
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [active, reload]);

  return { orders, loading, error, reload };
}
