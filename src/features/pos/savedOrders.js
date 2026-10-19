import { supabase } from '../../lib/supabase';
import { deviceStamp } from '../../lib/deviceId';
import { computeOrderTotals, displayNumberFromId } from './posMath';

/**
 * savedOrders — pesanan yang DISIMPAN dulu, dibayar nanti ("Simpan Pesanan" di keranjang).
 *
 * Disimpan di tabel `transactions` dengan status 'open' (nilai ini sudah ada di skema sejak awal,
 * jadi tanpa migrasi). Pesanan 'open' BUKAN penjualan: Laporan, Shift, Dompet, dan Beranda semua
 * membaca `status = 'paid'`, jadi baru dihitung setelah dibayar lewat checkout({ orderId }).
 * Disimpan di server (bukan di HP) supaya bisa dibuka dan dibayar dari HP lain.
 *
 * Bagian murni (cartItemIdFor, cartFromRows, orderFromRow, orderFields) dites di savedOrders.test.js.
 */

const fail = (error, aksi) => { throw new Error(`${aksi}: ${error.message}`); };

export const ORDER_GONE_MESSAGE = 'Pesanan ini sudah dibayar atau dihapus (mungkin dari HP lain). Kosongkan keranjang lalu mulai lagi.';

/** cartItemId sama persis dengan yang dibuat addToCart: id menu + id opsi varian terurut. */
export function cartItemIdFor(menuId, variantSelected) {
  const keys = Object.values(variantSelected || {}).flat().map(String).sort().join('-');
  return keys ? `${menuId}-${keys}` : menuId;
}

/** Baris transaction_items -> item keranjang (bentuk sama dengan addToCart di usePosStore). */
export function cartFromRows(rows) {
  return (rows || []).map((r) => ({
    menuId: r.menu_item_id,
    cartItemId: cartItemIdFor(r.menu_item_id, r.variant_selected_json),
    name: r.name,
    price: Number(r.price) || 0,
    hpp: Number(r.hpp) || 0,
    qty: Number(r.qty) || 0,
    note: r.note || '',
    variantName: r.variant_name || '',
    variantSelectedOptions: r.variant_selected_json || {},
    category: '',
  }));
}

/** Satu baris transaksi 'open' (beserta items) -> pesanan tersimpan siap ditampilkan / dimuat ke keranjang. */
export function orderFromRow(row) {
  const items = cartFromRows(row.items);
  return {
    id: row.id,
    number: row.display_number || displayNumberFromId(row.id),
    createdAt: row.created_at,
    customerId: row.customer_id || null,
    customerName: row.customer_name || '',
    orderType: row.order_type,
    voucherCode: row.voucher_code || '',
    manualDiscount: row.manual_discount_value
      ? { type: row.manual_discount_type || 'fixed', value: Number(row.manual_discount_value) }
      : { type: 'fixed', value: 0 },
    items,
    qty: items.reduce((s, i) => s + i.qty, 0),
    subtotal: Number(row.subtotal) || 0,
    voucherDiscount: Number(row.voucher_discount) || 0,
    manualDiscountAmount: Number(row.manual_discount_amount) || 0,
    deliveryFee: Number(row.delivery_fee) || 0,
    total: Number(row.total) || 0,
  };
}

/** Kolom transactions yang sama untuk simpan pesanan dan bayar (hasil computeOrderTotals). */
export function orderFields({ orderType, customerId, customerName, voucher, manualDiscount, totals }) {
  return {
    order_type: orderType,
    customer_id: customerId || null,
    customer_name: customerName || null,
    subtotal: totals.subtotal,
    voucher_id: voucher?.id || null,
    voucher_code: voucher?.code || null,
    voucher_discount: totals.voucherDiscount,
    manual_discount_type: manualDiscount?.value ? manualDiscount.type : null,
    manual_discount_value: manualDiscount?.value || null,
    manual_discount_amount: totals.manualDiscountAmount,
    delivery_fee: totals.deliveryFee,
    total: totals.total,
  };
}

export function itemRows(txId, cart) {
  return cart.map((item) => ({
    transaction_id: txId, menu_item_id: item.menuId, name: item.name,
    variant_name: item.variantName || null, variant_selected_json: item.variantSelectedOptions || null,
    price: item.price, hpp: item.hpp || 0, qty: item.qty, note: item.note || null,
  }));
}

/** Pastikan pesanan masih 'open'. Kalau sudah dibayar/dihapus dari HP lain, tolak dengan pesan jelas. */
export async function assertOrderOpen(orderId) {
  const { data, error } = await supabase.from('transactions')
    .select('id, status, display_number').eq('id', orderId).maybeSingle();
  if (error) fail(error, 'Gagal memeriksa pesanan');
  if (!data || data.status !== 'open') throw new Error(ORDER_GONE_MESSAGE);
  return data;
}

/**
 * Ganti seluruh item pesanan dengan isi keranjang. Item baru dimasukkan DULU, baru yang lama dihapus,
 * jadi kalau insert gagal pesanan lama tetap utuh (tidak pernah tersisa pesanan tanpa item).
 */
export async function replaceItems(txId, cart) {
  const { data: old, error: oldErr } = await supabase.from('transaction_items').select('id').eq('transaction_id', txId);
  if (oldErr) fail(oldErr, 'Gagal membaca item pesanan');
  const { data: added, error: insErr } = await supabase.from('transaction_items').insert(itemRows(txId, cart)).select('id');
  if (insErr) fail(insErr, 'Gagal menyimpan item pesanan');
  const oldIds = (old || []).map((r) => r.id);
  if (oldIds.length) {
    const { error: delErr } = await supabase.from('transaction_items').delete().in('id', oldIds);
    if (delErr) {
      // Batalkan item baru supaya tidak dobel, lalu laporkan.
      const newIds = (added || []).map((r) => r.id);
      if (newIds.length) await supabase.from('transaction_items').delete().in('id', newIds);
      fail(delErr, 'Gagal memperbarui item pesanan');
    }
  }
}

/**
 * Simpan keranjang sebagai pesanan belum dibayar. Tanpa orderId = pesanan baru; dengan orderId =
 * perbarui pesanan tersimpan yang sedang dilanjutkan. Mengembalikan { id, display_number }.
 */
export async function saveOrder({
  orderId = null, cart, orderType, customerId, customerName, deliveryFee, voucher, manualDiscount,
}) {
  if (!cart || cart.length === 0) throw new Error('Keranjang masih kosong.');
  const totals = computeOrderTotals({ cart, voucher, manualDiscount, orderType, deliveryFee });
  const fields = orderFields({ orderType, customerId, customerName, voucher, manualDiscount, totals });

  if (orderId) {
    const existing = await assertOrderOpen(orderId);
    await replaceItems(orderId, cart);
    const { data: updated, error } = await supabase.from('transactions')
      .update(fields).eq('id', orderId).eq('status', 'open').select('id');
    if (error) fail(error, 'Gagal menyimpan pesanan');
    if (!updated || updated.length === 0) throw new Error(ORDER_GONE_MESSAGE);
    return { id: orderId, display_number: existing.display_number || displayNumberFromId(orderId) };
  }

  const { data: tx, error: txErr } = await supabase.from('transactions').insert({
    display_number: 'TEMP', status: 'open', ...fields, ...deviceStamp(),
  }).select('id').single();
  if (txErr) fail(txErr, 'Gagal menyimpan pesanan');

  const display_number = displayNumberFromId(tx.id);
  await supabase.from('transactions').update({ display_number }).eq('id', tx.id);

  const { error: itemErr } = await supabase.from('transaction_items').insert(itemRows(tx.id, cart));
  if (itemErr) {
    await supabase.from('transactions').delete().eq('id', tx.id); // jangan tinggalkan pesanan tanpa item
    fail(itemErr, 'Gagal menyimpan item pesanan');
  }
  return { id: tx.id, display_number };
}

const LIST_COLUMNS = 'id, display_number, order_type, customer_id, customer_name, voucher_code, manual_discount_type, manual_discount_value, manual_discount_amount, voucher_discount, delivery_fee, subtotal, total, created_at, '
  + 'items:transaction_items(menu_item_id, name, variant_name, variant_selected_json, price, hpp, qty, note)';

/** Semua pesanan belum dibayar, terbaru di atas. */
export async function fetchSavedOrders() {
  const { data, error } = await supabase.from('transactions')
    .select(LIST_COLUMNS).eq('status', 'open').order('created_at', { ascending: false });
  if (error) fail(error, 'Gagal memuat pesanan tersimpan');
  return (data || []).map(orderFromRow);
}

/** Hapus pesanan belum dibayar (item ikut terhapus lewat ON DELETE CASCADE). Pesanan yang sudah dibayar tidak disentuh. */
export async function deleteSavedOrder(orderId) {
  const { error } = await supabase.from('transactions').delete().eq('id', orderId).eq('status', 'open');
  if (error) fail(error, 'Gagal menghapus pesanan');
}
