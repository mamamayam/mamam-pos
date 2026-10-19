import { Receipt, Share2 } from 'lucide-react';
import DetailModal from '../../components/ui/DetailModal';
import { formatRupiah as defaultRupiah } from '../../utils/formatters';
import { receiptFromCheckout } from './receiptModel';
import { shareReceiptWithAlert } from './shareReceipt';

// Pecahan uang kertas/koin yang umum — dipakai untuk label "pecahan" kalau uang diterima pas satu lembar.
const DENOMS = [1000, 2000, 5000, 10000, 20000, 50000, 100000];

/**
 * ReceiptModal — ringkasan transaksi yang baru selesai (hasil checkout()).
 * Memakai DetailModal supaya tampilannya sama dengan detail di Riwayat:
 * nomor + waktu, badge metode & tipe order, pelanggan, daftar item (varian, qty x harga),
 * subtotal / diskon / ongkir, rincian pembayaran, dan Total Tagihan.
 * Tombol Bagikan membuat struk PDF di perangkat lalu membukanya di menu share HP (shareReceipt.js).
 * Belum ada cetak ke printer, jadi tidak ada tombol Cetak.
 */
export default function ReceiptModal({ result, onClose, triggerAlert, formatRupiah = defaultRupiah }) {
  const r = result || {};
  const splits = Array.isArray(r.splitPayments) ? r.splitPayments : [];
  // Info tambahan (bukan pembukuan): uang tunai yang diterima kasir, untuk jaga-jaga kalau ada selisih.
  const cashPaid = r.paymentMethod === 'Tunai' && r.amount_paid != null;
  const isSingleBill = DENOMS.includes(Number(r.amount_paid));

  return (
    <DetailModal
      isOpen={Boolean(result)}
      onClose={onClose}
      zLevel="top"
      icon={<Receipt className="w-5 h-5 text-accent-600 dark:text-accent-400 shrink-0" />}
      title={r.display_number ? `#${r.display_number}` : ''}
      subtitle={r.paidAt ? new Date(r.paidAt).toLocaleString('id-ID') : ''}
      badges={[
        r.paymentMethod && { label: r.paymentMethod, variant: 'success' },
        r.orderType && { label: r.orderType, variant: 'neutral' },
      ].filter(Boolean)}
      sections={[
        {
          rows: [
            { label: 'Pelanggan', value: r.customerName },
            { label: 'Platform Ojol', value: r.ojolPlatform },
            { label: 'No. Order Ojol', value: r.ojolOrderNumber },
          ],
        },
        {
          title: 'Pembayaran',
          rows: [
            ...splits.map((p, i) => ({ label: `Split ${i + 1} · ${p.method}`, value: p.amount, type: 'currency' })),
            { label: 'Dibayar', value: splits.length ? r.amount_paid : null, type: 'currency' },
            { label: 'Kembalian', value: splits.length ? r.change_amount : null, type: 'currency' },
            { label: 'Uang Diterima Kurir', value: r.courierName },
          ],
        },
      ]}
      items={r.items}
      summaryRows={[
        { label: 'Subtotal', value: r.subtotal },
        r.voucherDiscount > 0 && { label: 'Diskon Voucher', value: -r.voucherDiscount },
        r.manualDiscountAmount > 0 && { label: 'Diskon Manual', value: -r.manualDiscountAmount },
        (r.orderType === 'Delivery' || r.deliveryFee > 0) && { label: 'Ongkir', value: r.deliveryFee || 0 },
      ].filter(Boolean)}
      highlight={{ label: 'Total Tagihan', value: r.total }}
      afterHighlight={cashPaid && (
        <div data-testid="receipt-cash" className="mt-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 space-y-1.5 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{isSingleBill ? 'Dibayar tunai, uang pecahan' : 'Dibayar tunai, uang diterima'}</span>
            <span className="font-bold text-slate-700 dark:text-slate-200">{defaultRupiah(r.amount_paid)}</span>
          </div>
          {r.change_amount > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500 dark:text-slate-400">Kembalian</span>
              <span className="font-bold text-slate-700 dark:text-slate-200">{defaultRupiah(r.change_amount)}</span>
            </div>
          )}
        </div>
      )}
      actions={[{ label: 'Bagikan', icon: <Share2 className="w-4 h-4" />, onClick: () => shareReceiptWithAlert(receiptFromCheckout(r), { formatRupiah, triggerAlert }) }]}
      closeLabel="Tutup"
    />
  );
}
