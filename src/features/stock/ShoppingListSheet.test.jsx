import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// Modal memakai portal (butuh DOM); di uji SSR cukup meneruskan isinya saat terbuka.
vi.mock('../../components/ui', async (orig) => ({ ...(await orig()), Modal: ({ isOpen, children }) => (isOpen ? children : null) }));

import ShoppingListSheet from './ShoppingListSheet';
import { dayItems } from './stockMath';

const item = (id, name, unit, min = 0) => ({ id, name, unit, min_qty: min, required: true });
const master = [
  { id: 'c1', name: 'Ayam Matang Sisa', items: [item('m1', 'Mamam', 'porsi')] },
  { id: 'c2', name: 'Ayam Mentah', items: [item('r1', 'BLD', 'gr'), item('r2', 'Wings', 'porsi', 3)] },
  { id: 'c3', name: 'Packaging', items: [item('p1', 'Lunchbox M', 'pcs', 20)] },
];
const counts = [{ item_id: 'm1', qty: 0 }, { item_id: 'r1', qty: 0 }, { item_id: 'r2', qty: 6 }, { item_id: 'p1', qty: 18 }];
const groups = dayItems(master, counts).groups;
const clean = (html) => html.replace(/<!-- -->/g, '');
const render = (props = {}) => clean(renderToString(<ShoppingListSheet open onClose={() => {}} groups={groups} dateLabel="Sel, 3 Nov" sourceLabel="Sen, 2 Nov" {...props} />));
const checkbox = (html, id) => (html.match(new RegExp(`<input[^>]*data-testid="belanja-cek-${id}"[^>]*>`)) || [''])[0];

describe('ShoppingListSheet', () => {
  it('item habis dan menipis tampil; yang aman tidak', () => {
    const html = render();
    expect(html).toContain('BLD');
    expect(html).toContain('Lunchbox M');
    expect(html).not.toContain('data-testid="belanja-baris-r2"');
    expect(html).toContain('Habis');
    expect(html).toContain('Menipis');
    expect(html).toContain('Dari stok Sen, 2 Nov');
  });
  it('item belanja tercentang, sisa masak tampil tapi tidak tercentang', () => {
    const html = render();
    expect(checkbox(html, 'r1')).toMatch(/\schecked(="")?[\s>/]/);
    expect(checkbox(html, 'p1')).toMatch(/\schecked(="")?[\s>/]/);
    expect(checkbox(html, 'm1')).not.toMatch(/\schecked(="")?[\s>/]/);
  });
  it('panel teks WhatsApp tertutup di awal, tapi Salin dan WA tetap ada dengan jumlah item', () => {
    const html = render();
    expect(html).toContain('Teks WhatsApp');
    expect(html).toContain('2 item');
    expect(html).toContain('data-testid="belanja-salin"');
    expect(html).toContain('data-testid="belanja-wa"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="belanja-teks"');
  });
  it('ada kolom tambah item', () => {
    const html = render();
    expect(html).toContain('data-testid="belanja-tambah-input"');
    expect(html).toContain('Tambah item, mis. Kantong kresek');
  });
  it('tanpa item habis/menipis: tampil keterangan kosong, kolom tambah tetap ada', () => {
    const html = render({ groups: dayItems(master, [{ item_id: 'r2', qty: 6 }]).groups });
    expect(html).toContain('data-testid="belanja-kosong"');
    expect(html).toContain('data-testid="belanja-tambah-input"');
    expect(html).toContain('0 item');
  });
  it('tertutup: tidak merender apa pun', () => {
    expect(render({ open: false })).toBe('');
  });
});
