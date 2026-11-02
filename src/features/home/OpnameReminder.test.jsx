import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('../../hook/useOpname', () => ({ useOpnameReminder: () => ({ phase: null, activate: async () => {} }) }));
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: () => true }) }));

import { ReminderBody, reminderCopy } from './OpnameReminder';

const clean = (html) => html.replace(/<!-- -->/g, '');

describe('OpnameReminder', () => {
  it('H-1: "Besok stok opname" dengan tombol Aktifkan dan Ingatkan lagi nanti', () => {
    const html = clean(renderToString(<ReminderBody phase="h1" onActivate={() => {}} onLater={() => {}} />));
    expect(html).toContain('Besok stok opname');
    expect(html).toContain('Jangan lupa besok stok opname');
    expect(html).toContain('Aktifkan stok opname');
    expect(html).toContain('Ingatkan lagi nanti');
  });
  it('hari H: "Hari ini stok opname"', () => {
    const html = clean(renderToString(<ReminderBody phase="h" onActivate={() => {}} onLater={() => {}} />));
    expect(html).toContain('Hari ini stok opname');
    expect(html).not.toContain('Besok');
    expect(html).toContain('>Nanti<');
  });
  it('menyalakan: tombol berubah dan dikunci supaya tidak terkirim dua kali', () => {
    const html = clean(renderToString(<ReminderBody phase="h" busy onActivate={() => {}} onLater={() => {}} />));
    expect(html).toContain('Menyalakan...');
    expect(html.match(/<button[^>]*disabled/g)).toHaveLength(2);
  });
  it('teks dua tahap berbeda', () => {
    expect(reminderCopy('h1').title).not.toBe(reminderCopy('h').title);
  });
});
