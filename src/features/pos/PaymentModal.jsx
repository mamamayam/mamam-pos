import { useState, useEffect } from 'react';
import {
  SplitSquareHorizontal, X, Wallet, QrCode, CreditCard, Trash2, Receipt, Bike,
} from 'lucide-react';
import { usePosStore } from '../../store/usePosStore';
import { computeOrderTotals, cashChange, splitStatus, displayNumberFromId } from './posMath';
import { checkout } from './useCheckout';
import { isOnDuty } from '../employee/employeeOptions';
import useBackLayer from '../../hook/useBackLayer';
import NominalInput from '../../components/ui/NominalInput';
import Overlay from '../../components/ui/Overlay';
import Button from '../../components/ui/Button';
import { Select } from '../../components/ui/Input';

/**
 * PaymentModal — di-port dari mamam-global. Bagian bayar-tunai/QRIS/
 * Transfer/Ojol dan Split Payment DIPERTAHANKAN penuh sesuai arahan
 * ("sama persis semua metode di app utama").
 *
 * BEDA dari A:
 *  - Tidak ada status 'pending'/'completed' — C tidak punya "buka bill",
 *    jadi metode non-tunai (QRIS/Transfer) langsung dianggap siap
 *    diselesaikan begitu dipilih (kasir sudah konfirmasi uang diterima
 *    secara fisik/di alat EDC sebelum menekan tombol ini).
 *  - checkout() menulis LANGSUNG ke Supabase dan menunggu hasilnya —
 *    tombol menampilkan "Memproses..." dan disabled selama itu, supaya
 *    kasir tidak menekan dua kali dan membuat transaksi dobel.
 *  - Poin sepenuhnya dihapus.
 */
export default function PaymentModal({ menus, customers, vouchers, employees, triggerAlert, formatRupiah, onSuccess }) {
  const cart = usePosStore((s) => s.cart);
  const setIsCartOpen = usePosStore((s) => s.setIsCartOpen);
  const paymentModal = usePosStore((s) => s.paymentModal);
  const setPaymentModal = usePosStore((s) => s.setPaymentModal);
  const customerName = usePosStore((s) => s.customerName);
  const selectedCustomerId = usePosStore((s) => s.selectedCustomerId);
  const orderType = usePosStore((s) => s.orderType);
  const deliveryFee = usePosStore((s) => s.deliveryFee);
  const deliveryCourierId = usePosStore((s) => s.deliveryCourierId);
  const setDeliveryCourierId = usePosStore((s) => s.setDeliveryCourierId);
  const deliveryPaidTo = usePosStore((s) => s.deliveryPaidTo);
  const setDeliveryPaidTo = usePosStore((s) => s.setDeliveryPaidTo);
  const manualDiscount = usePosStore((s) => s.manualDiscount);
  const voucherCode = usePosStore((s) => s.voucherCode);
  const resetDraft = usePosStore((s) => s.resetDraft);
  const savedOrderId = usePosStore((s) => s.savedOrderId);

  const [busy, setBusy] = useState(false);

  useBackLayer(paymentModal.isOpen, () => setPaymentModal({ ...paymentModal, isOpen: false }));

  // "Diterima Oleh" default ke kurir (kalau ada) tiap modal bayar dibuka untuk order Delivery.
  // Hanya jalan saat modal BARU dibuka, jadi memilih "Kasir" secara manual tidak ditimpa lagi.
  useEffect(() => {
    if (!paymentModal.isOpen || orderType !== 'Delivery' || deliveryCourierId) return;
    const first = employees.find(e => e.role === 'kurir' && isOnDuty(e));
    if (first) { setDeliveryCourierId(first.id); setDeliveryPaidTo('kurir'); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentModal.isOpen]);

  if (!paymentModal.isOpen) return <Overlay open={false} />; // tetap terpasang sampai animasi keluar selesai

  const appliedVoucher = vouchers.find(v => v.code === voucherCode) || null;
  const totals = computeOrderTotals({ cart, voucher: appliedVoucher, manualDiscount, orderType, deliveryFee });
  const total = totals.total;
  const { isSplitMode, splitPayments, method, amountPaid, ojolPlatform, orderNumber } = paymentModal;
  const couriers = employees.filter(e => e.role === 'kurir' && isOnDuty(e));

  const kembalian = method === 'Tunai' && !isSplitMode ? cashChange(amountPaid, total) : 0;
  const isReadyToPay = method === 'Tunai' && !isSplitMode ? Number(amountPaid) >= total : true;
  const split = splitStatus(splitPayments, total);

  const quickCashOptions = [total, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, 100000]
    .filter((v, i, a) => a.indexOf(v) === i && v >= total);

  const handleAddSplitPayment = () => {
    if (!amountPaid || Number(amountPaid) <= 0) return triggerAlert('Masukkan nominal pembayaran.');
    setPaymentModal({ ...paymentModal, splitPayments: [...splitPayments, { method, amount: Number(amountPaid) }], amountPaid: '', method: 'Tunai' });
  };
  const removeSplitPayment = (index) => {
    const next = [...splitPayments];
    next.splice(index, 1);
    setPaymentModal({ ...paymentModal, splitPayments: next });
  };

  const handleProcessPayment = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await checkout({
        cart, orderType, customerId: selectedCustomerId, customerName,
        deliveryFee, voucher: appliedVoucher, manualDiscount,
        paymentMethod: method, amountPaid, isSplitMode, splitPayments,
        ojolPlatform, orderNumber, deliveryCourierId, deliveryPaidTo, employees,
        orderId: savedOrderId, // pesanan tersimpan yang sedang dibayar (null = transaksi baru)
      });
      setPaymentModal({ isOpen: false, isSplitMode: false, splitPayments: [], method: 'Tunai', amountPaid: '', ojolPlatform: '', orderNumber: '' });
      setIsCartOpen(false);
      resetDraft();
      onSuccess?.(result);
    } catch (e) {
      triggerAlert(e.message || 'Gagal memproses pembayaran.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Overlay
      open variant="center" z="z-[70]" backdropClass="bg-black/40 backdrop-blur-md" closeOnBackdrop={false}
      panelClass="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
    >
      <>
        <div className="p-5 border-b flex justify-between items-center bg-slate-50 dark:bg-slate-950">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100">Pembayaran</h2>
            {savedOrderId && <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Pesanan tersimpan #{displayNumberFromId(savedOrderId)}</p>}
            {isSplitMode && <span className="text-xs bg-accent-100 dark:bg-accent-500/15 text-accent-600 dark:text-accent-400 px-2 py-0.5 rounded font-bold uppercase tracking-wider">Mode Multi Payment</span>}
          </div>
          <div className="flex items-center gap-2">
            {orderType !== 'Ojol' && (
              !isSplitMode ? (
                <button onClick={() => setPaymentModal({ ...paymentModal, isSplitMode: true })} className="p-2 bg-accent-50 dark:bg-accent-500/10 text-accent-600 dark:text-accent-400 rounded-lg hover:bg-accent-100 dark:hover:bg-accent-500/15 transition-colors text-xs font-bold flex items-center gap-1"><SplitSquareHorizontal className="w-4 h-4" /> Split</button>
              ) : (
                <button onClick={() => setPaymentModal({ ...paymentModal, isSplitMode: false, splitPayments: [], amountPaid: '' })} className="p-2 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors text-xs font-bold">Batal Split</button>
              )
            )}
            <button onClick={() => setPaymentModal({ ...paymentModal, isOpen: false })} className="p-2 bg-white dark:bg-slate-900 rounded-full shadow-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="p-5 overflow-y-auto custom-scrollbar">
          {!isSplitMode ? (
            <>
              <div className="text-center mb-6">
                <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1">Total Tagihan</p>
                <h1 className="font-heading text-4xl font-bold text-slate-900 dark:text-slate-50">{formatRupiah(total)}</h1>
              </div>

              <div className="flex flex-wrap justify-center gap-3 mb-6">
                {(orderType === 'Ojol' ? [{ id: 'Ojol', icon: Bike }] : [{ id: 'Tunai', icon: Wallet }, { id: 'QRIS', icon: QrCode }, { id: 'Transfer', icon: CreditCard }]).map(opt => (
                  <button key={opt.id} onClick={() => setPaymentModal({ ...paymentModal, method: opt.id })}
                    className={`flex flex-col items-center justify-center p-3 w-24 md:w-28 rounded-2xl border-2 transition-all duration-200 ${method === opt.id ? 'border-orange-600 dark:border-orange-500 bg-accent-600 dark:bg-accent-500 text-white shadow-md -translate-y-1' : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950 hover:border-slate-200 dark:hover:border-slate-700'}`}>
                    <opt.icon className="w-6 h-6 mb-2" />
                    <span className="text-xs md:text-xs font-bold text-center leading-tight">{opt.id}</span>
                  </button>
                ))}
              </div>

              {method === 'Ojol' && (
                <div className="mb-6 p-4 border border-orange-200 dark:border-orange-500/30 bg-accent-50 dark:bg-accent-500/10 rounded-2xl animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Pilih Aplikasi Ojol</label>
                  <div className="flex gap-2 mb-4">
                    {['Shopeefood', 'Grabfood', 'Gofood'].map((ojol) => (
                      <button key={ojol} onClick={() => setPaymentModal({ ...paymentModal, ojolPlatform: ojol })} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${ojolPlatform === ojol ? 'bg-accent-600 dark:bg-accent-500 text-white border-orange-600 dark:border-orange-500 shadow-sm' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-950'}`}>{ojol}</button>
                    ))}
                  </div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-2">Nomor Order</label>
                  <input type="text" placeholder="Masukkan nomor order..." value={orderNumber || ''} onChange={(e) => setPaymentModal({ ...paymentModal, orderNumber: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-orange-600 dark:focus:border-orange-500 bg-white dark:bg-slate-900 text-sm font-bold transition-colors" />
                </div>
              )}

              {method === 'Tunai' && (
                <div className="space-y-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Uang Diterima</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-slate-400 dark:text-slate-500">Rp</span>
                      <NominalInput bare title="Uang Diterima"
                        sheetHint={(n) => (n >= total ? `Kembalian ${formatRupiah(n - total)}` : `Kurang ${formatRupiah(total - n)}`)}
                        className="w-full text-left pl-12 pr-4 py-3 text-lg font-bold rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-slate-800 dark:focus:border-slate-100 bg-white dark:bg-slate-900 transition-colors" value={amountPaid} onChange={(e) => setPaymentModal({ ...paymentModal, amountPaid: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                  <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-1">
                    {quickCashOptions.map((amt, idx) => (
                      <button key={idx} onClick={() => setPaymentModal({ ...paymentModal, amountPaid: amt.toString() })} className="whitespace-nowrap px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:border-orange-400 dark:hover:border-orange-500/50 hover:bg-accent-50 dark:hover:bg-accent-500/10 hover:text-accent-600 dark:hover:text-accent-400 transition-all">
                        {amt === total ? 'Uang Pas' : formatRupiah(amt)}
                      </button>
                    ))}
                  </div>
                  <div className={`p-4 rounded-xl border transition-colors duration-300 ${kembalian >= 0 ? 'bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30' : 'bg-accent-50 dark:bg-accent-500/10 border-red-200 dark:border-red-500/30'}`}>
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Kembalian</p>
                    <p className={`text-2xl font-bold ${kembalian >= 0 ? 'text-green-500 dark:text-green-400' : 'text-accent-500 dark:text-accent-400'}`}>{isReadyToPay ? formatRupiah(kembalian) : 'Uang Kurang'}</p>
                  </div>
                  {orderType === 'Delivery' && couriers.length > 0 && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Diterima Oleh</label>
                      <Select bare title="Diterima Oleh" value={deliveryCourierId} onChange={(e) => { setDeliveryCourierId(e.target.value); setDeliveryPaidTo(e.target.value ? 'kurir' : 'kasir'); }}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-500 dark:focus:border-accent-500 transition-colors">
                        {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="">Kasir</option>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {(method === 'QRIS' || method === 'Transfer') && (
                <div className="text-center bg-slate-50 dark:bg-slate-950 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 animate-in fade-in zoom-in-95 duration-300">
                  <p className="text-sm text-slate-500 dark:text-slate-400">Pastikan pelanggan sudah transfer/scan sebelum menekan selesaikan transaksi di bawah.</p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="bg-slate-800 p-4 rounded-2xl shadow-sm text-white mb-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Total Tagihan</span>
                  <span className="font-bold text-lg">{formatRupiah(total)}</span>
                </div>
                <div className="flex justify-between items-center border-t border-slate-600 dark:border-slate-400 pt-2">
                  <span className="text-xs font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider">{split.remaining > 0 ? 'Sisa Pembayaran' : 'Kembalian'}</span>
                  <span className={`font-bold text-2xl ${split.remaining > 0 ? 'text-accent-400 dark:text-accent-300' : 'text-green-400 dark:text-green-400'}`}>
                    {split.remaining > 0 ? formatRupiah(split.remaining) : formatRupiah(split.change)}
                  </span>
                </div>
              </div>

              {splitPayments.length > 0 && (
                <div className="mb-4 space-y-2">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Pembayaran Masuk</h4>
                  {splitPayments.map((p, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800 p-3 rounded-xl animate-in slide-in-from-left-2 duration-300">
                      <div className="flex items-center gap-2">
                        <span className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold px-2 py-1 rounded">{p.method}</span>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{formatRupiah(p.amount)}</span>
                      </div>
                      <button onClick={() => removeSplitPayment(idx)} className="p-1.5 text-accent-500 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-500/10 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}

              {split.remaining > 0 && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Tambah Pembayaran</h4>
                  <div className="flex gap-2">
                    {['Tunai', 'QRIS', 'Transfer'].map(m => (
                      <button key={m} onClick={() => setPaymentModal({ ...paymentModal, method: m })} className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-colors ${method === m ? 'bg-accent-50 dark:bg-accent-500/10 border-orange-600 dark:border-orange-500 text-accent-600 dark:text-accent-400' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-950'}`}>{m}</button>
                    ))}
                  </div>
                  {orderType === 'Delivery' && method === 'Tunai' && couriers.length > 0 && (
                    <div className="pt-1">
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">Diterima Oleh</label>
                      <Select bare title="Diterima Oleh" value={deliveryCourierId} onChange={(e) => { setDeliveryCourierId(e.target.value); setDeliveryPaidTo(e.target.value ? 'kurir' : 'kasir'); }}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-bold text-slate-700 dark:text-slate-200 outline-none focus:border-accent-500 dark:focus:border-accent-500 transition-colors">
                        {couriers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        <option value="">Kasir</option>
                      </Select>
                    </div>
                  )}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 dark:text-slate-500 text-sm">Rp</span>
                      <NominalInput bare title="Nominal Pembayaran"
                        sheetHint={(n) => `Sisa ${formatRupiah(Math.max(split.remaining - n, 0))}`}
                        className="w-full text-left pl-9 pr-3 py-2.5 text-sm font-bold rounded-xl border border-slate-200 dark:border-slate-700 focus:outline-none focus:border-slate-800 dark:focus:border-slate-100 bg-white dark:bg-slate-900 transition-colors" value={amountPaid} onChange={(e) => setPaymentModal({ ...paymentModal, amountPaid: e.target.value })} placeholder={String(split.remaining)} />
                    </div>
                    <Button variant="secondary" onClick={handleAddSplitPayment}>Tambah</Button>
                  </div>
                  <Button variant="secondary" size="xs" className="w-full" onClick={() => setPaymentModal({ ...paymentModal, amountPaid: String(split.remaining) })}>Uang Pas Sisa</Button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
          {!isSplitMode ? (
            <Button size="full" onClick={handleProcessPayment} disabled={busy || (method === 'Tunai' && !isReadyToPay)}
              iconRight={<Receipt className="w-5 h-5" />}>
              {busy ? 'Memproses...' : 'Selesaikan Transaksi'}
            </Button>
          ) : (
            <Button size="full" onClick={handleProcessPayment} disabled={busy || !split.isFullyPaid}
              iconRight={<Receipt className="w-5 h-5" />}>
              {busy ? 'Memproses...' : 'Selesaikan Transaksi'}
            </Button>
          )}
        </div>
      </>
    </Overlay>
  );
}
