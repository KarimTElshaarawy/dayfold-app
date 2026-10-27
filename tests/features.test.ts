import { describe, expect, it } from 'vitest';
import { accentVars, ACCENT_PRESETS, contrast, hexToRgb } from '../src/lib/accent';
import { parseCommitmentsCsv, parseCommitmentsIcs, parseDays, parseTopicsCsv } from '../src/device/importers';
import { buildSessionReminders, MAX_SESSION_REMINDERS, SESSION_ID_BASE } from '../src/device/reminders';
import { memoryStore } from '../src/device/storage';
import { makeDevice, NOW } from './helpers';

describe('session reminders', () => {
  it('schedules a notification shortly before each coming study session, soonest first', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    const list = buildSessionReminders(d.svc, NOW, 5);
    expect(list.length).toBeGreaterThan(3);
    expect(list.length).toBeLessThanOrEqual(MAX_SESSION_REMINDERS);
    expect(list.every((r) => r.at > NOW)).toBe(true);
    expect([...list].sort((a, b) => a.at - b.at)).toEqual(list);
    expect(list[0]!.id).toBe(SESSION_ID_BASE);
    expect(list[0]!.title).toMatch(/starts in 5 min$/);
    expect(list[0]!.body).toMatch(/\d+ min\./);
    // the first session today is the 13:45 one at the fixed test clock (10:00 local): reminder at 13:40 Dubai
    const today = (await d.req('GET', '/api/plan/2026-10-26')).json.blocks.filter((b: { kind: string; status: string; start: number }) => (b.kind === 'study' || b.kind === 'review') && b.status === 'planned' && b.start > 10 * 60 + 5);
    expect(list[0]!.at).toBe(Date.UTC(2026, 9, 26, 0, 0) + (today[0].start - 5 - 240) * 60_000);
  });

  it('uses "starts now" at lead 0 and skips sessions that are done', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    const before = buildSessionReminders(d.svc, NOW, 0);
    expect(before[0]!.title).toMatch(/starts now$/);
    const day = (await d.req('GET', '/api/plan/2026-10-26')).json;
    const first = day.blocks.find((b: { kind: string; status: string; start: number }) => b.kind === 'study' && b.status === 'planned' && b.start > 10 * 60 + 5);
    await d.req('PATCH', `/api/blocks/${encodeURIComponent(first.id)}`, { done: true });
    const after = buildSessionReminders(d.svc, NOW, 0);
    expect(after.length).toBe(before.length - 1);
  });

  it('is empty for an empty planner and respects the limit', async () => {
    const d = await makeDevice();
    expect(buildSessionReminders(d.svc, NOW, 5)).toEqual([]);
    await d.req('POST', '/api/seed/demo');
    expect(buildSessionReminders(d.svc, NOW, 5, 2)).toHaveLength(2);
  });

  it('keeps morning plus session reminders under the iOS limit of 64 pending notifications', () => {
    expect(14 + MAX_SESSION_REMINDERS).toBeLessThan(64);
  });
});

describe('preferences', () => {
  it('stores, validates and persists reminder and accent preferences, including through a backup', async () => {
    const store = memoryStore();
    const d = await makeDevice(store);
    expect((await d.req('GET', '/api/bootstrap')).json.prefs).toEqual({ sessionReminders: true, sessionLeadMin: 5, accent: '#e5322d' });
    expect((await d.req('PUT', '/api/prefs', { sessionLeadMin: 10, accent: '#2F7DF6', sessionReminders: false })).json).toEqual({ sessionReminders: false, sessionLeadMin: 10, accent: '#2f7df6' });
    expect((await d.req('PUT', '/api/prefs', { sessionLeadMin: 7 })).status).toBe(400);
    expect((await d.req('PUT', '/api/prefs', { accent: 'red' })).status).toBe(400);
    await d.repo.flush();
    const again = await makeDevice(store);
    expect((await again.req('GET', '/api/bootstrap')).json.prefs.accent).toBe('#2f7df6');
    const backup = (await again.req('GET', '/api/backup')).json.data as string;
    const other = await makeDevice(memoryStore());
    await other.req('POST', '/api/backup/restore', { data: backup });
    expect((await other.req('GET', '/api/bootstrap')).json.prefs.sessionLeadMin).toBe(10);
  });

  it('accepts older documents without prefs', async () => {
    const d = await makeDevice(memoryStore('{"v":1}'));
    expect((await d.req('GET', '/api/bootstrap')).json.prefs.sessionReminders).toBe(true);
  });
});

describe('commitments import', () => {
  it('reads days in many spellings', () => {
    expect(parseDays('Mon;Wed')).toEqual([1, 3]);
    expect(parseDays('1 3 5')).toEqual([1, 3, 5]);
    expect(parseDays('Mon-Fri')).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays('weekdays')).toEqual([1, 2, 3, 4, 5]);
    expect(parseDays('daily')).toHaveLength(7);
    expect(parseDays('Fri-Mon')).toEqual([1, 5, 6, 7]);
    expect(parseDays('someday')).toBeNull();
    expect(parseDays('')).toBeNull();
  });

  it('parses a CSV with a header, guesses the kind, and reports bad rows', () => {
    const csv = 'label,days,start,end\nOS Lecture,Mon;Wed,10:30,12:00\nNight shift at the cafe,Fri,6pm,11:30pm\nGym,Tue,17:30,18:30\nBroken,Someday,10:00,11:00';
    const r = parseCommitmentsCsv(csv);
    expect(r.items.map((i) => [i.label, i.kind, i.days, i.start, i.end])).toEqual([
      ['OS Lecture', 'class', [1, 3], '10:30', '12:00'],
      ['Night shift at the cafe', 'work', [5], '18:00', '23:30'],
      ['Gym', 'training', [2], '17:30', '18:30'],
    ]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('Row 5');
  });

  it('parses a CSV without a header', () => {
    const r = parseCommitmentsCsv('Lectures,class,Mon;Wed,10:30,12:00');
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.days).toEqual([1, 3]);
  });

  it('turns weekly calendar events into commitments and skips one-off events', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'SUMMARY:CSC230 Lecture', 'DTSTART;TZID=Asia/Dubai:20261026T103000', 'DTEND;TZID=Asia/Dubai:20261026T120000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Dentist', 'DTSTART:20261028T060000Z', 'DTEND:20261028T070000Z', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const r = parseCommitmentsIcs(ics, 'Asia/Dubai');
    expect(r.items).toEqual([{ label: 'CSC230 Lecture', kind: 'class', days: [1, 3], start: '10:30', end: '12:00' }]);
    expect(r.errors[0]).toContain('1 event was skipped');
  });

  it('imports through the API once, validates rows, and does not duplicate', async () => {
    const d = await makeDevice();
    const p = (await d.req('POST', '/api/import/commitments/preview', { kind: 'csv', text: 'Lectures,class,Mon;Wed,10:30,12:00' })).json;
    expect((await d.req('POST', '/api/import/commitments/commit', { items: p.items })).json.created).toBe(1);
    expect((await d.req('POST', '/api/import/commitments/commit', { items: p.items })).json.created).toBe(0);
    expect((await d.req('GET', '/api/bootstrap')).json.commitments).toHaveLength(1);
    expect((await d.req('POST', '/api/import/commitments/commit', { items: [{ label: 'x', kind: 'class', days: [9], start: '10:00', end: '11:00' }] })).status).toBe(400);
  });

  it('plans around imported commitments', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    await d.req('POST', '/api/import/commitments/commit', { items: [{ label: 'Lab', kind: 'class', days: [1], start: '14:00', end: '17:00' }] });
    const day = (await d.req('GET', '/api/plan/2026-11-02')).json;
    for (const b of day.blocks.filter((x: { kind: string }) => x.kind === 'study')) expect(b.end <= 14 * 60 || b.start >= 17 * 60).toBe(true);
  });
});

describe('topics import', () => {
  it('parses topics with or without a header', () => {
    expect(parseTopicsCsv('course,topic\ncsc230,Linked lists\nMTH210,"Eigenvalues, vectors"').items).toEqual([
      { course: 'CSC230', name: '', topic: 'Linked lists' },
      { course: 'MTH210', name: '', topic: 'Eigenvalues, vectors' },
    ]);
    expect(parseTopicsCsv('CSC230,Trees\nbad').errors).toHaveLength(1);
    const full = parseTopicsCsv('course,name,topic\nCSC230,Data Structures,Trees\nPHY150,Mechanics,');
    expect(full.errors).toEqual([]);
    expect(full.items.map((i) => [i.course, i.name, i.topic])).toEqual([['CSC230', 'Data Structures', 'Trees'], ['PHY150', 'Mechanics', '']]);
  });

  it('adds topics, creates unknown courses, skips duplicates and can replace the placeholders', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    const items = [{ course: 'CSC230', topic: 'Linked lists' }, { course: 'CSC230', topic: 'linked lists' }, { course: 'NEW100', topic: 'Basics' }];
    expect((await d.req('POST', '/api/import/topics/commit', { items, replacePlaceholders: true })).json.created).toBe(3);
    const boot = (await d.req('GET', '/api/bootstrap')).json;
    const csc = boot.courses.find((c: { code: string }) => c.code === 'CSC230');
    expect(boot.topics.filter((t: { courseId: string }) => t.courseId === csc.id).map((t: { title: string }) => t.title)).toEqual(['Linked lists']);
    expect(boot.courses.some((c: { code: string }) => c.code === 'NEW100')).toBe(true);
    // a second import of the same rows adds nothing
    expect((await d.req('POST', '/api/import/topics/commit', { items, replacePlaceholders: false })).json.created).toBe(0);
  });

  it('imports a course with its name and no topics, and names an unnamed course', async () => {
    const d = await makeDevice();
    const r = await d.req('POST', '/api/import/topics/commit', { items: [{ course: 'PHY150', name: 'Mechanics', topic: '' }, { course: 'PHY150', name: 'Mechanics', topic: 'Kinematics' }] });
    expect(r.json.created).toBe(2);
    const boot = (await d.req('GET', '/api/bootstrap')).json;
    expect(boot.courses.find((c: { code: string }) => c.code === 'PHY150').name).toBe('Mechanics');
    expect((await d.req('POST', '/api/import/topics/commit', { items: [{ course: 'PHY150', name: '', topic: '' }] })).status).toBe(400);
  });

  it('keeps the placeholders unless asked to replace them', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    await d.req('POST', '/api/import/topics/commit', { items: [{ course: 'MTH210', topic: 'Eigenvalues' }], replacePlaceholders: false });
    const boot = (await d.req('GET', '/api/bootstrap')).json;
    const mth = boot.courses.find((c: { code: string }) => c.code === 'MTH210');
    expect(boot.topics.filter((t: { courseId: string }) => t.courseId === mth.id)).toHaveLength(6);
  });
});

describe('review fixes', () => {
  it('reads a headerless three column topics file as course, name, topic', () => {
    const r = parseTopicsCsv('CSC230,Data Structures,Linked lists\nCSC230,Data Structures,Trees');
    expect(r.items.map((i) => [i.name, i.topic])).toEqual([['Data Structures', 'Linked lists'], ['Data Structures', 'Trees']]);
    expect(parseTopicsCsv('CSC230,Trees').items[0]).toEqual({ course: 'CSC230', name: '', topic: 'Trees' });
  });

  it('rejects commitments that end at or before they start', async () => {
    const r = parseCommitmentsCsv('label,kind,days,start,end\nShift,work,Tue,2pm,6\nGym,training,Mon,17:30,17:30\nOk,class,Wed,10:00,11:00');
    expect(r.items.map((i) => i.label)).toEqual(['Ok']);
    expect(r.errors).toHaveLength(2);
    const d = await makeDevice();
    expect((await d.req('POST', '/api/import/commitments/commit', { items: [{ label: 'X', kind: 'work', days: [2], start: '14:00', end: '06:00' }] })).status).toBe(400);
  });

  it('moves the weekdays with a UTC start time that lands on another local day', () => {
    const ics = 'BEGIN:VEVENT\nSUMMARY:Evening class\nDTSTART:20260106T040000Z\nDTEND:20260106T060000Z\nRRULE:FREQ=WEEKLY;BYDAY=TU\nEND:VEVENT';
    const r = parseCommitmentsIcs(ics, 'America/Los_Angeles');
    expect(r.items).toEqual([expect.objectContaining({ days: [1], start: '20:00', end: '22:00' })]);
  });

  it('reads quoted and unknown TZIDs and DURATION, and skips ended or biweekly rules with their own reason', () => {
    const ev = (extra: string): string => `BEGIN:VEVENT\nSUMMARY:Lab\n${extra}\nEND:VEVENT`;
    const quoted = parseCommitmentsIcs(ev('DTSTART;TZID="Europe/London":20260105T100000\nDURATION:PT1H30M\nRRULE:FREQ=WEEKLY;BYDAY=MO'), 'Europe/London');
    expect(quoted.items).toEqual([expect.objectContaining({ days: [1], start: '10:00', end: '11:30' })]);
    const outlook = parseCommitmentsIcs(ev('DTSTART;TZID=Eastern Standard Time:20260105T100000\nDTEND;TZID=Eastern Standard Time:20260105T110000\nRRULE:FREQ=WEEKLY;BYDAY=MO'), 'Asia/Dubai');
    expect(outlook.items).toHaveLength(1);
    const skipped = parseCommitmentsIcs([ev('DTSTART:20240101T100000Z\nDTEND:20240101T110000Z\nRRULE:FREQ=WEEKLY;UNTIL=20240501T000000Z'), ev('DTSTART:20260105T100000Z\nDTEND:20260105T110000Z\nRRULE:FREQ=WEEKLY;INTERVAL=2')].join('\n'), 'UTC');
    expect(skipped.items).toEqual([]);
    expect(skipped.errors.join(' ')).toMatch(/already ended/);
    expect(skipped.errors.join(' ')).toMatch(/every few weeks/);
  });

  it('keeps accent text readable on the accent tint in both themes, for every preset and awkward colors', () => {
    const blend = (surface: string, hex: string, a: number): string => {
      const s = hexToRgb(surface);
      const c = hexToRgb(hex);
      return `#${[0, 1, 2].map((i) => Math.round((s[i] as number) + ((c[i] as number) - (s[i] as number)) * a).toString(16).padStart(2, '0')).join('')}`;
    };
    for (const hex of [...ACCENT_PRESETS.map((p) => p.hex), '#ffff00', '#00ff00']) {
      const light = accentVars(hex, false);
      for (const surface of ['#ffffff', '#f5f5f7', '#f0f0f3']) {
        expect(contrast(light['--accent-ink'], blend(surface, hex, 0.1))).toBeGreaterThanOrEqual(4.5);
        expect(contrast(light['--accent-ink'], surface)).toBeGreaterThanOrEqual(4.5);
      }
      const dark = accentVars(hex, true);
      for (const surface of ['#1c1c1e', '#2c2c2e']) expect(contrast(dark['--accent-ink'], blend(surface, hex, 0.18))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('says so in the preview when a file has more rows than one import takes', async () => {
    const d = await makeDevice();
    const text = `course,topic\n${Array.from({ length: 520 }, (_, i) => `C${i % 5},T${i}`).join('\n')}`;
    const r = (await d.req('POST', '/api/import/topics/preview', { text })).json;
    expect(r.items).toHaveLength(500);
    expect(r.errors.join(' ')).toMatch(/first 500/);
  });
});

describe('accent colors', () => {
  const check = (hex: string, dark: boolean): void => {
    const v = accentVars(hex, dark);
    expect(contrast(v['--accent-strong'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
    if (!dark) {
      expect(contrast(v['--accent-ink'], '#ffffff')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v['--accent-ink'], '#f5f5f7')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v['--accent'], '#ffffff')).toBeGreaterThanOrEqual(3);
    } else {
      expect(contrast(v['--accent-ink'], '#1c1c1e')).toBeGreaterThanOrEqual(4.5);
      expect(contrast(v['--accent'], '#1c1c1e')).toBeGreaterThanOrEqual(4.5);
    }
  };
  it('keeps every preset readable in light and dark', () => {
    for (const p of ACCENT_PRESETS) {
      check(p.hex, false);
      check(p.hex, true);
    }
  });
  it('repairs awkward custom colors (very light, very dark, pure yellow)', () => {
    for (const hex of ['#ffff00', '#ffffff', '#000000', '#fefefe', '#101010', '#00ffff']) {
      check(hex, false);
      check(hex, true);
    }
  });
  it('keeps the default red unchanged where it already passes', () => {
    expect(accentVars('#e5322d', false)['--accent']).toBe('#e5322d');
    expect(hexToRgb('#e5322d')).toEqual([229, 50, 45]);
  });
});
