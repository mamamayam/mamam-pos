import { describe, it, expect, vi } from 'vitest';
import { menuOrderKey, fetchMenuOrder, pushMenuOrder, deleteMenuOrder } from './menuOrderSync';

// klien palsu: meniru rantai from().select().eq() / upsert() / delete().eq()
const fakeClient = ({ rows = [], error = null, throws = false } = {}) => {
  const calls = [];
  const run = (v) => { if (throws) throw new Error('offline'); return v; };
  return {
    calls,
    from: (table) => ({
      select: () => ({ eq: (col, val) => { calls.push(['select', table, col, val]); return Promise.resolve(run({ data: rows, error })); } }),
      upsert: (row, opts) => { calls.push(['upsert', table, row, opts]); return Promise.resolve(run({ error })); },
      delete: () => ({ eq: (col, val) => { calls.push(['delete', table, col, val]); return Promise.resolve(run({ error })); } }),
    }),
  };
};

describe('menuOrderSync', () => {
  it('satu kunci per peran', () => {
    expect(menuOrderKey('owner')).toBe('menu_order:owner');
    expect(menuOrderKey('staff')).toBe('menu_order:staff');
    expect(menuOrderKey(null)).toBe('menu_order:umum');
  });
  it('fetch: tata letak dari server (array lama tetap terbaca); null kalau belum ada; undefined kalau galat/offline', async () => {
    expect(await fetchMenuOrder(fakeClient({ rows: [{ value: { pinned: ['a'], full: ['b', 'a'] } }] }), 'owner')).toEqual({ pinned: ['a'], full: ['b', 'a'] });
    expect(await fetchMenuOrder(fakeClient({ rows: [{ value: ['b', 'a'] }] }), 'owner')).toEqual({ pinned: null, full: ['b', 'a'] });
    expect(await fetchMenuOrder(fakeClient({ rows: [] }), 'owner')).toBeNull();
    expect(await fetchMenuOrder(fakeClient({ rows: [{ value: 'rusak' }] }), 'owner')).toBeNull();
    expect(await fetchMenuOrder(fakeClient({ error: { message: 'x' } }), 'owner')).toBeUndefined();
    expect(await fetchMenuOrder(fakeClient({ throws: true }), 'owner')).toBeUndefined();
  });
  it('fetch membaca kunci peran yang benar dari app_settings', async () => {
    const c = fakeClient({ rows: [] });
    await fetchMenuOrder(c, 'staff');
    expect(c.calls[0]).toEqual(['select', 'app_settings', 'key', 'menu_order:staff']);
  });
  it('push: upsert satu baris per peran (onConflict key); false kalau gagal, tidak melempar', async () => {
    const c = fakeClient();
    expect(await pushMenuOrder(c, 'owner', { pinned: ['a'], full: ['a', 'b'] })).toBe(true);
    const [, table, row, opts] = c.calls[0];
    expect(table).toBe('app_settings');
    expect(row.key).toBe('menu_order:owner');
    expect(row.value).toEqual({ pinned: ['a'], full: ['a', 'b'] });
    expect(opts).toEqual({ onConflict: 'key' });
    expect(await pushMenuOrder(fakeClient({ error: { message: 'x' } }), 'owner', { pinned: ['a'], full: null })).toBe(false);
    expect(await pushMenuOrder(fakeClient({ throws: true }), 'owner', { pinned: ['a'], full: null })).toBe(false);
  });
  it('delete: hapus baris peran itu saja', async () => {
    const c = fakeClient();
    expect(await deleteMenuOrder(c, 'owner')).toBe(true);
    expect(c.calls[0]).toEqual(['delete', 'app_settings', 'key', 'menu_order:owner']);
    expect(await deleteMenuOrder(fakeClient({ throws: true }), 'owner')).toBe(false);
  });
});
