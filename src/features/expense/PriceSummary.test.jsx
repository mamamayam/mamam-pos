import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { PriceSummary } from './PricedItemsInput';

// Regresi: ringkasan "Harga per item" pernah memanggil formatRupiah tanpa import, sehingga form Pengeluaran error saat saklar dinyalakan.
const render = (props) => renderToString(<PriceSummary {...props} />).replace(/<!-- -->/g, '').replace(/ /g, ' ');

describe('PriceSummary', () => {
  it('tanpa item: "Belum ada item", tanpa jumlah', () => {
    const html = render({ filled: 0, priced: 0, total: 0 });
    expect(html).toContain('Belum ada item');
    expect(html).not.toContain('<strong');
  });
  it('ada harga: jumlah item berharga dan total rupiah tampil', () => {
    const html = render({ filled: 3, priced: 2, total: 45000 });
    expect(html).toContain('2 dari 3 item berharga');
    expect(html).toContain('Rp 45.000');
  });
  it('item ada tapi belum berharga: tanpa total', () => {
    const html = render({ filled: 2, priced: 0, total: 0 });
    expect(html).toContain('0 dari 2 item berharga');
    expect(html).not.toContain('<strong');
  });
});
