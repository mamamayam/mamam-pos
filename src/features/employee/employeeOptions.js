/**
 * Opsi karyawan — nilainya SAMA dengan mamam-global (payrollLogic.js) dan
 * cocok dengan model HRD mamam-kasir:
 *  - status: aktif | freelance | cuti | resign (sama persis di A dan B)
 *  - role  : disimpan huruf kecil seperti A ('kasir' | 'kurir').
 *            B memakai NAMA role ('Kasir'/'Kurir'/'Manajer'); saat migrasi
 *            cukup di-map (huruf pertama kapital). 'Manajer' baru ada di B
 *            dan terkait level izin, jadi belum dipakai di C (belum ada login).
 *  - tarif lembur bawaan 5.000 per 30 menit (sama dengan B: defaultOvertimeRatePer30Min)
 */
export const EMPLOYEE_STATUS_OPTIONS = [
  { value: 'aktif', label: 'Aktif', badgeVariant: 'success' },
  { value: 'freelance', label: 'Freelance', badgeVariant: 'info' },
  { value: 'cuti', label: 'Cuti', badgeVariant: 'warning' },
  { value: 'resign', label: 'Resign', badgeVariant: 'neutral' },
];

export const EMPLOYEE_ROLE_OPTIONS = [
  { value: 'kasir', label: 'Kasir', badgeVariant: 'info' },
  { value: 'kurir', label: 'Kurir', badgeVariant: 'warning' },
];

export const OVERTIME_RATE_PER_30MIN = 5000;

/**
 * Karyawan berstatus Cuti atau Resign DISEMBUNYIKAN dari semua pilihan dan papan kerja (Absensi, daftar pengisi stok,
 * penerima Kasbon/Tambahan, kurir, dst) sampai statusnya kembali Aktif/Freelance (permintaan pemilik 28 Okt 2026).
 * Layar Karyawan tetap menampilkan semuanya supaya statusnya bisa diubah. Satu-satunya pengecualian: Penggajian tetap
 * menampilkan mereka bila ada aktivitas di periode yang dilihat (gaji terakhir tidak boleh hilang).
 */
export const HIDDEN_STATUSES = ['cuti', 'resign'];
export const isOnDuty = (e) => !HIDDEN_STATUSES.includes(e?.status);
export const onDutyOnly = (list) => (list || []).filter(isOnDuty);

export const statusInfo = (v) => EMPLOYEE_STATUS_OPTIONS.find(s => s.value === v) || EMPLOYEE_STATUS_OPTIONS[0];
export const roleInfo = (v) => EMPLOYEE_ROLE_OPTIONS.find(r => r.value === v) || EMPLOYEE_ROLE_OPTIONS[0];
