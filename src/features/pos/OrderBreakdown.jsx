import { Ticket, Minus } from 'lucide-react';

/**
 * OrderBreakdown — rincian pembelian per item + subtotal / diskon / ongkir / total.
 * Dipakai di keranjang (sebelum bayar) dan di daftar Pesanan Tersimpan, supaya angkanya
 * tampil sama di dua tempat. Murni tampilan: semua angka dari pemanggil (computeOrderTotals
 * atau snapshot pesanan tersimpan), tidak ada hitungan harga baru di sini.
 *
 * Props:
 *   items          [{ cartItemId, name, variantName, note, price, qty }]
 *   subtotal, voucherDiscount, manualDiscountAmount, deliveryFee, total   number
 *   voucherCode    string — nama voucher di baris diskon
 *   showDelivery   boolean — tampilkan baris Ongkir (order Delivery)
 *   formatRupiah   function
 */
export default function OrderBreakdown({
  items, subtotal, voucherCode = '', voucherDiscount = 0, manualDiscountAmount = 0,
  deliveryFee = 0, showDelivery = false, total, formatRupiah,
}) {
  const qty = items.reduce((s, i) => s + (Number(i.qty) || 0), 0);
  return (
    <div data-testid="order-breakdown">
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((item) => (
          <div key={item.cartItemId} className="flex justify-between gap-3 py-2.5 first:pt-0">
            <div className="min-w-0 flex-1">
              <p className="font-heading font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight">{item.name}</p>
              {item.variantName && <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">{item.variantName}</p>}
              {item.note && <p className="text-xs italic text-slate-400 dark:text-slate-500 leading-snug">Catatan: {item.note}</p>}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 tabular-nums">{formatRupiah(item.price * item.qty)}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{item.qty} × {formatRupiah(item.price)}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 pt-3 border-t border-dashed border-slate-200 dark:border-slate-700 space-y-1.5 text-sm tabular-nums">
        <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>Subtotal ({qty} item)</span><span className="font-semibold">{formatRupiah(subtotal)}</span></div>
        {voucherDiscount > 0 && (
          <div className="flex justify-between text-green-500 dark:text-green-400">
            <span className="flex items-center gap-1"><Ticket className="w-3 h-3" /> Diskon{voucherCode ? ` (${voucherCode})` : ''}</span>
            <span className="font-semibold">-{formatRupiah(voucherDiscount)}</span>
          </div>
        )}
        {manualDiscountAmount > 0 && (
          <div className="flex justify-between text-blue-500 dark:text-blue-400">
            <span className="flex items-center gap-1"><Minus className="w-3 h-3" /> Diskon Tambahan</span>
            <span className="font-semibold">-{formatRupiah(manualDiscountAmount)}</span>
          </div>
        )}
        {(showDelivery || deliveryFee > 0) && (
          <div className="flex justify-between text-accent-600 dark:text-accent-400"><span>Ongkir</span><span className="font-semibold">{formatRupiah(deliveryFee)}</span></div>
        )}
        <div className="flex justify-between text-base font-bold text-slate-800 dark:text-slate-100 border-t border-slate-100 dark:border-slate-800 pt-2 mt-2">
          <span>Total Tagihan</span><span className="text-accent-600 dark:text-accent-400">{formatRupiah(total)}</span>
        </div>
      </div>
    </div>
  );
}
