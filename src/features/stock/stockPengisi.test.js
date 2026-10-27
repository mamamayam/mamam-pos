import { describe, it, expect } from 'vitest';
import { cleanName, validName, readPengisi, savePengisi } from './stockPengisi';

const fakeStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

describe('nama pengisi checklist stok', () => {
  it('cleanName merapikan spasi; validName minimal 2 karakter', () => {
    expect(cleanName('  Sri   Depi ')).toBe('Sri Depi');
    expect(cleanName(null)).toBe('');
    expect(validName('A')).toBe(false);
    expect(validName(' Al ')).toBe(true);
  });
  it('disimpan per hari: hari lain mulai kosong lagi', () => {
    const s = fakeStorage();
    savePengisi('2026-10-27', 'Sri  Depi', s);
    expect(readPengisi('2026-10-27', s)).toBe('Sri Depi');
    expect(readPengisi('2026-10-28', s)).toBe('');
  });
  it('nama kosong menghapus yang tersimpan', () => {
    const s = fakeStorage();
    savePengisi('2026-10-27', 'Dewi', s);
    savePengisi('2026-10-27', '  ', s);
    expect(readPengisi('2026-10-27', s)).toBe('');
  });
  it('penyimpanan rusak/diblokir tidak melempar galat', () => {
    const rusak = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
    expect(() => savePengisi('2026-10-27', 'Dewi', rusak)).not.toThrow();
    expect(readPengisi('2026-10-27', rusak)).toBe('');
    expect(readPengisi('2026-10-27', null)).toBe('');
  });
});
