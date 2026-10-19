import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('../../lib/supabase', () => ({ supabase: {} }));

import OrderBreakdown from './OrderBreakdown';
import { SavedOrdersList } from './SavedOrdersSheet';

const rp = (n) => `Rp${n}`;
const items = [
  { cartItemId: 'm1', name: 'Ayam Geprek', variantName: 'Level 3', note: 'Nasi dipisah', price: 18000, qty: 2 },
  { cartItemId: 'm2', name: 'Es Teh', variantName: '', note: '', price: 5000, qty: 1 },
];

describe('OrderBreakdown', () => {
  it('menampilkan tiap item dengan catatan, qty × harga, total baris, subtotal, dan total tagihan', () => {
    const html = renderToString(<OrderBreakdown items={items} subtotal={41000} total={41000} formatRupiah={rp} />);
    expect(html).toContain('Ayam Geprek');
    expect(html).toContain('Level 3');
    expect(html).toContain('Catatan: <!-- -->Nasi dipisah');
    expect(html).toContain('Rp36000');          // 2 × 18000
    expect(html).toContain('2<!-- --> × <!-- -->Rp18000');
    expect(html).toContain('Subtotal (<!-- -->3<!-- --> item)');
    expect(html).toContain('Total Tagihan');
    expect(html).not.toContain('Ongkir');
    expect(html).not.toContain('Diskon');
  });

  it('baris diskon dan ongkir hanya muncul kalau berlaku', () => {
    const html = renderToString(
      <OrderBreakdown items={items} subtotal={41000} voucherCode="MAMAM10" voucherDiscount={4100}
        manualDiscountAmount={500} deliveryFee={4000} showDelivery total={40400} formatRupiah={rp} />,
    );
    expect(html).toContain('(MAMAM10)');
    expect(html).toContain('-<!-- -->Rp4100');
    expect(html).toContain('Diskon Tambahan');
    expect(html).toContain('Ongkir');
    expect(html).toContain('Rp40400');
  });

  it('order Delivery dengan ongkir gratis tetap menampilkan baris Ongkir', () => {
    const html = renderToString(<OrderBreakdown items={items} subtotal={41000} showDelivery total={41000} formatRupiah={rp} />);
    expect(html).toContain('Ongkir');
  });
});

describe('SavedOrdersList', () => {
  const order = {
    id: 'tx-1', number: 'A1B2C3D4', createdAt: '2026-10-19T04:58:00Z', customerName: 'Bu Rina', orderType: 'Dine-in',
    items, subtotal: 41000, voucherCode: '', voucherDiscount: 0, manualDiscountAmount: 0, deliveryFee: 0, total: 41000,
  };
  const props = { orders: [order], loading: false, error: null, activeId: null, formatRupiah: rp, onResume() {}, onPay() {}, onDelete() {} };

  it('tiap pesanan menampilkan nomor, pelanggan, badge Belum dibayar, ringkasan item, dan tiga aksi', () => {
    const html = renderToString(<SavedOrdersList {...props} />);
    expect(html).toContain('#<!-- -->A1B2C3D4');
    expect(html).toContain('Bu Rina');
    expect(html).toContain('Belum dibayar');
    expect(html).toContain('2× Ayam Geprek, 1× Es Teh');
    expect(html).toContain('Lihat rincian');
    expect(html).toContain('Lanjutkan');
    expect(html).toContain('Bayar <!-- -->Rp41000');
    expect(html).toContain('aria-label="Hapus pesanan A1B2C3D4"');
  });

  it('pesanan yang sedang ada di keranjang ditandai', () => {
    const html = renderToString(<SavedOrdersList {...props} activeId="tx-1" />);
    expect(html).toContain('Di keranjang');
  });

  it('tanpa nama pelanggan tampil "Tanpa nama"', () => {
    const html = renderToString(<SavedOrdersList {...props} orders={[{ ...order, customerName: '' }]} />);
    expect(html).toContain('Tanpa nama');
  });

  it('kosong: pesan petunjuk; gagal memuat: pesan galat', () => {
    expect(renderToString(<SavedOrdersList {...props} orders={[]} />)).toContain('Belum ada pesanan tersimpan');
    expect(renderToString(<SavedOrdersList {...props} orders={[]} error="Gagal memuat" />)).toContain('Gagal memuat');
  });
});
