import { isKasbon } from '../payroll/payrollCost';

/**
 * Kategori yang boleh dipilih di form Pengeluaran (toko). Kasbon TIDAK ditawarkan di sini:
 * kasbon hanya dicatat sebagai Potongan karyawan lewat Catat Cepat (yang otomatis jadi
 * pengeluaran karyawan, tetap masuk gaji, Dompet, dan Laporan). FUNGSI MURNI (dites).
 */
/**
 * Kategori bawaan form Pengeluaran baru = "Belanja" (kebanyakan pengeluaran adalah belanja; permintaan pemilik
 * 30 Okt 2026). Dicocokkan tanpa peduli huruf besar/kecil; kalau tidak ada di daftar, kosong (pilih manual).
 * FUNGSI MURNI (dites).
 */
export const defaultExpenseCategory = (options) => (options || []).find((c) => String(c).trim().toLowerCase() === 'belanja') || '';

export const storeExpenseCategories = (categories) => (categories || []).filter((c) => !isKasbon(c));
