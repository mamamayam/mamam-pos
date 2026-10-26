import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: tampilan Dompet satu halaman (status+saklar, navigasi hari, uang di dompet / kurir / total cash).
const rp = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;
vi.mock('../../context/AppContext', () => ({ useAppContext: () => ({ formatRupiah: rp, triggerAlert: () => {}, triggerConfirm: () => {} }) }));
const data = { currentShift: null, stats: null, history: [], employees: [], loading: false, error: null };
vi.mock('../../hook/useShiftData', () => ({ useShiftData: () => ({ ...data, reload: async () => {}, openShift: async () => {}, closeShift: async () => {} }) }));

import ShiftView from './ShiftView';
import { toLocalDateString } from '../../utils/formatters';

// React SSR menyisipkan <!-- --> di antara teks yang digabung; dibuang supaya pencocokan teks wajar.
const render = () => renderToString(<ShiftView />).replace(/<!-- -->/g, '');

const openShift = { id: 's1', code: 'DOMPET-AAAA1111', opened_at: new Date().toISOString(), opened_by_employee_name: 'Budi' };
const stats = {
  initialCash: 300000, cashSales: 1260000, cashIncomes: 0, cashExpensesKasir: 85000, cashExpensesKurir: 40000,
  expectedCash: 1475000, couriers: [{ employeeId: 'k1', employeeName: 'Andi', balance: 110000 }], totalHeldByCouriers: 110000, totalCashBisnis: 1585000,
};

beforeEach(() => { data.currentShift = null; data.stats = null; data.history = []; data.loading = false; data.error = null; });

describe('ShiftView — Dompet satu halaman', () => {
  it('tanpa tab Riwayat; ada navigasi hari dan tombol Ke hari ini', () => {
    const html = render();
    expect(html).not.toContain('>Riwayat<');
    expect(html).toContain('data-testid="dompet-hari"');
    expect(html).toContain('Ke hari ini');
    expect(html).toContain('Hari sebelumnya');
  });

  it('dompet belum dibuka: badge, saklar mati, keterangan kosong', () => {
    const html = render();
    expect(html).toContain('Belum dibuka');
    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain('Dompet hari ini belum dibuka.');
    expect(html).not.toContain('data-testid="uang-di-dompet"');
  });

  it('dompet terbuka: Uang di Dompet = expectedCash (utama), kurir terpisah, Total Cash di bawahnya', () => {
    data.currentShift = openShift; data.stats = stats;
    const html = render();
    expect(html).toContain('Terbuka');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('Uang di Dompet');
    expect(html).toContain('Rp 1.475.000');
    expect(html).toContain('Uang di Kurir');
    expect(html).toContain('Rp 110.000');
    expect(html).toContain('Total Cash');
    expect(html).toContain('Rp 1.585.000');
    expect(html.indexOf('Uang di Dompet')).toBeLessThan(html.indexOf('Uang di Kurir'));
    expect(html.indexOf('Uang di Kurir')).toBeLessThan(html.indexOf('Total Cash'));
    // Kartu kurir = pola yang sama dengan dompet (nominal besar + dropdown Rincian), cuma beda warna.
    const kurir = html.slice(html.indexOf('data-testid="kartu-kurir"'));
    expect(kurir).toContain('Rincian');
    expect(kurir).toContain('bg-accent-100');
    expect(kurir).not.toContain('sky-');
    expect(kurir).toContain('Andi');
  });

  it('tanpa uang di kurir: kartu kurir tidak tampil, Total Cash tetap', () => {
    data.currentShift = openShift;
    data.stats = { ...stats, couriers: [], totalHeldByCouriers: 0, totalCashBisnis: 1475000 };
    const html = render();
    expect(html).not.toContain('data-testid="kartu-kurir"');
    expect(html).toContain('data-testid="total-cash"');
  });

  it('dompet terbuka dari hari sebelumnya: peringatan belum ditutup', () => {
    data.currentShift = { ...openShift, opened_at: new Date(Date.now() - 2 * 86400000).toISOString() };
    data.stats = stats;
    expect(render()).toContain('Dompet belum ditutup dari hari sebelumnya!');
  });

  it('penutupan yang ditutup hari ini tampil langsung: uang aktual, selisih, snapshot kurir', () => {
    const closedAt = new Date().toISOString();
    expect(toLocalDateString(closedAt)).toBe(toLocalDateString());
    data.history = [{
      id: 'h1', code: 'DOMPET-BBBB2222', opened_at: closedAt, closed_at: closedAt, opened_by_employee_name: 'Sari',
      expected_cash: 2000000, closing_balance: 1985000, difference: -15000,
      stats_json: { initialCash: 300000, cashSales: 1870000, cashIncomes: 50000, cashExpensesKasir: 220000, cashExpensesKurir: 0 },
      courier_snapshot_json: [{ employeeId: 'k1', employeeName: 'Andi', balance: 180000 }],
    }];
    const html = render();
    expect(html).toContain('data-testid="penutupan"');
    expect(html).toContain('DOMPET-BBBB2222');
    expect(html).toContain('Uang di Dompet saat Tutup');
    expect(html).toContain('Rp 1.985.000');
    expect(html).toContain('Minus');
    expect(html).toContain('Rp 180.000');
    expect(html).not.toContain('Hanya catatan saat tutup');
    expect(html).not.toContain('Sudah termasuk');
    expect(html).not.toContain('Dompet hari ini belum dibuka.');
  });

  it('memuat dan galat tetap ditangani', () => {
    data.loading = true;
    expect(render()).toContain('Memuat dompet...');
    data.loading = false; data.error = 'putus';
    expect(render()).toContain('Gagal memuat dompet');
  });
});
