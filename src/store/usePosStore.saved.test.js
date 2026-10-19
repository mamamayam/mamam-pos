import { describe, it, expect, beforeEach, vi } from 'vitest';

// Store memakai persist (localStorage); di Node cukup dipalsukan di memori.
vi.hoisted(() => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
  };
});

vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { usePosStore } from './usePosStore';
import { cartItemIdFor } from '../features/pos/savedOrders';

const menu = { id: 'm2', name: 'Es Teh', price: 5000, hpp: 1000, category: 'Minuman' };
const groups = [{ id: 'g1', options: [{ id: 'o1', name: 'Manis', extraPrice: 0 }, { id: 'o2', name: 'Besar', extraPrice: 2000 }] }];

beforeEach(() => usePosStore.getState().resetDraft());

describe('pesanan tersimpan di store', () => {
  it('cartItemIdFor menghasilkan id yang sama dengan addToCart (varian apa pun urutannya)', () => {
    usePosStore.getState().addToCart(menu, { g1: ['o2', 'o1'] }, groups);
    const item = usePosStore.getState().cart[0];
    expect(item.cartItemId).toBe(cartItemIdFor('m2', { g1: ['o2', 'o1'] }));
    expect(item.price).toBe(7000);
  });

  it('loadSavedOrder mengisi keranjang dan savedOrderId; resetDraft mengosongkannya lagi', () => {
    usePosStore.getState().loadSavedOrder({
      id: 'tx-1', items: [{ cartItemId: 'm1', menuId: 'm1', name: 'Ayam', price: 18000, qty: 2 }],
      customerName: 'Bu Rina', customerId: 'c1', orderType: 'Delivery', deliveryFee: 7000,
      manualDiscount: { type: 'percent', value: 5 }, voucherCode: 'MAMAM10',
    });
    const s = usePosStore.getState();
    expect(s).toMatchObject({
      savedOrderId: 'tx-1', customerName: 'Bu Rina', selectedCustomerId: 'c1', orderType: 'Delivery',
      deliveryFee: 7000, customDeliveryFee: '7000', voucherCode: 'MAMAM10', deliveryPaidTo: 'kasir',
    });
    expect(s.manualDiscount).toEqual({ type: 'percent', value: 5 });
    expect(s.cart).toHaveLength(1);

    s.resetDraft();
    expect(usePosStore.getState()).toMatchObject({ savedOrderId: null, cart: [], customerName: '', orderType: 'Takeaway' });
  });

  it('pesanan tanpa ongkir tidak meninggalkan nilai ongkir custom', () => {
    usePosStore.getState().loadSavedOrder({ id: 'tx-2', items: [], orderType: 'Takeaway', deliveryFee: 0, manualDiscount: { type: 'fixed', value: 0 } });
    expect(usePosStore.getState()).toMatchObject({ deliveryFee: 0, customDeliveryFee: '', voucherCode: '' });
  });
});
