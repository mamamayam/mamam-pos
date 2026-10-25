/**
 * shiftMath — rumus uang Shift/Dompet. FUNGSI MURNI: tanpa React, tanpa
 * Supabase, tanpa Date.now() tersembunyi. Semua masukan dioper eksplisit,
 * jadi hasilnya bisa dites persis.
 *
 * Aturan uang dipertahankan dari mamam-global (useShiftLogic.js):
 *  - Hanya porsi TUNAI yang menyentuh kas fisik. QRIS/Transfer/Ojol tidak.
 *  - Split Payment: hanya porsi yang method-nya 'Tunai'.
 *  - Penjualan tunai yang dipegang kurir (COD delivery) masuk ke KURIR,
 *    bukan ke laci kasir.
 *  - Pengeluaran tunai keluar dari laci kasir, atau dari kurir kalau
 *    kurir yang membayar (cash holder).
 *  - Pemasukan lain (income) tunai masuk laci.
 *
 * BEDA dari A (sengaja, sesuai arahan): TIDAK ada ledger perpindahan
 * uang dan saldo kurir TIDAK kebawa lintas shift. Uang yang masih di kurir
 * saat tutup hanya jadi snapshot laporan.
 */

const rp = (n) => Number(n) || 0;

/** Satu penjualan → berapa tunai yang masuk laci dan berapa ke kurir. */
export function cashPortionOfSale(sale) {
  let cash = 0;
  if (sale.payment_method === 'Tunai') {
    cash = rp(sale.total);
  } else if (sale.payment_method === 'Split Payment') {
    const parts = Array.isArray(sale.split_payments_json) ? sale.split_payments_json : [];
    cash = parts.filter(p => p.method === 'Tunai').reduce((s, p) => s + rp(p.amount), 0);
  }
  // Metode lain (QRIS/Transfer/Ojol) tidak menyentuh kas fisik.
  const toCourier = !!sale.cash_holder_employee_id;
  return { toDompet: toCourier ? 0 : cash, toCourier: toCourier ? cash : 0, courierId: sale.cash_holder_employee_id || null, courierName: sale.cash_holder_name || null };
}

/**
 * Hitung angka shift dari data MENTAH.
 *
 * @param shift      { opening_balance, opened_at }
 * @param sales      transaksi status 'paid' pada rentang shift
 * @param expenses   pengeluaran (direction 'pengeluaran') pada rentang shift
 * @param incomes    pemasukan lain (direction 'pemasukan') pada rentang shift
 */
export function computeShiftStats({ shift, sales = [], expenses = [], incomes = [] }) {
  const initialCash = rp(shift?.opening_balance);

  let cashSales = 0;                // penjualan tunai yang masuk laci
  const courierMap = new Map();     // employeeId -> { name, cashIn, cashOut }

  const touchCourier = (id, name) => {
    if (!courierMap.has(id)) courierMap.set(id, { employeeId: id, employeeName: name || 'Kurir', cashIn: 0, cashOut: 0 });
    const c = courierMap.get(id);
    if (name && c.employeeName === 'Kurir') c.employeeName = name;
    return c;
  };

  for (const sale of sales) {
    const p = cashPortionOfSale(sale);
    cashSales += p.toDompet;
    if (p.toCourier > 0) touchCourier(p.courierId, p.courierName).cashIn += p.toCourier;
  }

  let cashExpensesKasir = 0;
  let cashExpensesKurir = 0;
  for (const e of expenses) {
    if ((e.payment_method || 'Tunai') !== 'Tunai') continue;   // non-tunai tidak menyentuh kas
    if (e.cash_holder_employee_id) {
      cashExpensesKurir += rp(e.amount);
      touchCourier(e.cash_holder_employee_id, e.cash_holder_name).cashOut += rp(e.amount);
    } else {
      cashExpensesKasir += rp(e.amount);
    }
  }

  const cashIncomes = incomes
    .filter(i => (i.payment_method || 'Tunai') === 'Tunai')
    .reduce((s, i) => s + rp(i.amount), 0);

  // Saldo seharusnya di laci = modal + penjualan tunai + pemasukan - pengeluaran kasir.
  // Pemasukan dihitung SEKALI di sini (bug lama di A: sempat dobel).
  const expectedCash = initialCash + cashSales + cashIncomes - cashExpensesKasir;

  // Snapshot uang di kurir. Bisa NEGATIF: kurir nombokin belanja pakai uang
  // pribadinya (bisnis berutang ke kurir). Sengaja TIDAK di-clamp ke 0.
  const couriers = [...courierMap.values()]
    .map(c => ({ employeeId: c.employeeId, employeeName: c.employeeName, balance: c.cashIn - c.cashOut }))
    .filter(c => c.balance !== 0);
  const totalHeldByCouriers = couriers.reduce((s, c) => s + c.balance, 0);

  return {
    initialCash,
    cashSales,
    cashIncomes,
    cashExpensesKasir,
    cashExpensesKurir,
    expectedCash,
    couriers,
    totalHeldByCouriers,
    totalCashBisnis: expectedCash + totalHeldByCouriers,
  };
}

/** Selisih saat tutup: positif = uang lebih, negatif = uang kurang. */
export function computeDifference(actualCash, expectedCash) {
  return rp(actualCash) - rp(expectedCash);
}

/** Kode shift untuk tampilan, mis. DOMPET-3F2A9C1B (8 hex dari uuid). */
export function shiftCodeFromId(uuid) {
  return `DOMPET-${String(uuid || '').replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}

/**
 * Penutupan dompet pada satu hari (hari TUTUP, 'YYYY-MM-DD' lokal), urut dari yang paling awal.
 * `dayOf` mengubah timestamp jadi 'YYYY-MM-DD' lokal (dioper supaya fungsi ini tetap murni dan bisa dites).
 */
export function closedOnDay(history, day, dayOf) {
  return (history || [])
    .filter(s => s?.closed_at && dayOf(s.closed_at) === day)
    .sort((a, b) => String(a.closed_at).localeCompare(String(b.closed_at)));
}

/** Nada selisih tutup: 'minus' | 'lebih' | 'pas'. */
export const diffTone = (d) => (Number(d) < 0 ? 'minus' : Number(d) > 0 ? 'lebih' : 'pas');
