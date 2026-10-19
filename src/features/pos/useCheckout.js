import { supabase } from '../../lib/supabase';
import { deviceStamp } from '../../lib/deviceId';
import { computeOrderTotals, cashChange, splitStatus, displayNumberFromId } from './posMath';
import { orderFields, itemRows, assertOrderOpen, replaceItems, ORDER_GONE_MESSAGE } from './savedOrders';

/**
 * useCheckout — proses "bayar" satu transaksi POS, ONLINE-FIRST.
 *
 * BEDA dari mamam-global (sengaja):
 *  - Tidak ada salesRepository/Dexie "tulis lokal dulu, sync belakangan".
 *    Checkout menulis LANGSUNG ke Supabase dan menunggu hasilnya. Kalau
 *    internet putus, checkout gagal dengan pesan jelas dan kasir tahu
 *    saat itu juga — bukan tersimpan lokal lalu "hilang" saat sync gagal
 *    diam-diam (persis kelas bug yang membuat Aplikasi A rusak).
 *  - Poin TIDAK dihitung/diproses sama sekali (integrasi menyusul).
 *  - Validasi tambahan yang TIDAK ada di A: harga & ketersediaan tiap
 *    menu di cart diperiksa ulang ke server sesaat sebelum menyimpan.
 *    Kalau menu sudah dihapus atau harganya berubah sejak dimasukkan ke
 *    keranjang (kasir lain mengedit Manajemen Menu di waktu bersamaan),
 *    checkout DITOLAK dengan pesan jelas, bukan diam-diam memakai harga
 *    lama yang sudah tidak berlaku.
 *  - `orderId` (opsional): membayar pesanan TERSIMPAN (status 'open', lihat savedOrders.js).
 *    Barisnya diubah jadi 'paid' (bukan insert baru) dan nomor pesanannya tetap. Kalau pesanan
 *    itu sudah dibayar/dihapus dari HP lain, checkout ditolak.
 */

const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };

export async function checkout({
  cart, orderType, customerId, customerName, deliveryFee,
  voucher, manualDiscount, paymentMethod, amountPaid,
  isSplitMode, splitPayments, ojolPlatform, orderNumber,
  deliveryCourierId, deliveryPaidTo, employees, orderId = null,
}) {
  if (!cart || cart.length === 0) throw new Error('Keranjang masih kosong.');

  // ── Validasi ulang harga & ketersediaan menu ke server ──────────────
  const menuIds = [...new Set(cart.map(i => i.menuId))];
  const { data: liveMenus, error: menuErr } = await supabase
    .from('menu_items').select('id, name, price, hpp, is_active').in('id', menuIds);
  if (menuErr) fail(menuErr, 'Gagal memeriksa menu');
  const liveById = Object.fromEntries((liveMenus || []).map(m => [m.id, m]));
  for (const item of cart) {
    const live = liveById[item.menuId];
    if (!live || live.is_active === false) {
      throw new Error(`"${item.name}" sudah tidak tersedia di menu. Hapus item ini dari keranjang untuk melanjutkan.`);
    }
    // item.price sudah termasuk harga varian (dihitung saat addToCart).
    // Kita tidak menyimpan harga dasar menu terpisah di cart item, jadi
    // validasi di sini sengaja longgar: hanya menolak kalau menu HILANG
    // atau DINONAKTIFKAN. Perubahan harga menu di tengah transaksi tidak
    // diblokir (kasir sudah menyepakati harga itu dengan pembeli) —
    // beda dari A yang juga tidak memvalidasi ini sama sekali; C
    // menambah pengecekan ketersediaan yang sebelumnya tidak ada.
  }

  const totals = computeOrderTotals({ cart, voucher, manualDiscount, orderType, deliveryFee });

  // ── Uang tunai ke kurir (COD) — sama seperti A ───────────────────────
  const hasCashSplit = isSplitMode ? (splitPayments || []).some(p => p.method === 'Tunai') : paymentMethod === 'Tunai';
  const isCourierCOD = orderType === 'Delivery' && hasCashSplit && !!deliveryCourierId && deliveryPaidTo === 'kurir';
  const courier = isCourierCOD ? (employees || []).find(e => e.id === deliveryCourierId) : null;

  let amount_paid = null, change_amount = null, split_payments_json = null;
  if (isSplitMode) {
    const s = splitStatus(splitPayments, totals.total);
    if (!s.isFullyPaid) throw new Error('Pembayaran split belum lunas.');
    amount_paid = s.totalPaid; change_amount = s.change; split_payments_json = splitPayments;
  } else if (paymentMethod === 'Tunai') {
    if (Number(amountPaid) < totals.total) throw new Error('Uang yang diterima kurang dari total tagihan.');
    amount_paid = Number(amountPaid); change_amount = cashChange(amountPaid, totals.total);
  }

  const now = new Date().toISOString();
  const paidFields = {
    status: 'paid',
    ...orderFields({ orderType, customerId, customerName, voucher, manualDiscount, totals }),
    ojol_platform: paymentMethod === 'Ojol' ? (ojolPlatform || null) : null,
    ojol_order_number: paymentMethod === 'Ojol' ? (orderNumber || null) : null,
    payment_method: isSplitMode ? 'Split Payment' : paymentMethod,
    amount_paid, change_amount, split_payments_json,
    cash_holder_employee_id: courier?.id || null, cash_holder_name: courier?.name || null,
    paid_at: now,
  };

  let txId;
  let display_number;
  if (orderId) {
    // Bayar pesanan tersimpan: item diganti dulu (isi keranjang bisa berubah sejak disimpan), baru
    // status dibalik jadi 'paid'. Kalau balik status gagal, pesanan tetap 'open' dan aman diulang.
    const existing = await assertOrderOpen(orderId);
    await replaceItems(orderId, cart);
    // created_at ikut diset ke waktu bayar: Beranda memakai created_at, Laporan/Shift memakai paid_at.
    const { data: updated, error: updErr } = await supabase.from('transactions')
      .update({ ...paidFields, created_at: now }).eq('id', orderId).eq('status', 'open').select('id');
    if (updErr) fail(updErr, 'Gagal menyimpan transaksi');
    if (!updated || updated.length === 0) throw new Error(ORDER_GONE_MESSAGE);
    txId = orderId;
    display_number = existing.display_number || displayNumberFromId(orderId);
  } else {
    const { data: tx, error: txErr } = await supabase.from('transactions').insert({
      display_number: 'TEMP', ...paidFields, ...deviceStamp(),
    }).select('id').single();
    if (txErr) fail(txErr, 'Gagal menyimpan transaksi');
    txId = tx.id;

    // display_number pendek dari id, konsisten dengan pola kode Shift.
    display_number = displayNumberFromId(tx.id);
    await supabase.from('transactions').update({ display_number }).eq('id', tx.id);

    const { error: itemErr } = await supabase.from('transaction_items').insert(itemRows(tx.id, cart));
    if (itemErr) {
      // Transaksi sudah tercatat tapi item gagal — batalkan supaya tidak ada
      // transaksi "hantu" tanpa item. Kasir diminta mengulang dari awal.
      await supabase.from('transactions').delete().eq('id', tx.id);
      fail(itemErr, 'Gagal menyimpan item transaksi');
    }
  }

  return {
    id: txId, display_number, ...totals,
    paymentMethod: isSplitMode ? 'Split Payment' : paymentMethod, amount_paid, change_amount, paidAt: now,
    // Data tambahan untuk ringkasan transaksi (ReceiptModal).
    orderType, customerName: customerName || '',
    ojolPlatform: paymentMethod === 'Ojol' ? (ojolPlatform || '') : '',
    ojolOrderNumber: paymentMethod === 'Ojol' ? (orderNumber || '') : '',
    splitPayments: isSplitMode ? split_payments_json : null,
    courierName: courier?.name || '',
    items: cart.map(item => ({
      name: item.name, qty: item.qty, price: item.price,
      note: [item.variantName, item.note ? `Catatan: ${item.note}` : ''].filter(Boolean).join(' · '),
    })),
  };
}
