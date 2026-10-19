import { describe, it, expect, vi, beforeEach } from 'vitest';
import { showToast, dismissToast, subscribeToast, getToast, TOAST_DURATION_MS } from './toast.js';

beforeEach(() => dismissToast());

describe('toast', () => {
  it('showToast mengirim pesan ke pelanggan dan menyimpannya sebagai toast aktif (sukses + durasi bawaan)', () => {
    const fn = vi.fn();
    const off = subscribeToast(fn);
    const id = showToast('  Pengeluaran tersimpan ');
    expect(fn).toHaveBeenCalledWith({ id, message: 'Pengeluaran tersimpan', type: 'success', duration: TOAST_DURATION_MS });
    expect(getToast()).toMatchObject({ id, message: 'Pengeluaran tersimpan' });
    off();
  });

  it('toast baru menggantikan yang lama dengan id baru (animasi diputar ulang, tidak menumpuk)', () => {
    const a = showToast('Satu');
    const b = showToast('Dua', { duration: 4500 });
    expect(b).toBeGreaterThan(a);
    expect(getToast()).toMatchObject({ id: b, message: 'Dua', duration: 4500 });
  });

  it('type selain "error" dianggap sukses; pesan kosong diabaikan', () => {
    expect(showToast('x', { type: 'aneh' })).not.toBeNull();
    expect(getToast().type).toBe('success');
    showToast('gagal', { type: 'error' });
    expect(getToast().type).toBe('error');
    const before = getToast();
    expect(showToast('   ')).toBeNull();
    expect(showToast(null)).toBeNull();
    expect(getToast()).toBe(before);
  });

  it('dismissToast hanya menutup toast yang cocok idnya; tanpa id menutup yang aktif; pelanggan diberi null', () => {
    const fn = vi.fn();
    const off = subscribeToast(fn);
    const id = showToast('Halo');
    dismissToast(id + 99);                                       // id lama/lain: abaikan
    expect(getToast()).not.toBeNull();
    dismissToast(id);
    expect(getToast()).toBeNull();
    expect(fn).toHaveBeenLastCalledWith(null);
    off();
    fn.mockClear();
    showToast('Lagi');
    expect(fn).not.toHaveBeenCalled();                           // sudah berhenti berlangganan
  });
});
