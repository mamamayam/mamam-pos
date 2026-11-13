import { describe, it, expect, vi } from 'vitest';
import { isUuid, deviceCode, readOrCreateId, readCachedStatus, cachedFeatureOn, newUuid, deviceReady, markDeviceChecked, resetDeviceReadyForTest } from './deviceId';

const memStore = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m };
};

describe('deviceId', () => {
  it('newUuid menghasilkan UUID valid dan unik', () => {
    const a = newUuid(); const b = newUuid();
    expect(isUuid(a)).toBe(true);
    expect(a).not.toBe(b);
  });

  it('deviceCode: 8 karakter hex pertama, huruf besar, format XXXX-XXXX', () => {
    expect(deviceCode('7f3a92b1-0000-4000-8000-000000000000')).toBe('7F3A-92B1');
    expect(deviceCode('')).toBe('0000-0000');
  });

  it('readOrCreateId: membuat sekali lalu memakai yang tersimpan', () => {
    const st = memStore();
    const first = readOrCreateId(st);
    expect(isUuid(first)).toBe(true);
    expect(readOrCreateId(st, () => { throw new Error('tidak boleh membuat lagi'); })).toBe(first);
  });

  it('readOrCreateId: nilai rusak diganti, penyimpanan diblokir tetap menghasilkan ID', () => {
    const st = memStore({ 'mamam-pos-device-id': 'bukan-uuid' });
    expect(isUuid(readOrCreateId(st))).toBe(true);
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(isUuid(readOrCreateId(blocked))).toBe(true);
    expect(isUuid(readOrCreateId(null))).toBe(true);
  });

  it('readCachedStatus: hanya untuk ID yang sama', () => {
    const st = memStore({ 'mamam-pos-device-status': JSON.stringify({ id: 'x1', status: 'terdaftar' }) });
    expect(readCachedStatus(st, 'x1')).toBe('terdaftar');
    expect(readCachedStatus(st, 'x2')).toBeNull();
    expect(readCachedStatus(memStore({ 'mamam-pos-device-status': '{rusak' }), 'x1')).toBeNull();
  });
});

describe('cachedFeatureOn: fitur perangkat menyala dari status tersimpan', () => {
  const ID = '6d375dcd-135e-44c7-bf5b-00cedb677f64';
  const simpan = (obj) => ({ getItem: (k) => (k in obj ? obj[k] : null) });

  it('status tersimpan untuk ID yang sama = menyala (device_id dikirim walau pemeriksaan belum selesai)', () => {
    const st = simpan({ 'mamam-pos-device-id': ID, 'mamam-pos-device-status': JSON.stringify({ id: ID, status: 'terdaftar' }) });
    expect(cachedFeatureOn(st)).toBe(true);
  });
  it('belum pernah diperiksa, ID beda (data browser dihapus), atau isi rusak = mati', () => {
    expect(cachedFeatureOn(simpan({}))).toBe(false);
    expect(cachedFeatureOn(simpan({ 'mamam-pos-device-id': ID, 'mamam-pos-device-status': JSON.stringify({ id: newUuid(), status: 'terdaftar' }) }))).toBe(false);
    expect(cachedFeatureOn(simpan({ 'mamam-pos-device-id': ID, 'mamam-pos-device-status': '{rusak' }))).toBe(false);
    expect(cachedFeatureOn(null)).toBe(false);
  });
});

describe('deviceReady: jalur tulis menunggu pemeriksaan perangkat sebentar', () => {
  it('menunggu sampai pemeriksaan ditandai selesai', async () => {
    resetDeviceReadyForTest();
    let selesai = false;
    const p = deviceReady(5000).then(() => { selesai = true; });
    await Promise.resolve();
    expect(selesai).toBe(false);
    markDeviceChecked();
    await p;
    expect(selesai).toBe(true);
  });
  it('jaringan terlalu lambat: lanjut setelah batas waktu (tidak menahan kasir selamanya) dan tidak pernah menolak', async () => {
    resetDeviceReadyForTest();
    vi.useFakeTimers();
    try {
      let selesai = false;
      deviceReady(4000).then(() => { selesai = true; });
      await vi.advanceTimersByTimeAsync(3999);
      expect(selesai).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(selesai).toBe(true);
    } finally { vi.useRealTimers(); }
  });
  it('sudah diperiksa sebelumnya: langsung selesai', async () => {
    markDeviceChecked();
    await expect(deviceReady(10)).resolves.toBeUndefined();
    resetDeviceReadyForTest();
  });
});
