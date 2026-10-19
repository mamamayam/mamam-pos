import { useState } from 'react';
import { ChevronDown, Trash2, Clock, Share2 } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import OrderBreakdown from './OrderBreakdown';

/**
 * SavedOrdersSheet — daftar Pesanan Tersimpan (belum dibayar), dibuka dari pil "Tersimpan" di keranjang.
 * Tiap pesanan: nomor, pelanggan, tipe, waktu simpan, ringkasan item, rincian yang bisa dibuka, dan aksi:
 *   Hapus (danger, ikon saja) · Bagikan (ikon saja; tagihan PDF lewat menu share) · Lanjutkan (muat ke keranjang untuk diubah) · Bayar (muat ke keranjang + buka pembayaran).
 * Komponen ini hanya tampilan; aksinya dijalankan CartDrawer (yang memegang store keranjang).
 */

const savedAt = (iso) => (iso
  ? new Date(iso).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '');

export function SavedOrdersList({ orders, loading, error, activeId, formatRupiah, onResume, onPay, onDelete, onShare }) {
  const [openId, setOpenId] = useState(null);

  if (loading && orders.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400 dark:text-slate-500">Memuat pesanan tersimpan…</p>;
  }
  return (
    <div className="space-y-3" data-testid="saved-orders-list">
      {error && <p className="text-xs font-semibold text-red-500 dark:text-red-400">{error}</p>}
      {orders.length === 0 && !error && (
        <EmptyState
          icon={<Clock className="w-10 h-10" />}
          title="Belum ada pesanan tersimpan"
          description="Tekan Simpan Pesanan di keranjang untuk membayar nanti."
        />
      )}
      {orders.map((o) => {
        const open = openId === o.id;
        const who = o.customerName || 'Tanpa nama';
        return (
          <div key={o.id} data-testid="saved-order" className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-heading font-extrabold text-sm text-slate-800 dark:text-slate-100">#{o.number}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{who} · {o.orderType} · disimpan {savedAt(o.createdAt)}</p>
              </div>
              <Badge variant="warning" dot className="shrink-0">Belum dibayar</Badge>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</p>

            <button type="button" aria-expanded={open} onClick={() => setOpenId(open ? null : o.id)}
              className="flex items-center gap-1 text-xs font-bold text-accent-600 dark:text-accent-400">
              {open ? 'Sembunyikan rincian' : 'Lihat rincian'}
              <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>

            {open ? (
              <div className="pt-3 border-t border-dashed border-slate-200 dark:border-slate-700">
                <OrderBreakdown
                  items={o.items} subtotal={o.subtotal} voucherCode={o.voucherCode} voucherDiscount={o.voucherDiscount}
                  manualDiscountAmount={o.manualDiscountAmount} deliveryFee={o.deliveryFee}
                  showDelivery={o.orderType === 'Delivery'} total={o.total} formatRupiah={formatRupiah}
                />
              </div>
            ) : (
              <div className="flex items-center justify-between text-sm tabular-nums">
                <span className="text-slate-500 dark:text-slate-400">Total Tagihan</span>
                <span className="font-heading font-bold text-slate-800 dark:text-slate-100">{formatRupiah(o.total)}</span>
              </div>
            )}

            <div className={`grid ${onShare ? 'grid-cols-[auto_auto_1fr_1.3fr]' : 'grid-cols-[auto_1fr_1.3fr]'} gap-2`}>
              <Button variant="danger" size="sm" aria-label={`Hapus pesanan ${o.number}`} onClick={() => onDelete(o)} icon={<Trash2 className="w-4 h-4" />} />
              {onShare && <Button variant="secondary" size="sm" aria-label={`Bagikan tagihan ${o.number}`} onClick={() => onShare(o)} icon={<Share2 className="w-4 h-4" />} />}
              <Button variant="secondary" size="sm" onClick={() => onResume(o)}>{activeId === o.id ? 'Di keranjang' : 'Lanjutkan'}</Button>
              <Button size="sm" onClick={() => onPay(o)}>Bayar {formatRupiah(o.total)}</Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function SavedOrdersSheet({ isOpen, onClose, ...listProps }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} sheet size="lg" maxHeight title="Pesanan Tersimpan">
      <div className="p-5 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <SavedOrdersList {...listProps} />
      </div>
    </Modal>
  );
}
