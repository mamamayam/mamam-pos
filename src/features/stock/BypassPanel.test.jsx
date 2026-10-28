import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

const gate = { open: null, loading: false, error: '' };
vi.mock('../../hook/useStockData', () => ({ useStockGate: () => gate }));

import BypassPanel from './BypassPanel';

beforeEach(() => { vi.stubEnv('VITE_STOCK_BYPASS_SECRET', '3132333435363738393031323334353637383930'); });

const clean = (html) => html.replace(/<!-- -->/g, '');
const render = () => clean(renderToString(<BypassPanel />));

describe('BypassPanel (tab Bypass di Absensi)', () => {
  it('terbuka: hanya keterangan absen pulang terbuka, lalu kartu kode', () => {
    Object.assign(gate, { open: true, loading: false, error: '' });
    const html = render();
    expect(html).toContain('Absen pulang terbuka');
    expect(html).toContain('data-testid="bypass-card"');
    expect(html.indexOf('Absen pulang terbuka')).toBeLessThan(html.indexOf('data-testid="bypass-card"'));
  });
  it('belum terbuka: Absen pulang terkunci', () => {
    Object.assign(gate, { open: false, loading: false, error: '' });
    expect(render()).toContain('Absen pulang terkunci');
  });
  it('tanpa keterangan isian formulir (kategori selesai, simpan hasil, nama pengisi)', () => {
    Object.assign(gate, { open: false, loading: false, error: '' });
    const html = render();
    expect(html).not.toMatch(/kategori selesai|simpan hasil|Disimpan oleh|wajib/i);
  });
  it('memuat dan galat: tidak menebak status', () => {
    Object.assign(gate, { open: null, loading: true, error: '' });
    expect(render()).toContain('Memeriksa status absen pulang');
    Object.assign(gate, { open: null, loading: false, error: 'gagal' });
    const html = render();
    expect(html).toContain('belum bisa dimuat');
    expect(html).not.toContain('Absen pulang terbuka');
    expect(html).not.toContain('Absen pulang terkunci');
  });
});
