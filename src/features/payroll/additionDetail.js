/**
 * additionDetail — rincian Tambahan gaji untuk kategori Ongkir dan Potong Ayam. FUNGSI MURNI (dites).
 *
 * Rincian disimpan di kolom `detail` (jsonb) payroll_additions: { kind, rows }.
 *  - ongkir      : rows = [{ customer, amount }]
 *  - potong_ayam : rows = [{ name, qty, price }]   (qty = jumlah kg, boleh DESIMAL mis. 2,5; harga = rupiah per kg,
 *                                                   disalin ke baris, jadi mengubah harga di Pengaturan tidak mengubah catatan lama)
 * Nominal Tambahan = total rincian. Keterangan (label) otomatis "Ongkir (2 customer)" / "Potong Ayam (16 kg)"
 * kalau dikosongkan. Baris lama tanpa rincian tidak berubah sama sekali.
 *
 * Saat mengisi form, angka disimpan sebagai teks (dari NominalInput / kolom jumlah); cleanDetail() mengubahnya jadi
 * angka dan melempar Error berpesan Indonesia kalau ada yang belum benar. Uang tetap integer rupiah: upah satu baris =
 * round(jumlah × harga), jumlah desimal (koma atau titik, maksimal 3 angka di belakang koma) hanya untuk kg.
 */
export const DETAIL_KIND = Object.freeze({ ONGKIR: 'ongkir', POTONG: 'potong_ayam' });
export const CUSTOM_CUT = 'Lainnya';
export const DEFAULT_CUT_PRICES = Object.freeze([
  Object.freeze({ name: 'Bld', price: 3000 }), Object.freeze({ name: 'Sayap', price: 3000 }), Object.freeze({ name: 'Karkas', price: 3000 }),
]);
export const MAX_DETAIL_ROWS = 100;
/** Satuan jumlah Potong Ayam yang tampil di layar dan keterangan otomatis (permintaan pemilik 21 Okt 2026: kg, bukan potong). */
export const CUT_UNIT = 'kg';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const int = (v) => { const n = Number(String(v ?? '').replace(/[^\d]/g, '')); return Number.isFinite(n) ? n : 0; };
/** Jumlah desimal dari teks ("2,5" / "2.5" / 2.5 -> 2.5); selain angka = 0. Dibulatkan 3 angka di belakang koma. */
export const dec = (v) => {
  const m = /^\d*(?:[.,]\d*)?/.exec(String(v ?? '').trim());
  const n = parseFloat((m ? m[0] : '').replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
};
/** Jumlah untuk layar: koma desimal, tanpa nol di belakang ("2,5", "3"). */
export const fmtQty = (n) => String(dec(n)).replace('.', ',');
const text = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
export const fmtNum = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dots = fmtNum;
export const fmtTgl = (date) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] || ''}`.trim() : String(date || '');
};

/** Kategori mana yang punya rincian? Cocokkan nama (tanpa peduli huruf besar/kecil dan spasi). */
export function detailKindForCategory(category) {
  const n = String(category || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
  if (n === 'ongkir') return DETAIL_KIND.ONGKIR;
  if (n === 'potong ayam') return DETAIL_KIND.POTONG;
  return null;
}

export const detailTitle = (kind) => (kind === DETAIL_KIND.ONGKIR ? 'Detail ongkir' : 'Detail potong ayam');

/** Baris kosong untuk form. Potong ayam: jenis pertama dari daftar harga, jumlah 1, harga bawaan. */
export function emptyRow(kind, cutPrices = DEFAULT_CUT_PRICES) {
  if (kind === DETAIL_KIND.ONGKIR) return { customer: '', amount: '' };
  const first = cutPrices[0];
  return first ? { type: first.name, name: '', qty: '1', price: String(first.price) } : { type: CUSTOM_CUT, name: '', qty: '1', price: '' };
}
export const startDetail = (kind, cutPrices) => ({ kind, rows: [emptyRow(kind, cutPrices)] });

/** Ganti jenis potongan di satu baris: harga ikut harga bawaan jenis itu ("Lainnya" mengosongkan harga). */
export function withCutType(row, type, cutPrices = DEFAULT_CUT_PRICES) {
  const preset = cutPrices.find((c) => c.name === type);
  return { ...row, type, name: type === CUSTOM_CUT ? row.name || '' : '', price: preset ? String(preset.price) : '' };
}

/**
 * Rincian tersimpan (bentuk database: { name, qty, price }) -> bentuk isian form. Baris Potong Ayam di form memakai
 * `type` (nama jenis dari daftar harga, atau "Lainnya" + `name` bebas); tanpa `type`, kolom Jenis tampil kosong
 * (bug "Sayap hilang" saat mengubah Tambahan). Nama yang cocok dengan daftar harga (tanpa peduli huruf besar/kecil)
 * jadi jenis itu; selain itu (jenis sudah dihapus dari Pengaturan, nama bebas) jadi "Lainnya" dengan namanya.
 * Harga dan jumlah baris tetap apa adanya. Objek yang sama dikembalikan kalau tidak ada yang perlu diubah.
 */
export function detailForForm(detail, cutPrices = DEFAULT_CUT_PRICES) {
  if (!detail || detail.kind !== DETAIL_KIND.POTONG) return detail;
  if ((detail.rows || []).every((r) => r?.type)) return detail;
  const rows = (detail.rows || []).map((r) => {
    if (r?.type) return r;
    const nm = text(r?.name);
    const preset = cutPrices.find((c) => c.name.toLowerCase() === nm.toLowerCase());
    return preset ? { ...r, type: preset.name, name: '' } : { ...r, type: CUSTOM_CUT, name: nm };
  });
  return { ...detail, rows };
}

export function rowAmount(kind, row) {
  return kind === DETAIL_KIND.ONGKIR ? int(row?.amount) : Math.round(dec(row?.qty) * int(row?.price));
}
export const detailTotal = (detail) => (detail?.rows || []).reduce((s, r) => s + rowAmount(detail.kind, r), 0);
/** Jumlah kg seluruh baris (bisa desimal). Nama lama `detailPieces` dipertahankan supaya pemanggil tidak berubah. */
export const detailPieces = (detail) => Math.round((detail?.rows || []).reduce((s, r) => s + dec(r?.qty), 0) * 1000) / 1000;

const isBlank = (kind, r) => (kind === DETAIL_KIND.ONGKIR ? !text(r?.customer) && !int(r?.amount) : !dec(r?.qty) && !int(r?.price));
const rowName = (r) => (r?.type === CUSTOM_CUT ? text(r?.name) : text(r?.type ?? r?.name));

/** Validasi + rapikan rincian dari form. Mengembalikan { kind, rows } berisi integer, atau null kalau tidak ada rincian. */
export function cleanDetail(detail) {
  if (!detail) return null;
  const kind = detail.kind;
  if (kind !== DETAIL_KIND.ONGKIR && kind !== DETAIL_KIND.POTONG) throw new Error('Jenis rincian tidak dikenal.');
  const raw = (detail.rows || []).filter((r) => !isBlank(kind, r));
  if (raw.length === 0) throw new Error('Isi minimal satu baris detail, atau tutup detail.');
  if (raw.length > MAX_DETAIL_ROWS) throw new Error(`Detail maksimal ${MAX_DETAIL_ROWS} baris.`);
  const rows = raw.map((r, i) => {
    const n = i + 1;
    if (kind === DETAIL_KIND.ONGKIR) {
      const customer = text(r.customer);
      if (!customer) throw new Error(`Baris ${n}: isi nama customer.`);
      if (int(r.amount) <= 0) throw new Error(`Baris ${n}: isi jumlah ongkir.`);
      return { customer, amount: int(r.amount) };
    }
    const name = rowName(r);
    if (!name) throw new Error(`Baris ${n}: isi nama potongan.`);
    if (dec(r.qty) <= 0) throw new Error(`Baris ${n}: jumlah harus lebih dari 0.`);
    if (int(r.price) <= 0) throw new Error(`Baris ${n}: isi harga.`);
    return { name, qty: dec(r.qty), price: int(r.price) };
  });
  return { kind, rows };
}

/** Keterangan otomatis dari rincian yang sudah bersih. */
export function detailLabel(detail) {
  if (!detail) return '';
  return detail.kind === DETAIL_KIND.ONGKIR ? `Ongkir (${detail.rows.length} customer)` : `Potong Ayam (${fmtQty(detailPieces(detail))} ${CUT_UNIT})`;
}

/**
 * Apakah `label` keterangan OTOMATIS dari rincian ini? Catatan lama bersatuan "potong" ("Potong Ayam (16 potong)")
 * tetap dikenali, supaya saat diubah keterangannya ikut berganti bersama isian dan tidak dianggap ketikan sendiri.
 */
export function isAutoDetailLabel(detail, label) {
  if (!detail) return false;
  if (label === detailLabel(detail)) return true;
  return detail.kind === DETAIL_KIND.POTONG && label === `Potong Ayam (${fmtQty(detailPieces(detail))} potong)`;
}

/** Baris kecil untuk layar: [{ text, amount }]. */
export function detailSubRows(detail) {
  if (!detail) return [];
  return detail.rows.map((r) => (detail.kind === DETAIL_KIND.ONGKIR
    ? { text: r.customer, amount: r.amount }
    : { text: `${r.name} ${fmtQty(r.qty)} × ${dots(r.price)}`, amount: rowAmount(detail.kind, r) }));
}

/** Baca kolom jsonb dari database dengan aman (null / teks / bentuk salah = tidak ada rincian). */
export function parseDetail(raw) {
  let v = raw;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v !== 'object' || !Array.isArray(v.rows)) return null;
  if (v.kind === DETAIL_KIND.ONGKIR) {
    const rows = v.rows.map((r) => ({ customer: text(r?.customer), amount: int(r?.amount) })).filter((r) => r.customer || r.amount);
    return rows.length ? { kind: v.kind, rows } : null;
  }
  if (v.kind === DETAIL_KIND.POTONG) {
    const rows = v.rows.map((r) => ({ name: text(r?.name), qty: dec(r?.qty), price: int(r?.price) })).filter((r) => r.name && r.qty > 0);
    return rows.length ? { kind: v.kind, rows } : null;
  }
  return null;
}

/**
 * Lampiran PDF dari daftar Tambahan periode ini (yang punya rincian), urut tanggal.
 * null kalau tidak ada satu pun rincian.
 */
export function buildAttachments(additions) {
  const ongkir = []; const potong = [];
  const sorted = [...(additions || [])].map((a, i) => ({ a, i })).sort((x, y) => String(x.a.date).localeCompare(String(y.a.date)) || x.i - y.i);
  for (const { a } of sorted) {
    const d = parseDetail(a.detail);
    if (!d) continue;
    if (d.kind === DETAIL_KIND.ONGKIR) d.rows.forEach((r) => ongkir.push({ date: a.date, customer: r.customer, amount: r.amount }));
    else d.rows.forEach((r) => potong.push({ date: a.date, name: r.name, qty: r.qty, price: r.price, subtotal: rowAmount(DETAIL_KIND.POTONG, r) }));
  }
  if (!ongkir.length && !potong.length) return null;
  return {
    ongkir: ongkir.length ? { rows: ongkir, total: ongkir.reduce((s, r) => s + r.amount, 0) } : null,
    potong: potong.length ? { rows: potong, total: potong.reduce((s, r) => s + r.subtotal, 0) } : null,
  };
}

// ---- Daftar harga potong ayam (Pengaturan) ----
const copyDefaults = () => DEFAULT_CUT_PRICES.map((c) => ({ ...c }));

/** Baca pengaturan `potong_ayam_prices` dengan aman; kosong / rusak = harga bawaan. */
export function sanitizeCutPrices(v) {
  if (!Array.isArray(v)) return copyDefaults();
  const seen = new Set(); const out = [];
  for (const it of v) {
    const name = text(it?.name); const price = int(it?.price); const key = name.toLowerCase();
    if (!name || price <= 0 || key === CUSTOM_CUT.toLowerCase() || seen.has(key)) continue;
    seen.add(key); out.push({ name, price });
  }
  return out.length ? out : copyDefaults();
}

/** Validasi isian Pengaturan > Harga Potong Ayam. */
export function validateCutPrices(list) {
  const rows = (list || []).map((r) => ({ name: text(r?.name), price: int(r?.price) }));
  if (rows.length === 0) return { ok: false, message: 'Isi minimal satu jenis potongan.' };
  const seen = new Set();
  for (const [i, r] of rows.entries()) {
    const key = r.name.toLowerCase();
    if (!r.name) return { ok: false, message: `Baris ${i + 1}: isi nama jenis.` };
    if (r.name.length > 30) return { ok: false, message: `Baris ${i + 1}: nama maksimal 30 huruf.` };
    if (key === CUSTOM_CUT.toLowerCase()) return { ok: false, message: '"Lainnya" sudah otomatis ada, pakai nama lain.' };
    if (seen.has(key)) return { ok: false, message: `Nama "${r.name}" dobel.` };
    if (r.price <= 0) return { ok: false, message: `Baris ${i + 1}: isi harga lebih dari 0.` };
    seen.add(key);
  }
  return { ok: true, list: rows };
}
