import { formatRupiah as defaultRupiah } from '../../utils/formatters';

/**
 * receiptImage — struk / tagihan sebagai GAMBAR (PNG) selebar kertas struk, dibuat di perangkat lewat <canvas>
 * (tanpa library). Menggantikan receiptPdf.js: struk dibagikan sebagai gambar, bukan PDF.
 *
 * Dibagi dua supaya bisa dites tanpa canvas:
 *   - layoutReceipt(r, { measure, formatRupiah, business })  FUNGSI MURNI -> { width, height, ops }
 *       r = bentuk dari receiptModel.js; measure(teks, ukuran, tebal) = lebar teks (px).
 *       ops = daftar gambar: { t: 'text', text, x, y (garis dasar), size, bold, color, align } | { t: 'line', y, dashed, w }
 *   - buildReceiptImage(r, opts)  menggambar ops ke canvas lalu mengembalikan Blob PNG (butuh browser).
 *
 * Transaksi lunas  -> judul "STRUK PEMBELIAN" + rincian pembayaran (uang diterima / dibayar + kembalian).
 * Pesanan tersimpan -> judul "TAGIHAN" + "BELUM DIBAYAR" (tanpa metode bayar).
 * Tidak ada hitungan harga baru: semua angka diambil apa adanya dari receiptModel.
 */

export const W = 380;               // lebar logis (px); gambar jadi W * SCALE piksel
export const SCALE = 2;
const M = 22, RIGHT = W - M, CW = RIGHT - M;
const INK = '#141a2b', GRAY = '#737a8f', ACCENT = '#e85a0d', GRID = '#b8bfcc', PAPER = '#ffffff';
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/** Teks aman digambar: spasi/baris baru jadi satu spasi, kosong tetap string. */
const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Pecah teks jadi baris-baris yang muat `max` (per kata; kata yang terlalu panjang dipotong per huruf). */
export function wrapText(text, size, max, measure, bold = false) {
  const lines = [];
  let cur = '';
  const push = () => { if (cur) lines.push(cur); cur = ''; };
  for (const word of clean(text).split(' ').filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (measure(next, size, bold) <= max) { cur = next; continue; }
    push();
    if (measure(word, size, bold) <= max) { cur = word; continue; }
    for (const ch of word) {
      if (measure(cur + ch, size, bold) > max) push();
      cur += ch;
    }
  }
  push();
  return lines.length ? lines : [''];
}

const tanggal = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export function layoutReceipt(r, { business = 'Mamam Ayam', formatRupiah = defaultRupiah, measure } = {}) {
  const belum = r?.status === 'belum';
  const ops = [];
  let y = 22;

  const T = (s, x, base, size, { bold = false, color = INK, align = 'left' } = {}) => {
    ops.push({ t: 'text', text: clean(s), x, y: base, size, bold, color, align });
  };
  const dash = () => { ops.push({ t: 'line', y, dashed: true, w: 1, color: GRID }); y += 12; };
  // Baris label (kiri, abu) + nilai (kanan); nilai panjang dibungkus ke baris berikutnya.
  const row = (label, value, { bold = false, size = 12, color = INK } = {}) => {
    const lw = measure(clean(label), size, false) + 12;
    const lines = wrapText(value, size, CW - lw, measure, bold);
    lines.forEach((ln, i) => {
      if (i === 0) T(label, M, y + size, size, { color: GRAY });
      T(ln, RIGHT, y + size, size, { bold, color, align: 'right' });
      y += size + 6;
    });
  };
  const rp = (v) => formatRupiah(v);

  // Kepala
  T(business.toUpperCase(), W / 2, y + 18, 19, { bold: true, align: 'center' }); y += 28;
  T(belum ? 'TAGIHAN' : 'STRUK PEMBELIAN', W / 2, y + 12, 12, { color: GRAY, align: 'center' }); y += 20;
  if (belum) { T('BELUM DIBAYAR', W / 2, y + 14, 14, { bold: true, color: ACCENT, align: 'center' }); y += 22; }
  y += 4; dash();

  // Info order
  row('No. Order', `#${r?.number || '-'}`, { bold: true });
  if (r?.when) row(belum ? 'Disimpan' : 'Tanggal', tanggal(r.when));
  row('Pelanggan', r?.customerName || 'Umum');
  if (r?.orderType) row('Tipe Order', r.orderType);
  if (!belum && r?.paymentMethod) {
    row('Pembayaran', r.paymentMethod === 'Ojol' && r.ojolPlatform ? `Ojol (${r.ojolPlatform})` : r.paymentMethod);
  }
  if (r?.ojolOrderNumber) row('No. Order Ojol', r.ojolOrderNumber);
  y += 3; dash();

  // Item
  for (const it of r?.items || []) {
    for (const ln of wrapText(it.name, 13, CW, measure, true)) { T(ln, M, y + 13, 13, { bold: true }); y += 17; }
    if (it.note) for (const ln of wrapText(it.note, 11, CW, measure)) { T(ln, M, y + 11, 11, { color: GRAY }); y += 15; }
    T(`${it.qty} x ${rp(it.price)}`, M, y + 12, 12, { color: GRAY });
    T(rp(it.qty * it.price), RIGHT, y + 12, 12, { bold: true, align: 'right' });
    y += 22;
  }
  dash();

  // Ringkasan
  const qty = (r?.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  row(`Subtotal (${qty} item)`, rp(r?.subtotal));
  if (r?.voucherDiscount > 0) row(r.voucherCode ? `Diskon (${r.voucherCode})` : 'Diskon Voucher', `-${rp(r.voucherDiscount)}`);
  if (r?.manualDiscountAmount > 0) row('Diskon Tambahan', `-${rp(r.manualDiscountAmount)}`);
  if (r?.orderType === 'Delivery' || r?.deliveryFee > 0) row('Ongkir', rp(r?.deliveryFee || 0));
  y += 3;
  ops.push({ t: 'line', y, dashed: false, w: 1.2, color: GRID });
  y += 9;
  T(belum ? 'TOTAL TAGIHAN' : 'TOTAL', M, y + 16, 16, { bold: true });
  T(rp(r?.total), RIGHT, y + 16, 16, { bold: true, color: ACCENT, align: 'right' });
  y += 30;

  // Pembayaran (hanya yang lunas): rincian split, uang yang dibayarkan, dan kembalian.
  // Kembalian ikut tampil walau Rp 0 (uang pas) selama datanya ada; kosong/null = transaksi lama tanpa data, dilewati.
  if (!belum) {
    const splits = r?.splits || [];
    splits.forEach((p, i) => row(`Split ${i + 1} - ${p.method}`, rp(p.amount)));
    const paid = r?.amountPaid != null;
    if (paid && (r?.paymentMethod === 'Tunai' || splits.length)) {
      row(splits.length ? 'Dibayar' : 'Uang diterima', rp(r.amountPaid));
      if (r.change != null) row('Kembalian', rp(r.change), { bold: true });
    }
  }

  y += 6; dash();
  T(belum ? 'Pesanan ini belum dibayar.' : 'Terima kasih sudah memesan!', W / 2, y + 12, 12, { color: GRAY, align: 'center' }); y += 20;
  T(business, W / 2, y + 11, 11, { color: GRAY, align: 'center' }); y += 28;

  return { width: W, height: Math.max(260, Math.ceil(y)), ops };
}

/** Gambar hasil layout ke canvas dan kembalikan Blob PNG. Hanya jalan di browser (butuh DOM canvas). */
export async function buildReceiptImage(r, { business, formatRupiah } = {}) {
  if (typeof document === 'undefined') throw new Error('Gambar struk hanya bisa dibuat di browser.');
  const canvas = document.createElement('canvas');
  let ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Perangkat ini tidak bisa membuat gambar.');

  const fontOf = (size, bold) => `${bold ? 700 : 400} ${size}px ${FONT}`;
  const measure = (text, size, bold = false) => { ctx.font = fontOf(size, bold); return ctx.measureText(text).width; };

  const { width, height, ops } = layoutReceipt(r, { business, formatRupiah, measure });

  canvas.width = Math.round(width * SCALE);
  canvas.height = Math.round(height * SCALE);
  ctx = canvas.getContext('2d');           // ukuran diubah = state canvas direset
  ctx.scale(SCALE, SCALE);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'alphabetic';

  for (const op of ops) {
    if (op.t === 'line') {
      ctx.strokeStyle = op.color; ctx.lineWidth = op.w;
      ctx.setLineDash(op.dashed ? [4, 4] : []);
      ctx.beginPath(); ctx.moveTo(M, op.y); ctx.lineTo(RIGHT, op.y); ctx.stroke();
    } else {
      ctx.font = fontOf(op.size, op.bold);
      ctx.fillStyle = op.color;
      ctx.textAlign = op.align;
      ctx.fillText(op.text, op.x, op.y);
    }
  }
  ctx.setLineDash([]);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Gagal membuat gambar struk.');
  return blob;
}
