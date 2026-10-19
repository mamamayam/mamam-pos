import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * usePosStore — draft transaksi POS, DI-PORT HAMPIR APA ADANYA dari
 * mamam-global. Ini murni state management (Zustand + localStorage),
 * TIDAK menyentuh Supabase sama sekali, jadi tidak ada yang perlu diganti
 * untuk online-first.
 *
 * Kenapa ini penting dipertahankan: cart, nama pelanggan, tipe pesanan,
 * diskon manual — semuanya otomatis tersimpan di HP itu sendiri (bukan di
 * server). Kalau app ke-close paksa, baterai habis, atau ada telepon
 * masuk di tengah transaksi, begitu app dibuka lagi draft-nya masih utuh,
 * TANPA kasir perlu menekan simpan apa pun. Ini yang membuat keranjang
 * "tidak pernah hilang" sesuai yang diminta.
 *
 * DIHAPUS dari versi A (di luar scope gelombang 1 / sudah diputuskan):
 *  - pointsToRedeem — poin ditunda ke gelombang berikutnya
 *  - status: 'pending'/'completed' pada paymentModal — status bayar tidak
 *    disimpan di sini. "Simpan Pesanan" (bayar nanti) memakai baris
 *    transactions berstatus 'open' di server, bukan state lokal; yang
 *    dicatat di store hanya `savedOrderId` pesanan yang sedang dilanjutkan.
 */

const DRAFT_KEY = 'mamam-pos-draft-v1';

export const usePosStore = create(
  persist(
    (set, get) => ({

      // ─── UI STATE — tidak dipersist ────────────────────────────────────
      searchQuery: '',
      setSearchQuery: (query) => set({ searchQuery: query }),

      selectedCategory: 'Favorit',
      setSelectedCategory: (category) => set({ selectedCategory: category }),

      isCartOpen: false,
      setIsCartOpen: (isOpen) => set({ isCartOpen: isOpen }),

      selectedMenuForVariant: null,
      setSelectedMenuForVariant: (menu) => set({ selectedMenuForVariant: menu }),

      variantSelectedOptions: {},
      setVariantSelectedOptions: (options) => set((state) => ({
        variantSelectedOptions: typeof options === 'function'
          ? options(state.variantSelectedOptions)
          : options,
      })),

      editingCartItemId: null,
      setEditingCartItemId: (id) => set({ editingCartItemId: id }),

      // paymentModal: proses bayar aktif satu transaksi — sengaja TIDAK
      // dipersist, sama seperti searchQuery. Kalau app ke-kill di tengah
      // proses bayar, modal harusnya reset bersih (cart-nya tetap aman
      // karena cart dipersist terpisah di bawah).
      paymentModal: {
        isOpen: false,
        isSplitMode: false,
        splitPayments: [],
        method: 'Tunai',
        amountPaid: '',
        ojolPlatform: '',
        orderNumber: '',
      },
      setPaymentModal: (update) => set((state) => ({
        paymentModal: typeof update === 'function' ? update(state.paymentModal) : update,
      })),


      // ─── DRAFT TRANSAKSI — dipersist ke localStorage ───────────────────
      cart: [],
      customerName: '',
      selectedCustomerId: null,
      orderType: 'Takeaway',
      deliveryFee: 0,
      customDeliveryFee: '',
      deliveryCourierId: '',
      deliveryPaidTo: 'kasir',   // 'kasir' = uang masuk laci; 'kurir' = dipegang kurir (COD)
      manualDiscount: { type: 'fixed', value: 0 },
      voucherCode: '',
      // id pesanan tersimpan (transactions.status = 'open') yang sedang dilanjutkan di keranjang.
      // null = keranjang baru. Simpan memperbarui pesanan ini, Bayar mengubahnya jadi 'paid'.
      savedOrderId: null,


      // ─── CART ACTIONS ────────────────────────────────────────────────
      addToCart: (menu, variantSelectedOptions = {}, variantGroups = [], qty = 1) => set((state) => {
        const addQty = Math.max(1, Math.floor(Number(qty)) || 1);
        let extraPriceTotal = 0;
        const variantNames = [];
        const selectedVariantDetails = [];

        Object.entries(variantSelectedOptions).forEach(([groupId, optionIds]) => {
          const group = variantGroups.find(g => g.id === groupId);
          if (!group) return;
          optionIds.forEach(optId => {
            const opt = group.options.find(o => o.id === optId);
            if (!opt) return;
            extraPriceTotal += opt.extraPrice || 0;
            variantNames.push(opt.name);
            selectedVariantDetails.push({ optionId: opt.id });
          });
        });

        const optionKeys = selectedVariantDetails.map(v => v.optionId).sort().join('-');
        const cartItemId = optionKeys ? `${menu.id}-${optionKeys}` : menu.id;
        const variantName = variantNames.join(', ');

        const existingItem = state.cart.find(i => i.cartItemId === cartItemId);
        if (existingItem) {
          return { cart: state.cart.map(i => i.cartItemId === cartItemId ? { ...i, qty: i.qty + addQty } : i) };
        }

        const newItem = {
          menuId: menu.id,
          cartItemId,
          name: menu.name,
          price: (menu.price || 0) + extraPriceTotal,
          hpp: menu.hpp || 0,
          qty: addQty,
          note: '',
          variantName,
          variantSelectedOptions,
          category: menu.category || '',
        };
        return { cart: [...state.cart, newItem] };
      }),

      setCart: (newCart) => set({ cart: typeof newCart === 'function' ? newCart(get().cart) : newCart }),

      updateCartQty: (cartItemId, qty) => set((state) => ({
        cart: qty <= 0
          ? state.cart.filter(i => i.cartItemId !== cartItemId)
          : state.cart.map(i => i.cartItemId === cartItemId ? { ...i, qty } : i),
      })),

      updateCartItemNote: (cartItemId, note) => set((state) => ({
        cart: state.cart.map(i => i.cartItemId === cartItemId ? { ...i, note } : i),
      })),

      updateCartItemVariants: (cartItemId, newVariantSelectedOptions, variantGroups = []) => set((state) => {
        const item = state.cart.find(i => i.cartItemId === cartItemId);
        if (!item) return {};
        let extraPriceTotal = 0;
        const variantNames = [];
        const selectedVariantDetails = [];
        Object.entries(newVariantSelectedOptions).forEach(([groupId, optionIds]) => {
          const group = variantGroups.find(g => g.id === groupId);
          if (!group) return;
          optionIds.forEach(optId => {
            const opt = group.options.find(o => o.id === optId);
            if (!opt) return;
            extraPriceTotal += opt.extraPrice || 0;
            variantNames.push(opt.name);
            selectedVariantDetails.push({ optionId: opt.id });
          });
        });
        const optionKeys = selectedVariantDetails.map(v => v.optionId).sort().join('-');
        const newCartItemId = optionKeys ? `${item.menuId}-${optionKeys}` : item.menuId;
        const basePrice = item.price - (item.variantSelectedOptions
          ? Object.entries(item.variantSelectedOptions).reduce((s, [gId, optIds]) => {
              const g = variantGroups.find(x => x.id === gId);
              if (!g) return s;
              return s + optIds.reduce((s2, oId) => s2 + (g.options.find(o => o.id === oId)?.extraPrice || 0), 0);
            }, 0)
          : 0);
        return {
          cart: state.cart.map(i => i.cartItemId === cartItemId ? {
            ...i, cartItemId: newCartItemId, price: basePrice + extraPriceTotal,
            variantName: variantNames.join(', '), variantSelectedOptions: newVariantSelectedOptions,
          } : i),
        };
      }),

      // ─── DRAFT CHECKOUT ACTIONS ─────────────────────────────────────
      setCustomerName: (name) => set({ customerName: name }),
      setSelectedCustomerId: (id) => set({ selectedCustomerId: id }),
      setOrderType: (type) => set({ orderType: type }),
      setDeliveryFee: (fee) => set({ deliveryFee: fee }),
      setCustomDeliveryFee: (fee) => set({ customDeliveryFee: fee }),
      setDeliveryCourierId: (id) => set({ deliveryCourierId: id }),
      setDeliveryPaidTo: (paidTo) => set({ deliveryPaidTo: paidTo }),
      setManualDiscount: (discount) => set({ manualDiscount: discount }),
      setVoucherCode: (code) => set({ voucherCode: code }),
      setSavedOrderId: (id) => set({ savedOrderId: id }),

      /** loadSavedOrder — muat pesanan tersimpan (hasil orderFromRow di savedOrders.js) ke keranjang. */
      loadSavedOrder: (order) => set({
        cart: order.items,
        customerName: order.customerName || '',
        selectedCustomerId: order.customerId || null,
        orderType: order.orderType,
        deliveryFee: order.deliveryFee || 0,
        customDeliveryFee: order.deliveryFee > 0 ? String(order.deliveryFee) : '',
        deliveryCourierId: '',
        deliveryPaidTo: 'kasir',
        manualDiscount: order.manualDiscount || { type: 'fixed', value: 0 },
        voucherCode: order.voucherCode || '',
        savedOrderId: order.id,
      }),

      /** resetDraft — panggil setelah checkout berhasil / batal total. */
      resetDraft: () => set({
        cart: [],
        customerName: '',
        selectedCustomerId: null,
        orderType: 'Takeaway',
        deliveryFee: 0,
        customDeliveryFee: '',
        deliveryCourierId: '',
        deliveryPaidTo: 'kasir',
        manualDiscount: { type: 'fixed', value: 0 },
        voucherCode: '',
        savedOrderId: null,
      }),

    }),
    {
      name: DRAFT_KEY,
      partialize: (state) => ({
        cart: state.cart,
        customerName: state.customerName,
        selectedCustomerId: state.selectedCustomerId,
        orderType: state.orderType,
        deliveryFee: state.deliveryFee,
        customDeliveryFee: state.customDeliveryFee,
        deliveryCourierId: state.deliveryCourierId,
        deliveryPaidTo: state.deliveryPaidTo,
        manualDiscount: state.manualDiscount,
        voucherCode: state.voucherCode,
        savedOrderId: state.savedOrderId,
      }),
    }
  )
);
