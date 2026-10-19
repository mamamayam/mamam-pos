import { textWidth, clean, esc, num } from '../payroll/payslipPdf';
import { formatRupiah as defaultRupiah } from '../../utils/formatters';

/**
 * receiptPdf — struk / tagihan PDF satu halaman, lebar kertas struk (±80 mm), TANPA library tambahan
 * (PDF 1.4 tulis tangan, font bawaan Helvetica; mesin lebar huruf dipakai bersama dengan slip gaji).
 * Tinggi halaman mengikuti isi. FUNGSI MURNI: menerima bentuk dari receiptModel.js, mengembalikan Uint8Array (dites).
 *
 * Transaksi lunas  -> judul "STRUK PEMBELIAN" + rincian pembayaran.
 * Pesanan tersimpan -> judul "TAGIHAN" + "BELUM DIBAYAR" (tanpa metode bayar).
 */

const W = 226, M = 14, RIGHT = W - M, CW = RIGHT - M;
const INK = [0.08, 0.1, 0.17], GRAY = [0.45, 0.48, 0.56], ACCENT = [0.91, 0.35, 0.05], GRID = [0.72, 0.75, 0.8];
const rgb = (c) => c.map(num).join(' ');

/** Pecah teks jadi baris-baris yang muat `max` (per kata; kata yang terlalu panjang dipotong per huruf). */
export function wrapText(text, size, max, bold = false) {
  const lines = [];
  let cur = '';
  const push = () => { if (cur) lines.push(cur); cur = ''; };
  for (const word of clean(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, size, bold) <= max) { cur = next; continue; }
    push();
    if (textWidth(word, size, bold) <= max) { cur = word; continue; }
    for (const ch of word) {
      if (textWidth(cur + ch, size, bold) > max) push();
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

export function buildReceiptPdf(r, { business = 'Mamam Ayam', formatRupiah = defaultRupiah } = {}) {
  const belum = r?.status === 'belum';
  const ops = [];            // tiap op = fungsi (tinggi halaman) => perintah PDF; y dihitung dari ATAS
  let y = 16;
  const at = (top, H) => H - top;

  const T = (s, x, base, size, { bold = false, color = INK, align = 'left' } = {}) => {
    const t = clean(s);
    const w = textWidth(t, size, bold);
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    ops.push((H) => `BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} rg ${num(px)} ${num(at(base, H))} Td (${esc(t)}) Tj ET`);
  };
  const dash = () => {
    const top = y;
    ops.push((H) => `0.5 w ${rgb(GRID)} RG [2 2] 0 d ${M} ${num(at(top, H))} m ${RIGHT} ${num(at(top, H))} l S [] 0 d`);
    y += 8;
  };
  // Baris label (kiri, abu) + nilai (kanan); nilai panjang dibungkus ke baris berikutnya.
  const row = (label, value, { bold = false, size = 8.5, color = INK } = {}) => {
    const lw = textWidth(label, size) + 8;
    const lines = wrapText(value, size, CW - lw, bold);
    lines.forEach((ln, i) => {
      if (i === 0) T(label, M, y + size, size, { color: GRAY });
      T(ln, RIGHT, y + size, size, { bold, color, align: 'right' });
      y += size + 4;
    });
  };
  const rp = (v) => formatRupiah(v);

  // Kepala
  T(business.toUpperCase(), W / 2, y + 13, 13, { bold: true, align: 'center' }); y += 19;
  T(belum ? 'TAGIHAN' : 'STRUK PEMBELIAN', W / 2, y + 8.5, 8.5, { color: GRAY, align: 'center' }); y += 13;
  if (belum) { T('BELUM DIBAYAR', W / 2, y + 10, 10, { bold: true, color: ACCENT, align: 'center' }); y += 15; }
  y += 3; dash();

  // Info order
  row('No. Order', `#${r?.number || '-'}`, { bold: true });
  if (r?.when) row(belum ? 'Disimpan' : 'Tanggal', tanggal(r.when));
  row('Pelanggan', r?.customerName || 'Umum');
  if (r?.orderType) row('Tipe Order', r.orderType);
  if (!belum && r?.paymentMethod) {
    row('Pembayaran', r.paymentMethod === 'Ojol' && r.ojolPlatform ? `Ojol (${r.ojolPlatform})` : r.paymentMethod);
  }
  if (r?.ojolOrderNumber) row('No. Order Ojol', r.ojolOrderNumber);
  y += 2; dash();

  // Item
  for (const it of r?.items || []) {
    for (const ln of wrapText(it.name, 9, CW, true)) { T(ln, M, y + 9, 9, { bold: true }); y += 12; }
    if (it.note) for (const ln of wrapText(it.note, 7.5, CW)) { T(ln, M, y + 7.5, 7.5, { color: GRAY }); y += 10; }
    T(`${it.qty} x ${rp(it.price)}`, M, y + 8.5, 8.5, { color: GRAY });
    T(rp(it.qty * it.price), RIGHT, y + 8.5, 8.5, { bold: true, align: 'right' });
    y += 15;
  }
  dash();

  // Ringkasan
  const qty = (r?.items || []).reduce((s, i) => s + (Number(i.qty) || 0), 0);
  row(`Subtotal (${qty} item)`, rp(r?.subtotal));
  if (r?.voucherDiscount > 0) row(r.voucherCode ? `Diskon (${r.voucherCode})` : 'Diskon Voucher', `-${rp(r.voucherDiscount)}`);
  if (r?.manualDiscountAmount > 0) row('Diskon Tambahan', `-${rp(r.manualDiscountAmount)}`);
  if (r?.orderType === 'Delivery' || r?.deliveryFee > 0) row('Ongkir', rp(r?.deliveryFee || 0));
  y += 2;
  const top = y;
  ops.push((H) => `${rgb(GRID)} RG 0.8 w ${M} ${num(at(top, H))} m ${RIGHT} ${num(at(top, H))} l S`);
  y += 6;
  T(belum ? 'TOTAL TAGIHAN' : 'TOTAL', M, y + 11, 11, { bold: true });
  T(rp(r?.total), RIGHT, y + 11, 11, { bold: true, color: ACCENT, align: 'right' });
  y += 20;

  // Pembayaran (hanya yang lunas)
  if (!belum) {
    const splits = r?.splits || [];
    splits.forEach((p, i) => row(`Split ${i + 1} - ${p.method}`, rp(p.amount)));
    if (r?.paymentMethod === 'Tunai' && r.amountPaid != null) {
      row('Uang diterima', rp(r.amountPaid));
      if (r.change > 0) row('Kembalian', rp(r.change));
    } else if (splits.length && r?.amountPaid != null) {
      row('Dibayar', rp(r.amountPaid));
      if (r.change > 0) row('Kembalian', rp(r.change));
    }
  }

  y += 4; dash();
  T(belum ? 'Pesanan ini belum dibayar.' : 'Terima kasih sudah memesan!', W / 2, y + 8.5, 8.5, { color: GRAY, align: 'center' }); y += 14;
  T(business, W / 2, y + 7.5, 7.5, { color: GRAY, align: 'center' }); y += 16;

  const H = Math.max(200, Math.ceil(y));
  const content = ops.map((f) => f(H)).join('\n');

  // Susun berkas PDF (1 karakter = 1 byte, jadi offset xref = panjang string)
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [5 0 R] /Count 1 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents 6 0 R >>`,
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => { const p = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return p; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
