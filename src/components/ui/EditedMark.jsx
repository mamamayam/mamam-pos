import { PenLine } from 'lucide-react';

/**
 * EditedMark — penanda "sudah diedit" berupa ikon kecil yang samar (bukan teks/badge berwarna).
 * Tanpa teks tampil; `label` jadi aria-label dan tooltip (title). Dipakai Catatan Hari Ini (Beranda)
 * dan kartu pengajuan di Persetujuan. Jangan diberi warna mencolok: ini keterangan sampingan.
 *
 *   size  'md' (bawaan) | 'sm' (di dalam teks kecil)
 *   label 'Diedit' | 'Diedit owner'
 */
const SIZES = { md: ['w-5 h-5', 'w-3 h-3'], sm: ['w-4 h-4', 'w-2.5 h-2.5'] };

export default function EditedMark({ label = 'Diedit', size = 'md', className = '', ...rest }) {
  const [box, icon] = SIZES[size] || SIZES.md;
  return (
    <span role="img" aria-label={label} title={label}
      className={`inline-flex items-center justify-center shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ${box} ${className}`} {...rest}>
      <PenLine className={icon} aria-hidden="true" />
    </span>
  );
}
