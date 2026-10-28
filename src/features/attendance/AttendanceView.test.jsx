import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';

// Hook dipalsukan; yang diuji: penanda "diedit owner" di kartu Absensi berupa ikon samar, bukan teks biru.
const board = { rows: [] };
vi.mock('../../hook/useAttendanceDay', () => ({ useAttendanceDay: () => ({ loading: false, error: null, board, info: null, updatedAt: new Date(2026, 9, 27, 5, 33), reload: () => {}, overrideKeys: [] }) }));
const auth = { owner: true };
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ can: () => auth.owner }) }));
vi.mock('../stock/BypassPanel', () => ({ default: () => <div data-testid="bypass-panel" /> }));
vi.mock('./AttendanceEditSheet', () => ({ default: () => null }));

import AttendanceView from './AttendanceView';

const row = (name, over = {}) => ({ employee: { id: name, name, role: 'kasir' }, status: 'sudahPulang', masuk: '08:44', pulang: '19:48', bolongs: [], workedMinutes: 600, overtimeMinutes: 48, ...over });
const render = () => renderToString(<AttendanceView />).replace(/<!-- -->/g, '');

describe('Absensi — penanda diedit owner', () => {
  it('yang diedit: ikon samar berlabel; teks "diedit owner" biru sudah tidak ada', () => {
    board.rows = [row('Nurlaila', { edited: true }), row('Shafiya')];
    const html = render();
    expect(html).toContain('data-testid="diedit-Nurlaila"');
    expect(html).toContain('aria-label="Diedit owner"');
    expect(html).not.toContain('data-testid="diedit-Shafiya"');
    expect(html).not.toMatch(/>\s*diedit owner\s*</);
    expect(html).not.toContain('text-sky-');
  });
});

describe('Absensi — tab Bypass (owner)', () => {
  it('owner: pill tab Absensi dan Bypass, tab Absensi terbuka lebih dulu', () => {
    auth.owner = true; board.rows = [row('Nurlaila')];
    const html = render();
    expect(html).toContain('>Absensi<');
    expect(html).toContain('>Bypass<');
    expect(html).toContain('data-testid="att-Nurlaila"');
    expect(html).not.toContain('data-testid="bypass-panel"');
  });
  it('staf: tanpa pill tab, papan absensi saja', () => {
    auth.owner = false; board.rows = [row('Nurlaila')];
    const html = render();
    expect(html).not.toContain('>Bypass<');
    expect(html).toContain('data-testid="att-Nurlaila"');
    auth.owner = true;
  });
});
