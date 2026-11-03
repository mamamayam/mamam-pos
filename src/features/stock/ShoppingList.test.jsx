import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ShopCheck, ShopExtras, ShopBar } from './ShoppingList';

const clean = (html) => html.replace(/<!-- -->/g, '');
const tag = (html, testId) => (html.match(new RegExp(`<button[^>]*data-testid="${testId}"[^>]*>`)) || [''])[0];
const shopStub = (o = {}) => ({
  count: 2, extras: [], text: '*Belanja MamamAyam*\n\n1. BLD (sisa 0 gr)', expanded: false,
  toggleExpanded: vi.fn(), copy: vi.fn(), openWhatsApp: vi.fn(), setText: vi.fn(), toggleExtra: vi.fn(), addByName: vi.fn(),
  ...o,
});

describe('ShopCheck (kotak centang)', () => {
  it('tercentang = oranye dengan tanda centang putih, bukan hitam', () => {
    const html = renderToString(<ShopCheck checked onToggle={() => {}} label="Beli BLD" testId="c" />);
    expect(html).toContain('role="checkbox"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('bg-accent-500');
    expect(html).toContain('border-accent-500');
    expect(html).toContain('text-white');
    expect(html).toContain('<svg');   // tanda centang
    expect(html).not.toMatch(/bg-(black|slate-900|slate-800|gray-900)(?!\S*:)/);
  });
  it('belum dicentang = putih berbingkai abu, tanpa tanda centang', () => {
    const html = renderToString(<ShopCheck checked={false} onToggle={() => {}} label="Beli BLD" />);
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('bg-white');
    expect(html).not.toContain('bg-accent-500');
    expect(html).not.toContain('<svg');
  });
});

describe('ShopBar (panel teks WhatsApp)', () => {
  it('terlipat di awal: judul, jumlah item, Salin dan WA ada, teks belum tampil', () => {
    const html = clean(renderToString(<ShopBar shop={shopStub()} />));
    expect(html).toContain('Teks WhatsApp');
    expect(html).toContain('2 item');
    expect(html).toContain('data-testid="belanja-salin"');
    expect(html).toContain('data-testid="belanja-wa"');
    expect(tag(html, 'belanja-panel-toggle')).toContain('aria-expanded="false"');
    expect(html).not.toContain('data-testid="belanja-teks"');
    expect(html).toContain('sticky bottom-0');   // menempel di bawah sheet
  });
  it('terbuka: teks tampil (dengan sisa stok) dan bisa diedit', () => {
    const html = clean(renderToString(<ShopBar shop={shopStub({ expanded: true })} />));
    expect(tag(html, 'belanja-panel-toggle')).toContain('aria-expanded="true"');
    expect(html).toContain('data-testid="belanja-teks"');
    expect(html).toContain('1. BLD (sisa 0 gr)');
  });
});

describe('ShopExtras (item di luar stok)', () => {
  it('ada kolom tambah; item tambahan tampil dengan centang oranye', () => {
    const shop = shopStub({ extras: [{ id: 'x:kresek', name: 'Kresek', on: true }] });
    const html = clean(renderToString(<ShopExtras shop={shop} />));
    expect(html).toContain('TAMBAHAN DI LUAR STOK');
    expect(html).toContain('data-testid="belanja-tambah-input"');
    expect(html).toContain('Kresek');
    expect(html).toContain('bg-accent-500');
  });
  it('tidak ada kolom jumlah beli di mana pun', () => {
    const shop = shopStub({ extras: [{ id: 'x:kresek', name: 'Kresek', on: true }] });
    const html = clean(renderToString(<><ShopExtras shop={shop} /><ShopBar shop={shop} /></>));
    expect(html).not.toContain('Jumlah beli');
  });
  it('tanpa item tambahan: hanya kolom tambah', () => {
    const html = clean(renderToString(<ShopExtras shop={shopStub()} />));
    expect(html).toContain('Tambah item, mis. Kantong kresek');
    expect(html).not.toContain('role="checkbox"');
  });
});
