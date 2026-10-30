import { describe, it, expect } from 'vitest';
import { storeExpenseCategories, defaultExpenseCategory } from './expenseCategories';

describe('storeExpenseCategories', () => {
  it('menyembunyikan Kasbon (apa pun huruf besar/kecilnya) dari pilihan form Pengeluaran', () => {
    expect(storeExpenseCategories(['Belanja', 'Kasbon', 'Gaji', ' kasbon karyawan', 'Lainnya'])).toEqual(['Belanja', 'Gaji', 'Lainnya']);
  });
  it('aman untuk daftar kosong / undefined', () => {
    expect(storeExpenseCategories([])).toEqual([]);
    expect(storeExpenseCategories(undefined)).toEqual([]);
  });
});

describe('defaultExpenseCategory', () => {
  it('memilih Belanja kalau ada, tanpa peduli huruf besar/kecil dan spasi, dan mengembalikan penulisan aslinya', () => {
    expect(defaultExpenseCategory(['Gaji', 'Belanja', 'Lainnya'])).toBe('Belanja');
    expect(defaultExpenseCategory(['Gaji', ' belanja '])).toBe(' belanja ');
  });
  it('kosong kalau tidak ada Belanja (pilih manual), aman untuk daftar kosong / undefined', () => {
    expect(defaultExpenseCategory(['Gaji', 'Lainnya'])).toBe('');
    expect(defaultExpenseCategory([])).toBe('');
    expect(defaultExpenseCategory(undefined)).toBe('');
  });
});
