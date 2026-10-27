import { describe, it, expect } from 'vitest';
import { totpCode, secondsLeft, groupCode, isValidSecret, hexToBytes } from './stockBypass';

// Vektor uji RFC 6238 (SHA-1, kunci ASCII "12345678901234567890"); versi 6 digit = 6 digit terakhir kode 8 digit.
const KEY = Buffer.from('12345678901234567890').toString('hex');

describe('totpCode', () => {
  it('cocok dengan vektor RFC 6238', async () => {
    expect(await totpCode(KEY, 59_000)).toBe('287082');
    expect(await totpCode(KEY, 1_111_111_109_000)).toBe('081804');
    expect(await totpCode(KEY, 1_111_111_111_000)).toBe('050471');
    expect(await totpCode(KEY, 1_234_567_890_000)).toBe('005924');
  });
  it('sama di seluruh jendela 30 detik, berganti di batasnya', async () => {
    const a = await totpCode(KEY, 30_000), b = await totpCode(KEY, 59_999), c = await totpCode(KEY, 60_000);
    expect(a).toBe(b);
    expect(c).not.toBe(a);
  });
  it('menolak rahasia yang tidak valid', async () => {
    await expect(totpCode('zzzz', 0)).rejects.toThrow();
    await expect(totpCode('', 0)).rejects.toThrow();
  });
});

describe('helper', () => {
  it('secondsLeft', () => {
    expect(secondsLeft(0)).toBe(30);
    expect(secondsLeft(29_000)).toBe(1);
    expect(secondsLeft(30_000)).toBe(30);
  });
  it('groupCode', () => { expect(groupCode('482913')).toBe('482 913'); expect(groupCode('')).toBe(''); });
  it('isValidSecret / hexToBytes', () => {
    expect(isValidSecret(KEY)).toBe(true);
    expect(isValidSecret('abc')).toBe(false);
    expect(Array.from(hexToBytes('00ff10'))).toEqual([0, 255, 16]);
  });
});
