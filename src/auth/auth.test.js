import { describe, it, expect } from 'vitest';
import {
  roleForPin, recordAttempt, initialAttempts, isLocked, secondsLeft, attemptsLeft,
  readAttempts, makeSession, readSession, MAX_ATTEMPTS, LOCK_MS, SESSION_MS,
  isValidPin, pinToPassword, PIN_PASSWORD_PREFIX, staffEmailFrom, emailForRole, roleForEmail, maskEmail,
  sessionMsFromHours, EMPLOYEE_ATTEMPT_RULES,
} from './authLogic.js';
import { hashPin, verifyPinHash, randomSalt, generatePin } from './pinHash.js';
import { can, canOpenView, PERMISSIONS, VIEW_PERMISSION, ROLES, roleLabel } from './permissions.js';

describe('roleForPin', () => {
  it('PIN owner dan staf dikenali', () => { expect(roleForPin('3678')).toBe('owner'); expect(roleForPin('0000')).toBe('staff'); });
  it('PIN salah / kosong / bukan 4 digit ditolak', () => {
    for (const bad of ['1111', '', '367', '36780', 'abcd', '36 8', null, undefined, 3678]) {
      if (bad === 3678) expect(roleForPin(bad)).toBe('owner');       // angka 3678 jadi "3678" -> sah
      else expect(roleForPin(bad)).toBeNull();
    }
  });
  it('angka depan nol tetap utuh (0000 bukan 0)', () => { expect(roleForPin('0000')).toBe('staff'); expect(roleForPin(0)).toBeNull(); });
});

describe('batas percobaan', () => {
  it('batas 3x salah, kunci 15 menit', () => { expect(MAX_ATTEMPTS).toBe(3); expect(LOCK_MS).toBe(15 * 60 * 1000); });
  it('salah berkali-kali: terkunci tepat pada percobaan ke-3', () => {
    let st = initialAttempts();
    for (let i = 1; i < MAX_ATTEMPTS; i++) { st = recordAttempt(st, false, 1000); expect(isLocked(st, 1000)).toBe(false); expect(attemptsLeft(st)).toBe(MAX_ATTEMPTS - i); }
    st = recordAttempt(st, false, 1000);
    expect(isLocked(st, 1000)).toBe(true); expect(secondsLeft(st, 1000)).toBe(LOCK_MS / 1000);
  });
  it('kunci terbuka sendiri setelah 15 menit, hitungan mulai dari nol', () => {
    let st = initialAttempts(); for (let i = 0; i < MAX_ATTEMPTS; i++) st = recordAttempt(st, false, 0);
    expect(isLocked(st, LOCK_MS - 1)).toBe(true); expect(isLocked(st, LOCK_MS)).toBe(false);
    expect(attemptsLeft(st)).toBe(MAX_ATTEMPTS);
  });
  it('saat terkunci, percobaan diabaikan (tidak memperpanjang kunci, tidak menambah gagal)', () => {
    let st = initialAttempts(); for (let i = 0; i < MAX_ATTEMPTS; i++) st = recordAttempt(st, false, 0);
    expect(recordAttempt(st, false, 10000)).toEqual(st); expect(recordAttempt(st, true, 10000)).toEqual(st);
  });
  it('berhasil masuk mereset hitungan gagal', () => {
    let st = recordAttempt(recordAttempt(initialAttempts(), false, 0), false, 0);
    expect(recordAttempt(st, true, 5)).toEqual(initialAttempts());
  });
  it('readAttempts: data rusak / janggal diabaikan', () => {
    expect(readAttempts('bukan json', 0)).toEqual(initialAttempts());
    expect(readAttempts(JSON.stringify({ fails: 'x', lockedUntil: 1 }), 0)).toEqual(initialAttempts());
    expect(readAttempts(JSON.stringify({ fails: 2, lockedUntil: 0 }), 0)).toEqual({ fails: 2, lockedUntil: 0 });
    expect(readAttempts(JSON.stringify({ fails: 3, lockedUntil: 0 }), 0)).toEqual(initialAttempts());   // 3 = sudah batas, bukan keadaan sah tanpa kunci
    expect(readAttempts(JSON.stringify({ fails: 0, lockedUntil: 10 ** 15 }), 0)).toEqual(initialAttempts());   // kunci "selamanya" dibuang
    expect(readAttempts(JSON.stringify({ fails: 99, lockedUntil: 0 }), 0)).toEqual(initialAttempts());
    expect(readAttempts(null, 0)).toEqual(initialAttempts());
  });
});

describe('batas percobaan PIN karyawan', () => {
  const R = EMPLOYEE_ATTEMPT_RULES;
  it('3x salah, kunci 5 menit, terbuka sendiri', () => {
    let st = initialAttempts();
    for (let i = 0; i < R.max; i++) st = recordAttempt(st, false, 0, R);
    expect(isLocked(st, 0)).toBe(true); expect(secondsLeft(st, 0)).toBe(300);
    expect(isLocked(st, R.lockMs)).toBe(false);
  });
  it('sisa percobaan dihitung dengan aturan karyawan', () => {
    const st = recordAttempt(initialAttempts(), false, 0, R);
    expect(attemptsLeft(st, R)).toBe(R.max - 1);
  });
  it('readAttempts mengikuti aturan yang diberikan', () => {
    expect(readAttempts(JSON.stringify({ fails: 2, lockedUntil: 0 }), 0, R)).toEqual({ fails: 2, lockedUntil: 0 });
    expect(readAttempts(JSON.stringify({ fails: 0, lockedUntil: R.lockMs * 3 }), 0, R)).toEqual(initialAttempts());
  });
});

describe('akun Supabase Auth dari PIN', () => {
  const cfg = { ownerEmail: 'budi@gmail.com', staffEmail: 'budi+staf@gmail.com' };
  it('PIN 4 digit sah, selain itu tidak', () => {
    for (const ok of ['0000', '1234', 9999, '0007']) expect(isValidPin(ok)).toBe(true);
    for (const bad of ['123', '12345', 'abcd', '', null, undefined, '12 3', '١٢٣٤']) expect(isValidPin(bad)).toBe(false);
  });
  it('password = awalan + PIN (>= 6 karakter, syarat Supabase Auth)', () => {
    expect(pinToPassword('0000')).toBe(`${PIN_PASSWORD_PREFIX}0000`);
    expect(pinToPassword('0000').length).toBeGreaterThanOrEqual(6);
  });
  it('email staf dari email owner (alias +staf), tidak bertumpuk', () => {
    expect(staffEmailFrom('Budi@Gmail.com')).toBe('budi+staf@gmail.com');
    expect(staffEmailFrom('budi+toko@gmail.com')).toBe('budi+staf@gmail.com');
    expect(staffEmailFrom('')).toBe(''); expect(staffEmailFrom('tanpa-at')).toBe('');
  });
  it('peran <-> email', () => {
    expect(emailForRole('owner', cfg)).toBe('budi@gmail.com'); expect(emailForRole('staff', cfg)).toBe('budi+staf@gmail.com'); expect(emailForRole('admin', cfg)).toBe('');
    expect(roleForEmail('BUDI@gmail.com', cfg)).toBe('owner'); expect(roleForEmail(' budi+staf@gmail.com ', cfg)).toBe('staff');
    expect(roleForEmail('orang@lain.com', cfg)).toBeNull(); expect(roleForEmail('', cfg)).toBeNull(); expect(roleForEmail(undefined, cfg)).toBeNull();
  });
  it('email disamarkan di layar', () => {
    expect(maskEmail('agung@gmail.com')).toBe('a****@gmail.com');
    expect(maskEmail('ab@x.com')).toBe('a**@x.com');
    expect(maskEmail('rusak')).toBe('');
    expect(maskEmail('agung@gmail.com')).not.toContain('gung');
  });
});

describe('lama sesi dari pengaturan', () => {
  it('jam -> ms, di luar batas pakai bawaan', () => {
    expect(sessionMsFromHours(1)).toBe(3600000); expect(sessionMsFromHours(24)).toBe(24 * 3600000); expect(sessionMsFromHours(168)).toBe(168 * 3600000);
    for (const bad of [0, 0.5, -3, 1000, 'abc', null, undefined, NaN]) expect(sessionMsFromHours(bad)).toBe(SESSION_MS);
  });
  it('sesi memakai masa berlaku yang disimpannya', () => {
    const now = 1_000_000_000_000, H = 3600000;
    const raw = makeSession('owner', now, 1 * H);
    expect(readSession(raw, now + H)).toBe('owner'); expect(readSession(raw, now + H + 1)).toBeNull();
    const week = makeSession('staff', now, 168 * H);
    expect(readSession(week, now + 100 * H)).toBe('staff'); expect(readSession(week, now + 169 * H)).toBeNull();
  });
  it('masa berlaku janggal diabaikan (pakai 12 jam); sesi lama tanpa ttl tetap terbaca', () => {
    const now = 1_000_000_000_000;
    expect(readSession(JSON.stringify({ role: 'owner', at: now, ttl: 10 ** 15 }), now + SESSION_MS + 1)).toBeNull();
    expect(readSession(JSON.stringify({ role: 'owner', at: now, ttl: 5 }), now + 60 * 1000)).toBe('owner');
    expect(readSession(JSON.stringify({ role: 'owner', at: now }), now + SESSION_MS)).toBe('owner');
  });
});

describe('hash PIN karyawan', () => {
  it('PIN yang sama + garam + karyawan yang sama -> hash sama; beda salah satu -> beda', async () => {
    const h = await hashPin('1234', 'garam', 'emp-1');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashPin('1234', 'garam', 'emp-1')).toBe(h);
    expect(await hashPin('1235', 'garam', 'emp-1')).not.toBe(h);
    expect(await hashPin('1234', 'garam2', 'emp-1')).not.toBe(h);
    expect(await hashPin('1234', 'garam', 'emp-2')).not.toBe(h);
  });
  it('verifikasi: cocok / salah / data kosong', async () => {
    const salt = randomSalt(); const h = await hashPin('0420', salt, 'e1');
    expect(await verifyPinHash('0420', salt, 'e1', h)).toBe(true);
    expect(await verifyPinHash('0421', salt, 'e1', h)).toBe(false);
    expect(await verifyPinHash('0420', salt, 'e2', h)).toBe(false);
    expect(await verifyPinHash('0420', null, 'e1', h)).toBe(false);
    expect(await verifyPinHash('0420', salt, 'e1', null)).toBe(false);
  });
  it('hash tidak memuat PIN; garam acak berbeda tiap kali', async () => {
    const salt = randomSalt();
    expect(salt).toMatch(/^[0-9a-f]{32}$/); expect(randomSalt()).not.toBe(salt);
    expect(await hashPin('7777', salt, 'e1')).not.toContain('7777');
  });
  it('PIN acak selalu 4 digit (termasuk berawalan nol)', () => {
    for (let i = 0; i < 200; i++) expect(generatePin()).toMatch(/^\d{4}$/);
  });
});

describe('sesi', () => {
  const now = 1_000_000_000_000;
  it('sesi segar dibaca', () => { expect(readSession(makeSession('owner', now), now + 1000)).toBe('owner'); expect(readSession(makeSession('staff', now), now)).toBe('staff'); });
  it('kedaluwarsa setelah 12 jam', () => {
    expect(readSession(makeSession('staff', now), now + SESSION_MS)).toBe('staff');
    expect(readSession(makeSession('staff', now), now + SESSION_MS + 1)).toBeNull();
  });
  it('rusak / peran asing / tanpa waktu / dari masa depan ditolak', () => {
    expect(readSession('xx', now)).toBeNull(); expect(readSession(null, now)).toBeNull();
    expect(readSession(JSON.stringify({ role: 'admin', at: now }), now)).toBeNull();
    expect(readSession(JSON.stringify({ role: 'owner' }), now)).toBeNull();
    expect(readSession(JSON.stringify({ role: 'owner', at: now + 10 * 60 * 1000 }), now)).toBeNull();
  });
});

describe('izin', () => {
  const OWNER_ONLY = Object.keys(PERMISSIONS);
  it('owner boleh semua izin yang terdaftar', () => { for (const p of OWNER_ONLY) expect(can('owner', p)).toBe(true); });
  it('staf DITOLAK untuk semua izin yang terdaftar (daftar default = owner-only)', () => { for (const p of OWNER_ONLY) expect(can('staff', p)).toBe(false); });
  it('izin yang tidak terdaftar ditolak untuk semua (aman secara bawaan)', () => { expect(can('owner', 'izin.ngawur')).toBe(false); expect(can('staff', 'izin.ngawur')).toBe(false); });
  it('tanpa peran / peran asing ditolak', () => { expect(can(null, 'laporan.labaKotor')).toBe(false); expect(can('admin', 'laporan.labaKotor')).toBe(false); expect(can(undefined, 'beranda.laba')).toBe(false); });
  it('layar: Karyawan, Pengaturan, Laporan owner-only; layar lain (termasuk Riwayat dan Manajemen Menu) terbuka untuk semua yang login', () => {
    for (const v of ['karyawan', 'pengaturan', 'laporan']) { expect(canOpenView('staff', v)).toBe(false); expect(canOpenView('owner', v)).toBe(true); }
    for (const v of ['beranda', 'kasir', 'dompet', 'pelanggan', 'pengeluaran', 'absensi', 'penggajian', 'riwayat', 'menu']) { expect(canOpenView('staff', v)).toBe(true); expect(canOpenView('owner', v)).toBe(true); }
  });
  it('Manajemen Menu terbuka untuk staf, tapi HPP dan hapus hanya owner', () => {
    expect(canOpenView('staff', 'menu')).toBe(true);
    for (const p of ['menu.hpp', 'menu.hapus']) { expect(can('staff', p)).toBe(false); expect(can('owner', p)).toBe(true); }
  });
  it('Riwayat terbuka untuk staf, tapi hapus langsung dan sheet Persetujuan hanya owner (staf cuma mengajukan)', () => {
    expect(canOpenView('staff', 'riwayat')).toBe(true);
    expect(can('staff', 'laporan.hapusTransaksi')).toBe(false); expect(can('owner', 'laporan.hapusTransaksi')).toBe(true);
    expect(can('staff', 'persetujuan.kelola')).toBe(false); expect(can('owner', 'persetujuan.kelola')).toBe(true);
    expect(canOpenView('staff', 'persetujuan')).toBe(false); expect(canOpenView('owner', 'persetujuan')).toBe(true);
  });
  it('Penggajian terbuka untuk staf, tapi daftar gaji semua karyawan hanya owner (staf lewat PIN karyawan)', () => {
    expect(canOpenView('staff', 'penggajian')).toBe(true);
    expect(can('staff', 'penggajian.semua')).toBe(false); expect(can('owner', 'penggajian.semua')).toBe(true);
  });
  it('setiap layar terbatas merujuk izin yang benar-benar ada', () => { for (const perm of Object.values(VIEW_PERMISSION)) expect(PERMISSIONS[perm]).toBeDefined(); });
  it('peran & label', () => { expect(ROLES).toEqual(['owner', 'staff']); expect(roleLabel('owner')).toBe('Owner'); expect(roleLabel('staff')).toBe('Staf'); });
});

// ---------------------------------------------------------------------------
// Pagar jaga: kunci izin yang dipakai di kode HARUS terdaftar. Izin yang tidak
// terdaftar ditolak untuk semua orang (aman), tapi itu berarti fitur diam-diam
// mati untuk owner juga — tes ini menangkap salah ketik seperti itu.
// ---------------------------------------------------------------------------
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return sourceFiles(p);
    return /\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name) && !p.includes(join('src', 'auth') + '/') ? [p] : [];
  });
}

describe('kunci izin di kode vs daftar PERMISSIONS', () => {
  const used = new Set();
  for (const file of sourceFiles('src')) {
    const code = readFileSync(file, 'utf8');
    for (const m of code.matchAll(/\b(?:can|allowed)\(\s*'([^']+)'\s*\)/g)) used.add(m[1]);
  }
  it('ada kunci izin yang dipakai (tes ini tidak kosong)', () => { expect(used.size).toBeGreaterThanOrEqual(6); });
  it('setiap can(...) di kode terdaftar di PERMISSIONS', () => {
    const missing = [...used].filter((k) => !(k in PERMISSIONS));
    expect(missing).toEqual([]);
  });
  it('setiap izin terdaftar benar-benar dipakai (langsung atau lewat VIEW_PERMISSION)', () => {
    const viaView = new Set(Object.values(VIEW_PERMISSION));
    const unused = Object.keys(PERMISSIONS).filter((k) => !used.has(k) && !viaView.has(k));
    expect(unused).toEqual([]);
  });
});
