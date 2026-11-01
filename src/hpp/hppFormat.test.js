import { describe, it, expect } from 'vitest';
import { angka, labelSatuan, parseAngka, persen, ringkasUbahBahan, rupiah, rupiahUnit, tanggal } from './hppFormat';

describe('format', () => {
  it('rupiah', () => {
    expect(rupiah(13622)).toBe('Rp13.622');
    expect(rupiah(1462.4)).toBe('Rp1.462');
    expect(rupiah(-537)).toBe('-Rp537');
    expect(rupiah(null)).toBe('-');
  });
  it('angka dan persen', () => {
    expect(angka(1410.5)).toBe('1.410,5');
    expect(angka(80)).toBe('80');
    expect(persen(29.24)).toBe('29,2%');
    expect(persen(30, 0)).toBe('30%');
  });
  it('tanggal: tahun disembunyikan jika sama dengan tahun berjalan', () => {
    const now = new Date('2026-10-14T00:00:00Z');
    expect(tanggal('2026-10-05T10:00:00Z', now)).toBe('5 Okt');
    expect(tanggal('2025-12-31T12:00:00Z', now)).toBe('31 Des 2025');
    expect(tanggal('bukan tanggal', now)).toBe('-');
  });
  it('parseAngka menerima 45000, 45.000, 45,5; menolak kosong, negatif, huruf', () => {
    expect(parseAngka('45000')).toBe(45000);
    expect(parseAngka('45.000')).toBe(45000);
    expect(parseAngka('1.250.000')).toBe(1250000);
    expect(parseAngka('45,5')).toBe(45.5);
    expect(parseAngka(' 12 000 ')).toBe(12000);
    expect(parseAngka('')).toBeNull();
    expect(parseAngka('-5')).toBeNull();
    expect(parseAngka('abc')).toBeNull();
  });
});

describe('label satuan dan ringkasan ubah bahan', () => {
  it('labelSatuan: satuan + isi, atau unitnya saja bila satuan = unit dan isi 1', () => {
    expect(labelSatuan({ satuan: 'kg', isi: 1000, unit: 'gr' })).toBe('kg (1.000 gr)');
    expect(labelSatuan({ satuan: 'pack', isi: 1, unit: 'pack' })).toBe('pack');
    expect(labelSatuan({ satuan: 'pack', isi: 50, unit: 'pcs' })).toBe('pack (50 pcs)');
  });
  it('rupiahUnit: harga per unit dasar yang kecil tetap punya desimal; mulai Rp100 dibulatkan', () => {
    expect(rupiahUnit(1)).toBe('Rp1');
    expect(rupiahUnit(1.5)).toBe('Rp1,5');
    expect(rupiahUnit(0.04)).toBe('Rp0,04');
    expect(rupiahUnit(38.46)).toBe('Rp38,5');
    expect(rupiahUnit(1250.4)).toBe('Rp1.250');
    expect(rupiahUnit(null)).toBe('-');
  });
  it('ringkasUbahBahan: per unit dasar; bahan tanpa harga = harga baru', () => {
    const b = { nama: 'Ayam', harga: 38000, isi: 1000, unit: 'gr' };
    expect(ringkasUbahBahan(b, 40000, 1000)).toBe('Ayam: Rp38 → Rp40/gr');
    expect(ringkasUbahBahan({ ...b, harga: 1000 }, 1500, 1000)).toBe('Ayam: Rp1 → Rp1,5/gr');
    expect(ringkasUbahBahan({ ...b, harga: null }, 40000, 1000)).toBe('Ayam: harga Rp40/gr');
  });
});
