import { describe, it, expect } from 'vitest';
import {
  validateAdjustment, adjustmentLabel, newAdditionRow, deductionRpcArgs, deductionUpdateArgs, summarizeTodayExpenses,
  mapAdditionRow, mapDeductionRow, mapExpenseRow, additionUpdateRow, additionChanged, shownAdditionAmount, buildFeed, filterFeed, pendingRequests, formatClock, startOfLocalDayISO,
} from './quickEntryMath.js';

const form = (over = {}) => ({ employeeId: 'e1', category: 'Ongkir', label: '', amount: '15000', date: '2026-10-08', requestedBy: 'Andi', ...over });
const NOW = '2026-10-08T07:00:00.000Z';

describe('validateAdjustment', () => {
  it('mengembalikan nominal integer kalau semua benar', () => { expect(validateAdjustment(form())).toBe(15000); });
  it('menolak yang kosong / tidak valid dengan pesan jelas', () => {
    expect(() => validateAdjustment(form({ employeeId: '' }))).toThrow('Pilih karyawan.');
    expect(() => validateAdjustment(form({ category: '  ' }))).toThrow('Pilih kategori.');
    for (const bad of ['', '0', '-5', '12.5', 'abc', null]) expect(() => validateAdjustment(form({ amount: bad }))).toThrow('Nominal');
    expect(() => validateAdjustment(form({ date: '' }))).toThrow('Pilih tanggal.');
    expect(() => validateAdjustment(form({ date: '8/10/2026' }))).toThrow('Pilih tanggal.');
  });
  it('"Dicatat oleh" wajib hanya untuk staf yang mengajukan', () => {
    expect(() => validateAdjustment(form({ requestedBy: '' }), { needsRequester: true })).toThrow('Pilih siapa yang mencatat.');
    expect(validateAdjustment(form({ requestedBy: '' }))).toBe(15000);
  });
});

describe('keterangan opsional', () => {
  it('kosong -> nama kategori; terisi -> dirapikan', () => {
    expect(adjustmentLabel('', 'Ongkir')).toBe('Ongkir');
    expect(adjustmentLabel('   ', ' Ongkir ')).toBe('Ongkir');
    expect(adjustmentLabel('  antar ke kos ', 'Ongkir')).toBe('antar ke kos');
  });
});

describe('newAdditionRow — hanya Tambah yang butuh persetujuan', () => {
  it('staf: menunggu, ada nama pengaju, belum disetujui siapa pun', () => {
    const r = newAdditionRow(form(), { canApprove: false, nowISO: NOW });
    expect(r).toMatchObject({ status: 'menunggu', source: 'staff', requested_by: 'Andi', approved_by: null, approved_at: null, label: 'Ongkir', amount: 15000, category: 'Ongkir' });
  });
  it('owner: langsung disetujui, tanpa pengaju', () => {
    const r = newAdditionRow(form({ requestedBy: '' }), { canApprove: true, nowISO: NOW });
    expect(r).toMatchObject({ status: 'disetujui', source: 'owner', requested_by: null, approved_by: 'Owner', approved_at: NOW });
  });
  it('staf tanpa "Dicatat oleh" ditolak', () => {
    expect(() => newAdditionRow(form({ requestedBy: ' ' }), { canApprove: false, nowISO: NOW })).toThrow('Pilih siapa yang mencatat.');
  });
});

describe('deductionRpcArgs — potongan langsung dicatat (tanpa persetujuan)', () => {
  it('tunai (bawaan) dan non-tunai dipetakan; nilai asing jatuh ke Tunai', () => {
    expect(deductionRpcArgs(form({ category: 'Kasbon', paymentMethod: 'Tunai' }))).toEqual({
      p_employee_id: 'e1', p_label: 'Kasbon', p_amount: 15000, p_date: '2026-10-08', p_category: 'Kasbon', p_payment_method: 'Tunai',
    });
    expect(deductionRpcArgs(form({ paymentMethod: 'Non-Tunai' })).p_payment_method).toBe('Non-Tunai');
    expect(deductionRpcArgs(form({ paymentMethod: 'transfer' })).p_payment_method).toBe('Tunai');
    expect(deductionRpcArgs(form()).p_payment_method).toBe('Tunai');
  });
  it('tidak butuh "Dicatat oleh" tapi tetap divalidasi', () => {
    expect(deductionRpcArgs(form({ requestedBy: '' })).p_amount).toBe(15000);
    expect(() => deductionRpcArgs(form({ amount: '0' }))).toThrow('Nominal');
  });
});

describe('summarizeTodayExpenses', () => {
  it('memisahkan karyawan vs toko dan hanya menghitung hari ini', () => {
    const exps = [
      { amount: 185000, date: '2026-10-08', employeeId: null },
      { amount: 200000, date: '2026-10-08', employeeId: 'e1' },
      { amount: 50000, date: '2026-10-08T00:00:00', employeeId: 'e2' },
      { amount: 999, date: '2026-10-07', employeeId: null },
      { amount: 'x', date: '2026-10-08', employeeId: null },
    ];
    expect(summarizeTodayExpenses(exps, '2026-10-08')).toEqual({ karyawan: 250000, toko: 185000 });
    expect(summarizeTodayExpenses(undefined, '2026-10-08')).toEqual({ karyawan: 0, toko: 0 });
  });
});

describe('buildFeed / filterFeed', () => {
  const names = { e1: 'Budi', e2: 'Sari' };
  const additions = [
    mapAdditionRow({ id: 'a1', employee_id: 'e2', category: 'Ongkir', label: 'Antar', amount: 15000, date: '2026-10-08', status: 'menunggu', requested_by: 'Sari', created_at: '2026-10-08T04:40:00.000Z' }, names),
    mapAdditionRow({ id: 'a2', employee_id: 'e1', category: 'Bonus', label: 'Target', amount: 100000, date: '2026-10-08', status: 'ditolak', reject_reason: 'Belum tercapai', created_at: '2026-10-08T01:50:00.000Z' }, names),
  ];
  const deductions = [mapDeductionRow({ id: 'd1', employee_id: 'e1', category: 'Kasbon', label: 'Kontrakan', amount: 200000, date: '2026-10-08', expense_id: 'x1', created_at: '2026-10-08T03:12:00.000Z' }, names)];
  const expenses = [
    mapExpenseRow({ id: 'x1', category: 'Kasbon', store_or_supplier_name: 'Budi', detail: 'Kontrakan', amount: 200000, transaction_date: '2026-10-08', payment_method: 'Tunai', employee_id: 'e1', created_at: '2026-10-08T03:12:00.000Z' }),
    mapExpenseRow({ id: 'x2', category: 'Belanja', store_or_supplier_name: 'Pasar Induk', detail: 'Bumbu\nMinyak', amount: 185000, transaction_date: '2026-10-08', payment_method: 'Tunai', created_at: '2026-10-08T00:30:00.000Z' }),
  ];
  const feed = buildFeed({ additions, deductions, expenses });

  it('pengeluaran yang terhubung ke karyawan tidak muncul dobel dengan potongannya', () => {
    expect(feed.map((i) => i.key)).toEqual(['tambah-a1', 'potongan-d1', 'tambah-a2', 'pengeluaran-x2']);
  });
  it('urut terbaru dulu, berisi status & alasan', () => {
    expect(feed[0]).toMatchObject({ kind: 'tambah', title: 'Sari', tag: 'Ongkir', status: 'menunggu', by: 'Sari' });
    expect(feed[2]).toMatchObject({ status: 'ditolak', reason: 'Belum tercapai' });
    expect(feed[1]).toMatchObject({ kind: 'potongan', status: 'tercatat', title: 'Budi' });
  });
  it('pengeluaran toko: judul = kategori, tag = toko, catatan = baris pertama', () => {
    expect(feed[3]).toMatchObject({ kind: 'pengeluaran', title: 'Belanja', tag: 'Pasar Induk', note: 'Bumbu', amount: 185000 });
  });
  it('tab karyawan / toko / semua', () => {
    expect(filterFeed(feed, 'karyawan').map((i) => i.kind)).toEqual(['tambah', 'potongan', 'tambah']);
    expect(filterFeed(feed, 'toko').map((i) => i.kind)).toEqual(['pengeluaran']);
    expect(filterFeed(feed, 'semua')).toHaveLength(4);
  });
});

describe('pendingRequests / pemetaan / waktu', () => {
  it('pengajuan menunggu, paling lama di atas', () => {
    const list = [
      { id: 1, status: 'menunggu', createdAt: '2026-10-08T05:00:00Z' },
      { id: 2, status: 'disetujui', createdAt: '2026-10-08T01:00:00Z' },
      { id: 3, status: 'menunggu', createdAt: '2026-10-08T02:00:00Z' },
    ];
    expect(pendingRequests(list).map((a) => a.id)).toEqual([3, 1]);
  });
  it('baris tanpa kolom status (sebelum migrasi) dianggap disetujui', () => {
    expect(mapAdditionRow({ id: 'a', employee_id: 'e', category: 'Bonus', label: 'x', amount: 1, date: '2026-10-08' }).status).toBe('disetujui');
  });
  it('karyawan tak dikenal diberi nama cadangan', () => {
    expect(mapAdditionRow({ id: 'a', employee_id: 'zzz', category: 'B', label: 'x', amount: 1, date: '2026-10-08' }, {}).employeeName).toBe('Karyawan');
  });
  it('formatClock & startOfLocalDayISO', () => {
    expect(formatClock('')).toBe('');
    expect(formatClock('bukan tanggal')).toBe('');
    expect(formatClock(new Date(2026, 9, 8, 7, 5).toISOString())).toBe('07:05');
    expect(new Date(startOfLocalDayISO('2026-10-08')).getHours()).toBe(0);
    expect(new Date(startOfLocalDayISO('2026-10-08')).getDate()).toBe(8);
  });
});

describe('deductionUpdateArgs — ubah potongan (form yang sama dengan Catat Cepat)', () => {
  it('memetakan form ke argumen RPC ubah_potongan', () => {
    expect(deductionUpdateArgs('d1', form({ category: 'Denda', label: ' Piring pecah ', amount: '25000', paymentMethod: 'Non-Tunai' }))).toEqual({
      p_deduction_id: 'd1', p_label: 'Piring pecah', p_amount: 25000, p_date: '2026-10-08', p_category: 'Denda', p_payment_method: 'Non-Tunai',
    });
  });
  it('keterangan kosong -> nama kategori; nilai asing jatuh ke Tunai', () => {
    const a = deductionUpdateArgs('d1', form({ category: 'Kasbon', label: '', paymentMethod: 'Kartu' }));
    expect(a.p_label).toBe('Kasbon'); expect(a.p_payment_method).toBe('Tunai');
  });
  it('tetap divalidasi: nominal, kategori, tanggal; id wajib', () => {
    expect(() => deductionUpdateArgs('d1', form({ amount: '0' }))).toThrow('Nominal');
    expect(() => deductionUpdateArgs('d1', form({ category: '' }))).toThrow('kategori');
    expect(() => deductionUpdateArgs('d1', form({ date: '' }))).toThrow('tanggal');
    expect(() => deductionUpdateArgs('', form())).toThrow('tidak ditemukan');
  });
});

describe('newAdditionRow — rincian Ongkir / Potong Ayam', () => {
  const ongkir = { kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: '5000' }, { customer: 'Bu Rina', amount: '4000' }] };
  const potong = { kind: 'potong_ayam', rows: [{ type: 'Bld', name: '', qty: '10', price: '3000' }, { type: 'Lainnya', name: 'Kepala ayam', qty: '2', price: '4500' }] };

  it('nominal = total rincian (nominal ketikan diabaikan), keterangan kosong = ringkasan, rincian ikut disimpan', () => {
    const r = newAdditionRow(form({ amount: '999', detail: ongkir }), { canApprove: true, nowISO: NOW });
    expect(r.amount).toBe(9000);
    expect(r.label).toBe('Ongkir (2 customer)');
    expect(r.detail).toEqual({ kind: 'ongkir', rows: [{ customer: 'Pak Hendra', amount: 5000 }, { customer: 'Bu Rina', amount: 4000 }] });
    const p = newAdditionRow(form({ category: 'Potong Ayam', amount: '', detail: potong }), { canApprove: false, nowISO: NOW });
    expect(p.amount).toBe(39000);
    expect(p.label).toBe('Potong Ayam (12 kg)');
    expect(p.detail.rows[1]).toEqual({ name: 'Kepala ayam', qty: 2, price: 4500 });
    expect(p.status).toBe('menunggu');
  });

  it('keterangan yang diisi sendiri tetap dipakai', () => {
    expect(newAdditionRow(form({ label: ' Sabtu ramai ', detail: ongkir }), { canApprove: true, nowISO: NOW }).label).toBe('Sabtu ramai');
  });

  it('tanpa rincian: baris persis seperti dulu (tidak ada kolom detail, aman sebelum migrasi 012)', () => {
    const r = newAdditionRow(form(), { canApprove: true, nowISO: NOW });
    expect('detail' in r).toBe(false);
    expect(newAdditionRow(form({ detail: null }), { canApprove: true, nowISO: NOW }).amount).toBe(15000);
  });

  it('rincian salah / tidak cocok kategori ditolak dengan pesan jelas', () => {
    expect(() => newAdditionRow(form({ detail: { kind: 'ongkir', rows: [{ customer: '', amount: '5000' }] } }), { canApprove: true, nowISO: NOW })).toThrow('isi nama customer');
    expect(() => newAdditionRow(form({ category: 'Bonus', detail: ongkir }), { canApprove: true, nowISO: NOW })).toThrow('tidak cocok');
  });

  it('mapAdditionRow membaca kolom detail dengan aman', () => {
    const base = { id: 'a', employee_id: 'e1', category: 'Ongkir', label: 'x', amount: 9000, date: '2026-10-08' };
    expect(mapAdditionRow({ ...base, detail: { kind: 'ongkir', rows: [{ customer: 'A', amount: 9000 }] } }).detail.rows).toHaveLength(1);
    expect(mapAdditionRow(base).detail).toBeNull();
    expect(mapAdditionRow({ ...base, detail: 'rusak' }).detail).toBeNull();
  });
});
describe('additionUpdateRow (owner mengubah Tambah dari Beranda)', () => {
  const base = { employeeId: 'e1', category: 'Bonus', label: ' Target ', amount: '150000', date: '2026-10-16' };

  it('hanya memuat kolom yang boleh berubah; status/persetujuan tidak disentuh', () => {
    const row = additionUpdateRow(base);
    expect(row).toEqual({ label: 'Target', amount: 150000, date: '2026-10-16', category: 'Bonus' });
    expect(row).not.toHaveProperty('status');
    expect(row).not.toHaveProperty('approved_by');
  });
  it('keterangan kosong = nama kategori', () => {
    expect(additionUpdateRow({ ...base, label: '' }).label).toBe('Bonus');
  });
  it('validasi sama dengan Tambah baru', () => {
    expect(() => additionUpdateRow({ ...base, amount: '0' })).toThrow('Nominal');
    expect(() => additionUpdateRow({ ...base, date: '' })).toThrow('tanggal');
    expect(() => additionUpdateRow({ ...base, category: ' ' })).toThrow('kategori');
  });
  it('rincian Ongkir: nominal = total rincian, keterangan kosong = ringkasan; kolom detail ikut dikirim', () => {
    const detail = { kind: 'ongkir', rows: [{ customer: 'Budi', amount: 3000 }, { customer: 'Sari', amount: 6000 }] };
    const row = additionUpdateRow({ ...base, category: 'Ongkir', label: '', amount: '1', detail }, { hadDetail: true });
    expect(row.amount).toBe(9000);
    expect(row.label).toBe('Ongkir (2 customer)');
    expect(row.detail).toEqual(detail);
  });
  it('rincian dibuang: detail dikosongkan hanya kalau sebelumnya ada', () => {
    expect(additionUpdateRow({ ...base, category: 'Ongkir', detail: null }, { hadDetail: true }).detail).toBeNull();
    expect(additionUpdateRow({ ...base, category: 'Ongkir', detail: null }, { hadDetail: false })).not.toHaveProperty('detail');
  });
  it('rincian yang tidak cocok dengan kategori ditolak', () => {
    const detail = { kind: 'ongkir', rows: [{ customer: 'Budi', amount: 3000 }] };
    expect(() => additionUpdateRow({ ...base, category: 'Bonus', detail })).toThrow('tidak cocok');
  });
});

describe('data untuk mengubah catatan dari Beranda', () => {
  it('mapExpenseRow membawa pemegang kas (kurir), supaya mengubah pengeluaran tidak menghapusnya diam-diam', () => {
    const e = mapExpenseRow({ id: 'x1', category: 'Belanja', amount: 5000, transaction_date: '2026-10-16', payment_method: 'Tunai', cash_holder_employee_id: 'k1', cash_holder_name: 'Andi', created_at: '2026-10-16T01:00:00.000Z' });
    expect(e).toMatchObject({ cashHolderEmployeeId: 'k1', cashHolderName: 'Andi' });
    expect(mapExpenseRow({ id: 'x2', category: 'Belanja', amount: 1, transaction_date: '2026-10-16' })).toMatchObject({ cashHolderEmployeeId: null });
  });
  it('tiap item feed membawa baris aslinya (source)', () => {
    const names = { e1: 'Budi' };
    const a = mapAdditionRow({ id: 'a1', employee_id: 'e1', category: 'Bonus', label: 'x', amount: 1000, date: '2026-10-16', created_at: '2026-10-16T03:00:00.000Z' }, names);
    const d = mapDeductionRow({ id: 'd1', employee_id: 'e1', category: 'Kasbon', label: 'y', amount: 2000, date: '2026-10-16', expense_id: 'x1', created_at: '2026-10-16T02:00:00.000Z' }, names);
    const x = mapExpenseRow({ id: 'x9', category: 'Belanja', amount: 3000, transaction_date: '2026-10-16', created_at: '2026-10-16T01:00:00.000Z' });
    const feed = buildFeed({ additions: [a], deductions: [d], expenses: [x] });
    expect(feed.map((i) => i.source.id)).toEqual(['a1', 'd1', 'x9']);
    expect(feed[1].source.expenseId).toBe('x1');
  });
});

describe('Tambah diedit / ditolak', () => {
  const row = { id: 'a1', employee_id: 'e1', category: 'Bonus', label: 'Target', amount: 100000, date: '2026-10-08', status: 'disetujui', created_at: '2026-10-08T01:50:00.000Z' };
  it('mapAdditionRow membaca edited_at; kosong = belum pernah diubah', () => {
    expect(mapAdditionRow(row).editedAt).toBe('');
    expect(mapAdditionRow({ ...row, edited_at: '2026-10-09T02:00:00Z' }).editedAt).toBe('2026-10-09T02:00:00Z');
  });
  it('additionChanged: hanya true kalau isinya berubah', () => {
    const cur = mapAdditionRow(row);
    const same = { label: 'Target', amount: 100000, date: '2026-10-08', category: 'Bonus' };
    expect(additionChanged(cur, same)).toBe(false);
    expect(additionChanged(cur, { ...same, amount: 120000 })).toBe(true);
    expect(additionChanged(cur, { ...same, label: 'Target Oktober' })).toBe(true);
    expect(additionChanged(cur, { ...same, date: '2026-10-09' })).toBe(true);
    expect(additionChanged(cur, { ...same, category: 'Ongkir' })).toBe(true);
  });
  it('additionChanged: rincian ikut dibandingkan (tidak dikirim = tidak berubah; dibuang = berubah)', () => {
    const detail = { kind: 'potong_ayam', rows: [{ name: 'Sayap', qty: 2.5, price: 3000 }] };
    const cur = mapAdditionRow({ ...row, category: 'Potong Ayam', amount: 7500, label: 'Potong Ayam (2,5 kg)', detail });
    const same = { label: 'Potong Ayam (2,5 kg)', amount: 7500, date: '2026-10-08', category: 'Potong Ayam' };
    expect(additionChanged(cur, same)).toBe(false);                                  // detail tidak dikirim
    expect(additionChanged(cur, { ...same, detail })).toBe(false);                   // detail sama
    expect(additionChanged(cur, { ...same, detail: { kind: 'potong_ayam', rows: [{ name: 'Sayap', qty: 3, price: 3000 }] } })).toBe(true);
    expect(additionChanged(cur, { ...same, detail: null })).toBe(true);              // rincian dibuang
  });
  it('shownAdditionAmount: ditolak = 0, selain itu nominalnya', () => {
    expect(shownAdditionAmount({ status: 'ditolak', amount: 50000 })).toBe(0);
    expect(shownAdditionAmount({ status: 'menunggu', amount: 50000 })).toBe(50000);
    expect(shownAdditionAmount({ status: 'disetujui', amount: 50000 })).toBe(50000);
  });
  it('buildFeed: Tambah ditolak membawa shownAmount 0 (amount asli tetap), Tambah diedit ditandai', () => {
    const feed = buildFeed({ additions: [
      mapAdditionRow({ ...row, id: 'r', status: 'ditolak', reject_reason: 'Belum tercapai' }, { e1: 'Sari' }),
      mapAdditionRow({ ...row, id: 'd', edited_at: '2026-10-09T02:00:00Z' }, { e1: 'Sari' }),
      mapAdditionRow({ ...row, id: 'n' }, { e1: 'Sari' }),
    ] });
    const by = Object.fromEntries(feed.map((i) => [i.id, i]));
    expect(by.r).toMatchObject({ amount: 100000, shownAmount: 0, edited: false, status: 'ditolak', reason: 'Belum tercapai' });
    expect(by.d).toMatchObject({ shownAmount: 100000, edited: true });
    expect(by.n).toMatchObject({ shownAmount: 100000, edited: false });
  });
});
