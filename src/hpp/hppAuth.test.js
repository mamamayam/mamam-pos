import { describe, it, expect } from 'vitest';
import { keluar, masuk, passwordDariIsian, pulihkanSesi } from './hppAuth';
import { TABS, pathForTab, tabFromPath } from './hppRoutes';

function fakeDb({ login = { data: { user: { email: 'owner@x.test' } }, error: null }, admin = true, session = null, adminError = null } = {}) {
  const log = [];
  return {
    log,
    auth: {
      signInWithPassword: async (a) => { log.push(['masuk', a]); return login; },
      signOut: async () => { log.push(['keluar']); return { error: null }; },
      getSession: async () => ({ data: { session } }),
    },
    rpc: async (nama) => { log.push(['rpc', nama]); return adminError ? { data: null, error: adminError } : { data: admin, error: null }; },
  };
}

describe('password owner', () => {
  it('4 digit diberi awalan mamam:, selain itu dipakai apa adanya', () => {
    expect(passwordDariIsian('3678')).toBe('mamam:3678');
    expect(passwordDariIsian('mamam:3678')).toBe('mamam:3678');
    expect(passwordDariIsian('hpp-rahasia')).toBe('hpp-rahasia');
    expect(passwordDariIsian('12345')).toBe('12345');
  });
});

describe('masuk', () => {
  it('berhasil: akun admin boleh masuk (email dirapikan)', async () => {
    const db = fakeDb();
    const h = await masuk(db, '  Owner@X.test ', 'hpp-rahasia');
    expect(h).toEqual({ email: 'owner@x.test' });
    expect(db.log[0]).toEqual(['masuk', { email: 'owner@x.test', password: 'hpp-rahasia' }]);
    expect(db.log.some((l) => l[0] === 'keluar')).toBe(false);
  });
  it('kosong = minta diisi, tanpa memanggil server', async () => {
    const db = fakeDb();
    expect(await masuk(db, '', 'x')).toEqual({ error: 'Isi email dan password' });
    expect(await masuk(db, 'a@b.c', '')).toEqual({ error: 'Isi email dan password' });
    expect(db.log).toEqual([]);
  });
  it('password salah = pesan salah', async () => {
    const db = fakeDb({ login: { data: null, error: { message: 'Invalid login credentials' } } });
    expect((await masuk(db, 'a@b.c', 'x')).error).toMatch(/salah/);
  });
  it('akun valid tapi BUKAN admin HPP = ditolak dan langsung keluar', async () => {
    const db = fakeDb({ admin: false });
    const h = await masuk(db, 'staf@x.test', 'x');
    expect(h.error).toMatch(/tidak punya akses/);
    expect(db.log.map((l) => l[0])).toEqual(['masuk', 'rpc', 'keluar']);
  });
  it('gagal memeriksa admin (mis. SQL belum dipasang) = keluar dan pesan jelas', async () => {
    const db = fakeDb({ adminError: { code: 'PGRST202', message: 'Could not find the function' } });
    const h = await masuk(db, 'a@b.c', 'x');
    expect(h.error).toBeTruthy();
    expect(db.log.at(-1)).toEqual(['keluar']);
  });
});

describe('pulihkanSesi dan keluar', () => {
  it('tanpa sesi = null; sesi admin = email; sesi non-admin = ditolak dan keluar', async () => {
    expect(await pulihkanSesi(fakeDb())).toBeNull();
    expect(await pulihkanSesi(fakeDb({ session: { user: { email: 'o@x.test' } } }))).toEqual({ email: 'o@x.test' });
    const db = fakeDb({ session: { user: { email: 's@x.test' } }, admin: false });
    expect(await pulihkanSesi(db)).toBeNull();
    expect(db.log.some((l) => l[0] === 'keluar')).toBe(true);
  });
  it('galat tak terduga tidak melempar', async () => {
    const db = { auth: { getSession: async () => { throw new Error('x'); } } };
    expect(await pulihkanSesi(db)).toBeNull();
    await expect(keluar({ auth: { signOut: async () => { throw new Error('x'); } } })).resolves.toBeUndefined();
  });
});

describe('route tab', () => {
  it('path ke tab dan sebaliknya', () => {
    expect(tabFromPath('/hpp')).toBe('menu');
    expect(tabFromPath('/hpp/')).toBe('menu');
    expect(tabFromPath('/hpp/bahan')).toBe('bahan');
    expect(tabFromPath('/hpp/bahan/')).toBe('bahan');
    expect(tabFromPath('/hpp/resep')).toBe('resep');
    expect(TABS.map((t) => t.key)).toEqual(['bahan', 'resep', 'menu']);
    expect(tabFromPath('/hpp/apa-saja')).toBe('menu');
    for (const t of TABS) expect(tabFromPath(pathForTab(t.key))).toBe(t.key);
  });
});
