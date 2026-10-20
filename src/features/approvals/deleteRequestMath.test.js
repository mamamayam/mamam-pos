import { describe, it, expect } from 'vitest';
import { mapDeleteRequest, mapExpenseDeleteRequest, validateDeleteRequest, requestIndex, pendingDeleteRequests, REQUEST_STATUS } from './deleteRequestMath';

const row = (over = {}) => ({
  id: 'r1', transaction_id: 't1', display_number: '0042', customer_name: 'Budi', order_type: 'Takeaway', payment_method: 'Tunai',
  total: 45000, transaction_at: '2026-10-16T03:00:00Z', items_summary: '2x Ayam Geprek', reason: 'Salah input', requested_by: 'Andi',
  status: 'menunggu', reject_reason: null, created_at: '2026-10-16T04:00:00Z', ...over,
});

describe('mapDeleteRequest', () => {
  it('memetakan kolom ke bentuk tampilan', () => {
    expect(mapDeleteRequest(row())).toMatchObject({ id: 'r1', transactionId: 't1', number: '0042', customer: 'Budi', total: 45000, reason: 'Salah input', requestedBy: 'Andi', status: 'menunggu', rejectReason: '' });
  });
  it('kolom kosong aman, status asing dianggap menunggu', () => {
    const m = mapDeleteRequest({ id: 'r2', transaction_id: 't2', status: 'aneh' });
    expect(m).toMatchObject({ number: '', customer: '', total: 0, items: '', status: 'menunggu' });
  });
});

describe('validateDeleteRequest', () => {
  it('alasan dan nama wajib, hasilnya dirapikan', () => {
    expect(validateDeleteRequest({ reason: '  Salah input ', requestedBy: ' Andi ' })).toEqual({ reason: 'Salah input', requestedBy: 'Andi' });
    expect(() => validateDeleteRequest({ reason: '  ', requestedBy: 'Andi' })).toThrow('alasan');
    expect(() => validateDeleteRequest({ reason: 'x', requestedBy: '' })).toThrow('namamu');
    expect(() => validateDeleteRequest()).toThrow('alasan');
  });
});

describe('requestIndex', () => {
  const m = (over) => mapDeleteRequest(row(over));
  it('menunggu menang atas ditolak; disetujui tidak masuk', () => {
    const idx = requestIndex([
      m({ id: 'a', status: 'ditolak', created_at: '2026-10-16T05:00:00Z' }),
      m({ id: 'b', status: 'menunggu', created_at: '2026-10-16T04:00:00Z' }),
      m({ id: 'c', transaction_id: 't2', status: 'disetujui' }),
    ]);
    expect(idx.get('t1').id).toBe('b');
    expect(idx.has('t2')).toBe(false);
  });
  it('tanpa menunggu: ditolak terbaru yang dipakai, apa pun urutan masuknya', () => {
    const old = m({ id: 'old', status: 'ditolak', created_at: '2026-10-15T01:00:00Z' });
    const recent = m({ id: 'new', status: 'ditolak', created_at: '2026-10-16T01:00:00Z' });
    expect(requestIndex([old, recent]).get('t1').id).toBe('new');
    expect(requestIndex([recent, old]).get('t1').id).toBe('new');
  });
  it('menunggu yang datang belakangan tetap mengalahkan ditolak', () => {
    const rej = m({ id: 'rej', status: 'ditolak' });
    const pen = m({ id: 'pen', status: 'menunggu', created_at: '2026-10-14T00:00:00Z' });
    expect(requestIndex([rej, pen]).get('t1').id).toBe('pen');
  });
  it('masukan kosong aman', () => { expect(requestIndex(undefined).size).toBe(0); });
});

describe('pendingDeleteRequests', () => {
  it('hanya yang menunggu, terlama dulu', () => {
    const list = [
      mapDeleteRequest(row({ id: 'late', created_at: '2026-10-16T09:00:00Z' })),
      mapDeleteRequest(row({ id: 'done', status: 'disetujui' })),
      mapDeleteRequest(row({ id: 'early', transaction_id: 't3', created_at: '2026-10-16T01:00:00Z' })),
    ];
    expect(pendingDeleteRequests(list).map((r) => r.id)).toEqual(['early', 'late']);
    expect(REQUEST_STATUS.PENDING).toBe('menunggu');
  });
});

describe('pengajuan hapus pengeluaran', () => {
  const erow = (over = {}) => ({
    id: 'x1', expense_id: 'e1', expense_date: '2026-10-16', category: 'Belanja', supplier: 'Pasar', detail: 'Sayur', payment_method: 'Tunai',
    amount: 120000, employee_id: null, employee_name: null, reason: 'Dobel catat', requested_by: 'Andi', status: 'menunggu', reject_reason: null,
    created_at: '2026-10-16T04:00:00Z', ...over,
  });
  it('memetakan kolom; kolom kosong aman; status asing dianggap menunggu', () => {
    expect(mapExpenseDeleteRequest(erow())).toMatchObject({ id: 'x1', expenseId: 'e1', category: 'Belanja', amount: 120000, employeeId: null, reason: 'Dobel catat', requestedBy: 'Andi', status: 'menunggu', rejectReason: '' });
    expect(mapExpenseDeleteRequest({ id: 'x2', expense_id: 'e2', status: 'aneh' })).toMatchObject({ category: '', supplier: '', amount: 0, status: 'menunggu' });
  });
  it('validasi memakai kata "pengeluaran" di pesannya', () => {
    expect(() => validateDeleteRequest({ reason: ' ', requestedBy: 'Andi' }, 'pengeluaran')).toThrow('pengeluaran ini');
    expect(() => validateDeleteRequest({ reason: 'x', requestedBy: '' }, 'pengeluaran')).toThrow('namamu');
    expect(validateDeleteRequest({ reason: ' x ', requestedBy: ' A ' }, 'pengeluaran')).toEqual({ reason: 'x', requestedBy: 'A' });
  });
  it('indeks per pengeluaran lewat keyOf: menunggu menang, ditolak terbaru, disetujui tidak masuk', () => {
    const m = (over) => mapExpenseDeleteRequest(erow(over));
    const idx = requestIndex([
      m({ id: 'a', status: 'ditolak', created_at: '2026-10-16T05:00:00Z' }),
      m({ id: 'b', status: 'menunggu' }),
      m({ id: 'c', expense_id: 'e2', status: 'disetujui' }),
      m({ id: 'd', expense_id: 'e3', status: 'ditolak', created_at: '2026-10-15T01:00:00Z' }),
      m({ id: 'e', expense_id: 'e3', status: 'ditolak', created_at: '2026-10-16T01:00:00Z' }),
    ], (r) => r.expenseId);
    expect(idx.get('e1').id).toBe('b');
    expect(idx.has('e2')).toBe(false);
    expect(idx.get('e3').id).toBe('e');
  });
});
