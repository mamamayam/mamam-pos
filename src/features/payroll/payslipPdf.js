import { fmtHM } from './payrollReport';
import { fmtTgl, fmtNum, fmtQty } from './additionDetail';
import { formatRupiah as defaultRupiah } from '../../utils/formatters';

/**
 * payslipPdf — pembuat PDF slip gaji TANPA library tambahan (PDF 1.4 tulis tangan, font bawaan Helvetica).
 * Teks asli (bisa dipilih/dicari), ukuran kecil, A4, otomatis pindah halaman. FUNGSI MURNI: mengembalikan
 * Uint8Array (dites).
 *
 * Susunan: judul, info karyawan 2 kolom, (opsional) tabel harian Tanggal & Jam | Keterangan | Pemasukan (+) |
 * Pengeluaran (-), lalu ringkasan Pendapatan -> Total Pendapatan -> Potongan -> Total Potongan -> GAJI BERSIH,
 * dan kolom tanda tangan. Angka diambil dari `report` (buildPayrollReport), sama dengan layar.
 *
 * Hanya karakter Latin-1 yang dicetak; karakter lain diganti yang mirip (→ jadi >) atau "?".
 */

const PAGE_W = 595, PAGE_H = 842, M = 40, RIGHT = PAGE_W - M, CW = RIGHT - M, LINE = 16, RH = 13.5;
const INK = [0.08, 0.1, 0.17], GRAY = [0.45, 0.48, 0.56], ACCENT = [0.91, 0.35, 0.05], RED = [0.82, 0.2, 0.29], GRID = [0.72, 0.75, 0.8], BAND = [0.92, 0.93, 0.95];

// Lebar karakter Helvetica (1000 unit/em) untuk ASCII 32..126. Tebal: HURUF dilebarkan ×1.06 (perkiraan);
// angka dan tanda baca sama dengan biasa (di Helvetica-Bold memang sama), jadi nominal tebal tetap rata kanan.
export const WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015,
  667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611,
  278, 278, 278, 469, 556, 333,
  556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500,
  334, 260, 334, 584,
];

export const clean = (s) => String(s ?? '')
  .replace(/\u00a0/g, ' ').replace(/→/g, '>').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[^\x20-\xff]/g, '?');

const charW = (c) => {
  const code = c.charCodeAt(0);
  if (code >= 32 && code <= 126) return WIDTHS[code - 32];
  if (code === 0xb7) return 278;
  if (code === 0xd7) return 584;
  return 556;
};
export const textWidth = (s, size, bold = false) =>
  [...clean(s)].reduce((w, c) => w + charW(c) * (bold && /[A-Za-z]/.test(c) ? 1.06 : 1), 0) * size / 1000;

const fit = (s, size, max, bold) => {
  let t = clean(s);
  if (textWidth(t, size, bold) <= max) return t;
  while (t.length > 1 && textWidth(`${t}...`, size, bold) > max) t = t.slice(0, -1);
  return `${t.trimEnd()}...`;
};

export const esc = (s) => clean(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
export const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => `${c.map(num).join(' ')} rg`;

const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

export function buildPayslipPdf({ business = 'Mamam Ayam', employeeName, role, periodLabel, rates, report, withDays = false, withAttachment = false, formatRupiah = defaultRupiah }) {
  const pages = [[]];
  let y = PAGE_H - M;   // tepi ATAS elemen berikutnya
  const page = () => pages[pages.length - 1];
  const newPage = () => { pages.push([]); y = PAGE_H - M; };
  const need = (h) => { if (y - h < M + 28) newPage(); };

  const T = (s, x, base, size, { bold = false, color = INK, align = 'left' } = {}) => {
    const t = clean(s);
    const w = textWidth(t, size, bold);
    const px = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
    page().push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${rgb(color)} ${num(px)} ${num(base)} Td (${esc(t)}) Tj ET`);
  };
  const stroke = (x1, y1, x2, y2, w = 0.5, c = GRID) => page().push(`${w} w ${c.map(num).join(' ')} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  const fill = (x, yb, w, h, c) => page().push(`${c.map(num).join(' ')} rg ${num(x)} ${num(yb)} ${num(w)} ${num(h)} re f`);
  const money = (n) => (n ? formatRupiah(n) : '-');

  // Judul
  T('SLIP GAJI KARYAWAN', PAGE_W / 2, y - 14, 15, { bold: true, align: 'center' }); y -= 20;
  T(business.toUpperCase(), PAGE_W / 2, y - 10, 10, { align: 'center' }); y -= 24;

  // Info karyawan: 2 kolom (kiri identitas & periode, kanan tarif)
  const rp = (n) => (n == null ? '-' : formatRupiah(n));
  const left = [
    ['Periode', periodLabel], ['Nama', employeeName], ['Posisi', role ? cap(role) : '-'],
    ['Hari Kerja Masuk', report.periodDays ? `${report.hadirDays}/${report.periodDays} Hari` : `${report.hadirDays} Hari`],
  ];
  const right = [
    ['Total Jam Kerja', `${(report.workedMinutes / 60).toFixed(1).replace('.', ',')} Jam`], ['Upah per Jam', rp(rates?.wagePerHour)],
    ['Lembur per 30 Menit', rp(report.overtimeRate)], ['Bonus Full Time', rp(rates?.bonusFullTime)],
  ];
  const colR = M + CW / 2 + 10;
  left.forEach((l, i) => {
    T(l[0], M, y - 10, 9.5, { color: GRAY }); T(fit(l[1], 9.5, colR - M - 92 - 8, true), M + 92, y - 10, 9.5, { bold: true });
    T(right[i][0], colR, y - 10, 9.5, { color: GRAY }); T(fit(right[i][1], 9.5, RIGHT - colR - 104, true), colR + 104, y - 10, 9.5, { bold: true });
    y -= 14.5;
  });
  y -= 8;

  // Tabel harian
  if (withDays) {
    need(60);
    T('Rincian Pemasukan & Pengeluaran Harian', M, y - 9, 10, { bold: true }); y -= 16;
    const X = [M, M + 100, M + 335, M + 425, RIGHT];
    const header = () => {
      fill(M, y - 16, CW, 16, BAND);
      T('Tanggal & Jam', X[0] + 4, y - 11.5, 8.5, { bold: true }); T('Keterangan', X[1] + 4, y - 11.5, 8.5, { bold: true });
      T('Pemasukan (+)', X[3] - 4, y - 11.5, 8.5, { bold: true, align: 'right' }); T('Pengeluaran (-)', X[4] - 4, y - 11.5, 8.5, { bold: true, align: 'right' });
      y -= 16;
    };
    header();
    for (const d of report.days) {
      const n = Math.max(d.lines.length, 2);   // minimal 2 baris: tanggal + jam
      const h = n * RH;
      if (y - h < M + 28) { newPage(); header(); }
      const top = y;
      for (let r = 0; r < n; r++) {
        const l = d.lines[r];
        const base = top - (r + 1) * RH + 4.2;
        if (r === 0) T(d.date, X[0] + 4, base, 8.5);
        if (r === 1) T(d.timeRange || (d.row ? '--:-- s/d --:--' : ''), X[0] + 4, base, 8, { color: GRAY });
        if (l) {
          T(fit(l.label, 8.5, X[2] - X[1] - 8, false), X[1] + 4, base, 8.5);
          T(money(l.plus), X[3] - 4, base, 8.5, { align: 'right', color: l.plus ? INK : GRAY });
          T(money(l.minus), X[4] - 4, base, 8.5, { align: 'right', color: l.minus ? INK : GRAY });
        }
        if (r < n - 1) stroke(X[1], top - (r + 1) * RH, X[4], top - (r + 1) * RH, 0.4);
      }
      stroke(M, top - h, RIGHT, top - h, 0.6);
      X.forEach((x) => stroke(x, top, x, top - h, 0.6));
      y -= h;
    }
    y -= 10;
  }

  // Ringkasan: Pendapatan -> Total Pendapatan -> Potongan -> Total Potongan -> Gaji Bersih
  const sRow = (label, value, { bold = false, color = INK, vcolor = color, size = 10, rule = false } = {}) => {
    need(LINE + (rule ? 6 : 0));
    if (rule) { stroke(M, y, RIGHT, y, 0.8, GRID); y -= 4; }
    T(fit(label, size, CW - 130, bold), M, y - 11, size, { bold, color });
    T(value, RIGHT, y - 11, size, { bold, color: vcolor, align: 'right' });
    y -= LINE;
  };
  const sec = (title) => { need(LINE * 2); y -= 4; T(title, M, y - 8, 8, { bold: true, color: GRAY }); y -= LINE - 3; };
  const incomeLabel = {
    upah: `Upah Dasar (${fmtHM(report.workedMinutes)})`, lembur: `Uang Lembur (${report.overtimeBlocks} blok)`, tambahan: 'Tambahan (+)',
  };

  sec('PENDAPATAN');
  report.income.filter((r, i) => r.amount !== 0 || i === 0).forEach((r) => sRow(incomeLabel[r.key] || r.label, formatRupiah(r.amount)));
  sRow('Total Pendapatan', formatRupiah(report.totalIncome), { bold: true, rule: true });

  sec('POTONGAN');
  const cuts = report.cuts.filter((r) => r.amount !== 0);
  if (cuts.length === 0) sRow('Tidak ada potongan', formatRupiah(0), { color: GRAY });
  cuts.forEach((r) => sRow(r.label, formatRupiah(-r.amount)));
  sRow('Total Potongan', formatRupiah(-report.totalDeductions), { bold: true, rule: true });

  y -= 6; need(40); stroke(M, y, RIGHT, y, 1.2, INK); y -= 6;
  sRow('GAJI BERSIH', formatRupiah(report.net), { bold: true, size: 13, vcolor: report.net < 0 ? RED : ACCENT });

  // Tanda tangan
  need(112); y -= 22;
  const cx = [M + CW * 0.25, M + CW * 0.75];
  T('Penerima,', cx[0], y - 9, 10, { align: 'center' }); T('Mengetahui,', cx[1], y - 9, 10, { align: 'center' });
  y -= 64;
  T(fit(`(${employeeName})`, 10, CW / 2 - 20, false), cx[0], y - 9, 10, { align: 'center' }); T('( HRD / Manajemen )', cx[1], y - 9, 10, { align: 'center' });
  y -= LINE;

  // Lampiran (opsional): rincian Ongkir dan Potong Ayam di halaman terpisah, setelah tanda tangan.
  const att = withAttachment ? report.attachments : null;
  if (att) {
    newPage();
    T('LAMPIRAN RINCIAN', M, y - 12, 13, { bold: true }); y -= 18;
    T(fit(`${employeeName} · ${periodLabel}`, 9.5, CW, false), M, y - 9, 9.5, { color: GRAY }); y -= 24;
    const section = (title, cols, rows, totalLabel, total) => {
      need(16 + 16 + RH * 2 + 20);
      T(title, M, y - 9, 9, { bold: true, color: GRAY }); y -= 16;
      const head = () => {
        fill(M, y - 16, CW, 16, BAND);
        cols.forEach((c) => T(c.head, c.x, y - 11.5, 8.5, { bold: true, align: c.align }));
        y -= 16;
      };
      head();
      for (const r of rows) {
        if (y - RH * 2 < M + 28) { newPage(); head(); }   // sisakan tempat untuk baris total
        cols.forEach((c) => T(fit(c.get(r), 8.5, c.w, false), c.x, y - RH + 4.2, 8.5, { align: c.align }));
        stroke(M, y - RH, RIGHT, y - RH, 0.3);
        y -= RH;
      }
      stroke(M, y, RIGHT, y, 0.8, GRAY);
      T(totalLabel, cols[1].x, y - RH + 4.2, 9, { bold: true });
      T(formatRupiah(total), RIGHT - 4, y - RH + 4.2, 9, { bold: true, align: 'right' });
      y -= RH + 18;
    };
    if (att.ongkir) {
      section('ONGKIR', [
        { head: 'Tanggal', x: M + 4, align: 'left', w: 52, get: (r) => fmtTgl(r.date) },
        { head: 'Customer', x: M + 64, align: 'left', w: CW - 64 - 110, get: (r) => r.customer },
        { head: 'Jumlah', x: RIGHT - 4, align: 'right', w: 100, get: (r) => formatRupiah(r.amount) },
      ], att.ongkir.rows, 'Total ongkir', att.ongkir.total);
    }
    if (att.potong) {
      section('POTONG AYAM', [
        { head: 'Tanggal', x: M + 4, align: 'left', w: 52, get: (r) => fmtTgl(r.date) },
        { head: 'Jenis', x: M + 64, align: 'left', w: CW - 64 - 190, get: (r) => r.name },
        { head: 'Jml × Harga', x: RIGHT - 84, align: 'right', w: 100, get: (r) => `${fmtQty(r.qty)} × ${fmtNum(r.price)}` },
        { head: 'Subtotal', x: RIGHT - 4, align: 'right', w: 70, get: (r) => fmtNum(r.subtotal) },
      ], att.potong.rows, 'Total', att.potong.total);
    }
  }

  // Kaki halaman (tahu total halaman setelah semua tersusun)
  pages.forEach((p, i) => {
    p.push(`BT /F1 8 Tf ${rgb(GRAY)} ${M} 28 Td (${esc(`Dibuat otomatis · ${business}`)}) Tj ET`);
    const pg = `Hal. ${i + 1}/${pages.length}`;
    p.push(`BT /F1 8 Tf ${rgb(GRAY)} ${num(RIGHT - textWidth(pg, 8))} 28 Td (${esc(pg)}) Tj ET`);
  });

  // Susun berkas PDF (1 karakter = 1 byte, jadi offset xref = panjang string)
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add(`<< /Type /Pages /Kids [${pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((p, i) => {
    const content = p.join('\n');
    add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });

  let out = '%PDF-1.4\n';
  const offsets = objs.map((body, i) => { const at = out.length; out += `${i + 1} 0 obj\n${body}\nendobj\n`; return at; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}
