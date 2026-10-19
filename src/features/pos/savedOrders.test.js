import { describe, it, expect, vi, beforeEach } from 'vitest';

// Supabase dipalsukan: tiap query dicatat di `calls`, jawabannya dari `answers['tabel.operasi']`.
const h = vi.hoisted(() => {
  const calls = [];
  const answers = {};
  const makeBuilder = (table) => {
    const call = { table, op: null, payload: null, filters: [] };
    const b = {
      select(cols) { if (!call.op) call.op = 'select'; call.cols = cols; return b; },
      insert(p) { call.op = 'insert'; call.payload = p; return b; },
      update(p) { call.op = 'update'; call.payload = p; return b; },
      delete() { call.op = 'delete'; return b; },
      eq(k, v) { call.filters.push(['eq', k, v]); return b; },
      in(k, v) { call.filters.push(['in', k, v]); return b; },
      order() { return b; },
      single() { return b; },
      maybeSingle() { return b; },
      then(res, rej) {
        calls.push(call);
        const f = answers[`${table}.${call.op}`];
        const out = typeof f === 'function' ? f(call) : (f ?? { data: null, error: null });
        return Promise.resolve(out).then(res, rej);
      },
    };
    return b;
  };
  return { calls, answers, supabase: { from: makeBuilder } };
});
vi.mock('../../lib/supabase', () => ({ supabase: h.supabase }));

import {
  cartItemIdFor, cartFromRows, orderFromRow, orderFields, saveOrder, fetchSavedOrders, deleteSavedOrder, ORDER_GONE_MESSAGE,
} from './savedOrders';
import { checkout } from './useCheckout';
import { computeOrderTotals } from './posMath';

const TX_ID = '11111111-2222-3333-4444-555555555555';
const cart = [
  { menuId: 'm1', cartItemId: 'm1', name: 'Ayam Geprek', price: 18000, hpp: 9000, qty: 2, note: 'Nasi dipisah', variantName: '', variantSelectedOptions: {}, category: 'Ayam' },
  { menuId: 'm2', cartItemId: 'm2-o1-o2', name: 'Es Teh', price: 5000, hpp: 1000, qty: 1, note: '', variantName: 'Manis, Besar', variantSelectedOptions: { g1: ['o2', 'o1'] }, category: 'Minuman' },
];
const base = { cart, orderType: 'Dine-in', customerId: 'c1', customerName: 'Bu Rina', deliveryFee: 0, voucher: null, manualDiscount: { type: 'fixed', value: 0 } };

beforeEach(() => {
  h.calls.length = 0;
  for (const k of Object.keys(h.answers)) delete h.answers[k];
});

describe('cartItemIdFor / cartFromRows', () => {
  it('tanpa varian = id menu; dengan varian = id menu + id opsi terurut (sama dengan addToCart)', () => {
    expect(cartItemIdFor('m1', {})).toBe('m1');
    expect(cartItemIdFor('m1', null)).toBe('m1');
    expect(cartItemIdFor('m2', { g1: ['o2', 'o1'], g2: ['o3'] })).toBe('m2-o1-o2-o3');
  });

  it('mengubah baris transaction_items jadi item keranjang', () => {
    const [a, b] = cartFromRows([
      { menu_item_id: 'm1', name: 'Ayam', price: 18000, hpp: 9000, qty: 2, note: null, variant_name: null, variant_selected_json: null },
      { menu_item_id: 'm2', name: 'Es Teh', price: 5000, hpp: 1000, qty: 1, note: 'less ice', variant_name: 'Besar', variant_selected_json: { g1: ['o1'] } },
    ]);
    expect(a).toMatchObject({ menuId: 'm1', cartItemId: 'm1', note: '', variantName: '', variantSelectedOptions: {}, qty: 2, price: 18000 });
    expect(b).toMatchObject({ cartItemId: 'm2-o1', note: 'less ice', variantName: 'Besar', variantSelectedOptions: { g1: ['o1'] } });
  });
});

describe('orderFromRow', () => {
  const row = {
    id: TX_ID, display_number: '11111111', order_type: 'Delivery', customer_id: 'c1', customer_name: 'Bu Rina',
    voucher_code: 'MAMAM10', manual_discount_type: 'percent', manual_discount_value: 5, manual_discount_amount: 2700,
    voucher_discount: 5400, delivery_fee: 4000, subtotal: 54000, total: 49900, created_at: '2026-10-19T04:00:00Z',
    items: [{ menu_item_id: 'm1', name: 'Ayam', price: 18000, hpp: 0, qty: 3 }],
  };

  it('memetakan kolom transaksi ke pesanan tersimpan', () => {
    const o = orderFromRow(row);
    expect(o).toMatchObject({
      id: TX_ID, number: '11111111', orderType: 'Delivery', customerName: 'Bu Rina', voucherCode: 'MAMAM10',
      manualDiscount: { type: 'percent', value: 5 }, deliveryFee: 4000, subtotal: 54000, total: 49900, qty: 3,
    });
    expect(o.items).toHaveLength(1);
  });

  it('tanpa diskon manual = nilai 0 bertipe fixed; tanpa display_number = turunan id', () => {
    const o = orderFromRow({ ...row, display_number: null, manual_discount_type: null, manual_discount_value: null, voucher_code: null, items: [] });
    expect(o.manualDiscount).toEqual({ type: 'fixed', value: 0 });
    expect(o.voucherCode).toBe('');
    expect(o.number).toBe('11111111');
    expect(o.qty).toBe(0);
  });
});

describe('orderFields', () => {
  it('isi kolom diskon hanya kalau ada nilainya', () => {
    const totals = computeOrderTotals({ cart, voucher: null, manualDiscount: { type: 'fixed', value: 0 }, orderType: 'Dine-in', deliveryFee: 0 });
    const f = orderFields({ ...base, totals });
    expect(f).toMatchObject({ order_type: 'Dine-in', customer_id: 'c1', subtotal: 41000, total: 41000, manual_discount_type: null, manual_discount_value: null, voucher_code: null });
  });
});

describe('saveOrder', () => {
  it('pesanan baru: insert transactions berstatus open + item, nomor dari id', async () => {
    h.answers['transactions.insert'] = { data: { id: TX_ID }, error: null };
    const r = await saveOrder(base);
    expect(r).toEqual({ id: TX_ID, display_number: '11111111' });

    const ins = h.calls.find((c) => c.table === 'transactions' && c.op === 'insert');
    expect(ins.payload).toMatchObject({ status: 'open', order_type: 'Dine-in', customer_name: 'Bu Rina', subtotal: 41000, total: 41000 });
    expect(ins.payload.paid_at).toBeUndefined();
    expect(ins.payload.payment_method).toBeUndefined();

    const items = h.calls.find((c) => c.table === 'transaction_items' && c.op === 'insert');
    expect(items.payload).toHaveLength(2);
    expect(items.payload[0]).toMatchObject({ transaction_id: TX_ID, menu_item_id: 'm1', qty: 2, note: 'Nasi dipisah' });
  });

  it('keranjang kosong ditolak tanpa menyentuh server', async () => {
    await expect(saveOrder({ ...base, cart: [] })).rejects.toThrow('Keranjang masih kosong');
    expect(h.calls).toHaveLength(0);
  });

  it('item gagal disimpan: pesanan yang baru dibuat dihapus lagi', async () => {
    h.answers['transactions.insert'] = { data: { id: TX_ID }, error: null };
    h.answers['transaction_items.insert'] = { data: null, error: { message: 'boom' } };
    await expect(saveOrder(base)).rejects.toThrow('Gagal menyimpan item pesanan: boom');
    expect(h.calls.some((c) => c.table === 'transactions' && c.op === 'delete' && c.filters.some((f) => f[2] === TX_ID))).toBe(true);
  });

  it('perbarui pesanan yang masih open: ganti item, update dibatasi status open', async () => {
    h.answers['transactions.select'] = { data: { id: TX_ID, status: 'open', display_number: 'ABCD1234' }, error: null };
    h.answers['transaction_items.select'] = { data: [{ id: 'old1' }, { id: 'old2' }], error: null };
    h.answers['transaction_items.insert'] = { data: [{ id: 'new1' }, { id: 'new2' }], error: null };
    h.answers['transactions.update'] = { data: [{ id: TX_ID }], error: null };
    const r = await saveOrder({ ...base, orderId: TX_ID });
    expect(r).toEqual({ id: TX_ID, display_number: 'ABCD1234' });

    const delOld = h.calls.find((c) => c.table === 'transaction_items' && c.op === 'delete');
    expect(delOld.filters).toEqual([['in', 'id', ['old1', 'old2']]]);
    const upd = h.calls.find((c) => c.table === 'transactions' && c.op === 'update');
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'id', TX_ID], ['eq', 'status', 'open']]));
    expect(upd.payload.status).toBeUndefined();
  });

  it('pesanan sudah dibayar dari HP lain: ditolak dan item tidak disentuh', async () => {
    h.answers['transactions.select'] = { data: { id: TX_ID, status: 'paid', display_number: 'ABCD1234' }, error: null };
    await expect(saveOrder({ ...base, orderId: TX_ID })).rejects.toThrow(ORDER_GONE_MESSAGE);
    expect(h.calls.some((c) => c.table === 'transaction_items')).toBe(false);
  });
});

describe('fetchSavedOrders / deleteSavedOrder', () => {
  it('memuat hanya yang open, terbaru dulu, dalam bentuk pesanan tersimpan', async () => {
    h.answers['transactions.select'] = { data: [{ id: TX_ID, display_number: 'X', order_type: 'Takeaway', total: 10000, subtotal: 10000, items: [] }], error: null };
    const list = await fetchSavedOrders();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: TX_ID, total: 10000 });
    const q = h.calls[0];
    expect(q.filters).toEqual([['eq', 'status', 'open']]);
  });

  it('hapus hanya menyentuh pesanan berstatus open', async () => {
    await deleteSavedOrder(TX_ID);
    const del = h.calls[0];
    expect(del).toMatchObject({ table: 'transactions', op: 'delete' });
    expect(del.filters).toEqual([['eq', 'id', TX_ID], ['eq', 'status', 'open']]);
  });
});

describe('checkout dengan orderId (bayar pesanan tersimpan)', () => {
  const pay = { ...base, paymentMethod: 'QRIS', amountPaid: '', isSplitMode: false, splitPayments: [], employees: [] };
  const liveMenus = { data: [{ id: 'm1', is_active: true }, { id: 'm2', is_active: true }], error: null };

  it('mengubah baris open jadi paid, nomor tetap, tanpa insert transaksi baru', async () => {
    h.answers['menu_items.select'] = liveMenus;
    h.answers['transactions.select'] = { data: { id: TX_ID, status: 'open', display_number: 'ABCD1234' }, error: null };
    h.answers['transaction_items.select'] = { data: [{ id: 'old1' }], error: null };
    h.answers['transaction_items.insert'] = { data: [{ id: 'n1' }, { id: 'n2' }], error: null };
    h.answers['transactions.update'] = { data: [{ id: TX_ID }], error: null };

    const r = await checkout({ ...pay, orderId: TX_ID });
    expect(r).toMatchObject({ id: TX_ID, display_number: 'ABCD1234', total: 41000, paymentMethod: 'QRIS' });

    expect(h.calls.some((c) => c.table === 'transactions' && c.op === 'insert')).toBe(false);
    const upd = h.calls.find((c) => c.table === 'transactions' && c.op === 'update');
    expect(upd.payload).toMatchObject({ status: 'paid', payment_method: 'QRIS', total: 41000 });
    expect(upd.payload.paid_at).toBe(upd.payload.created_at);
    expect(upd.filters).toEqual(expect.arrayContaining([['eq', 'id', TX_ID], ['eq', 'status', 'open']]));
  });

  it('ditolak kalau pesanan sudah dibayar/dihapus dari HP lain', async () => {
    h.answers['menu_items.select'] = liveMenus;
    h.answers['transactions.select'] = { data: null, error: null };
    await expect(checkout({ ...pay, orderId: TX_ID })).rejects.toThrow(ORDER_GONE_MESSAGE);
    expect(h.calls.some((c) => c.table === 'transactions' && c.op === 'update')).toBe(false);
  });

  it('kalah balapan di langkah terakhir (update tidak mengenai baris) juga ditolak', async () => {
    h.answers['menu_items.select'] = liveMenus;
    h.answers['transactions.select'] = { data: { id: TX_ID, status: 'open', display_number: 'ABCD1234' }, error: null };
    h.answers['transaction_items.select'] = { data: [], error: null };
    h.answers['transaction_items.insert'] = { data: [{ id: 'n1' }], error: null };
    h.answers['transactions.update'] = { data: [], error: null };
    await expect(checkout({ ...pay, orderId: TX_ID })).rejects.toThrow(ORDER_GONE_MESSAGE);
  });

  it('tanpa orderId tetap insert transaksi baru berstatus paid (alur lama tidak berubah)', async () => {
    h.answers['menu_items.select'] = liveMenus;
    h.answers['transactions.insert'] = { data: { id: TX_ID }, error: null };
    const r = await checkout(pay);
    expect(r.display_number).toBe('11111111');
    const ins = h.calls.find((c) => c.table === 'transactions' && c.op === 'insert');
    expect(ins.payload).toMatchObject({ status: 'paid', payment_method: 'QRIS', total: 41000, display_number: 'TEMP' });
  });
});
