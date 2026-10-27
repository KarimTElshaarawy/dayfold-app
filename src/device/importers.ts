import { DateTime } from 'luxon';
import { EXAM_DEFAULTS } from '@shared/defaults';
import type { ExamKind } from '@shared/types';

export interface ExamDraft {
  course: string;
  title: string;
  kind: ExamKind;
  date: string;
  time: string;
  durationMin: number;
  weight: number;
  confidence: number;
}

const KIND_WORDS: Array<[RegExp, ExamKind]> = [
  [/\b(final)\b/i, 'final'],
  [/\b(midterm|mid-term|test|exam)\b/i, 'midterm'],
  [/\b(quiz)\b/i, 'quiz'],
  [/\b(lab|report|assignment|homework|project|deadline|due|essay|paper)\b/i, 'deadline'],
];

export const guessKind = (text: string): ExamKind => KIND_WORDS.find(([re]) => re.test(text))?.[1] ?? 'midterm';

export const guessCourse = (text: string): string => /^\s*([A-Za-z]{2,6}\s?\d{2,4}[A-Za-z]?)/.exec(text)?.[1]?.replace(/\s+/g, '').toUpperCase() ?? '';

const draft = (p: { course: string; title: string; kind: ExamKind; date: string; time: string; durationMin?: number; weight?: number; confidence?: number }): ExamDraft => ({
  course: p.course,
  title: p.title,
  kind: p.kind,
  date: p.date,
  time: p.time,
  durationMin: p.durationMin ?? EXAM_DEFAULTS[p.kind].durationMin,
  weight: p.weight ?? EXAM_DEFAULTS[p.kind].weight,
  confidence: p.confidence ?? 3,
});

export const parseCsvRows = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i] as string;
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
};

const normTime = (v: string): string | null => {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(v.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

const normDate = (v: string): string | null => {
  const t = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t) && DateTime.fromISO(t).isValid) return t;
  const d = DateTime.fromFormat(t, 'd/M/yyyy');
  if (d.isValid) return d.toISODate();
  const d2 = DateTime.fromFormat(t, 'd LLL yyyy');
  return d2.isValid ? d2.toISODate() : null;
};

export interface ParseResult {
  items: ExamDraft[];
  errors: string[];
}

export const parseCsv = (text: string): ParseResult => {
  const rows = parseCsvRows(text);
  const header = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (...names: string[]): number => header.findIndex((h) => names.includes(h));
  const iCourse = col('course', 'code', 'course code');
  const iTitle = col('title', 'name', 'exam', 'summary');
  const iDate = col('date');
  const iTime = col('time', 'start');
  const iKind = col('kind', 'type');
  const iDur = col('duration', 'durationmin', 'duration_min');
  const iWeight = col('weight', 'stakes');
  const iConf = col('confidence');
  const items: ExamDraft[] = [];
  const errors: string[] = [];
  if (iDate < 0 || (iTitle < 0 && iCourse < 0)) return { items, errors: ['CSV needs at least a date column and a title or course column.'] };
  rows.forEach((r, n) => {
    const date = normDate(r[iDate] ?? '');
    const time = iTime >= 0 ? normTime(r[iTime] ?? '') : '09:00';
    if (!date || !time) {
      errors.push(`Row ${n + 2}: could not read the date or time.`);
      return;
    }
    const title = (r[iTitle] ?? '').trim() || (r[iCourse] ?? '').trim();
    const course = (r[iCourse] ?? '').trim().toUpperCase() || guessCourse(title);
    const kindText = iKind >= 0 ? (r[iKind] ?? '').trim().toLowerCase() : '';
    const kind: ExamKind = (['quiz', 'midterm', 'final', 'deadline'] as const).find((k) => k === kindText) ?? guessKind(`${kindText} ${title}`);
    const num = (i: number, lo: number, hi: number): number | undefined => {
      const v = i >= 0 ? Number(r[i]) : NaN;
      return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined;
    };
    items.push(draft({ course, title, kind, date, time, durationMin: num(iDur, 0, 480), weight: num(iWeight, 1, 5), confidence: num(iConf, 1, 5) }));
  });
  return { items, errors };
};

const unfold = (text: string): string[] => text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);

export const parseIcs = (text: string, timezone: string): ParseResult => {
  const items: ExamDraft[] = [];
  const errors: string[] = [];
  let ev: Record<string, { value: string; params: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT' && ev) {
      const summary = (ev.SUMMARY?.value ?? '').replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
      const start = ev.DTSTART;
      if (!start || !summary) {
        errors.push('Skipped an event without a start or summary.');
      } else {
        const v = start.value;
        const tzid = /TZID=([^;:]+)/.exec(start.params)?.[1];
        let dt: DateTime;
        if (/^\d{8}$/.test(v)) dt = DateTime.fromFormat(v, 'yyyyLLdd', { zone: timezone }).set({ hour: 9 });
        else if (v.endsWith('Z')) dt = DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss'Z'", { zone: 'utc' }).setZone(timezone);
        else dt = DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss", { zone: tzid ?? timezone }).setZone(timezone);
        if (!dt.isValid) errors.push(`Skipped "${summary}": unreadable date.`);
        else {
          const kind = guessKind(summary);
          let durationMin: number | undefined;
          const end = ev.DTEND;
          if (end && /T/.test(end.value) && /T/.test(v)) {
            const e = DateTime.fromFormat(end.value, end.value.endsWith('Z') ? "yyyyLLdd'T'HHmmss'Z'" : "yyyyLLdd'T'HHmmss", { zone: end.value.endsWith('Z') ? 'utc' : tzid ?? timezone });
            const mins = Math.round(e.diff(DateTime.fromFormat(v, v.endsWith('Z') ? "yyyyLLdd'T'HHmmss'Z'" : "yyyyLLdd'T'HHmmss", { zone: v.endsWith('Z') ? 'utc' : tzid ?? timezone }), 'minutes').minutes);
            if (Number.isFinite(mins) && mins > 0 && mins <= 480) durationMin = mins;
          }
          items.push(draft({ course: guessCourse(summary), title: summary, kind, date: dt.toISODate() as string, time: dt.toFormat('HH:mm'), durationMin }));
        }
      }
      ev = null;
    } else if (ev) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m) ev[m[1] as string] = { value: m[3] as string, params: m[2] as string };
    }
  }
  return { items, errors };
};

// ---------- classes, shifts and training (commitments) ----------

export interface CommitmentDraft {
  label: string;
  kind: 'class' | 'work' | 'training' | 'other';
  /** ISO weekdays, 1 = Monday .. 7 = Sunday */
  days: number[];
  start: string;
  end: string;
}

export interface CommitmentParse {
  items: CommitmentDraft[];
  errors: string[];
}

const DAY_NAMES: Record<string, number> = {
  mon: 1, monday: 1, m: 1, tue: 2, tues: 2, tuesday: 2, t: 2, wed: 3, wednesday: 3, w: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4, fri: 5, friday: 5, f: 5, sat: 6, saturday: 6, sun: 7, sunday: 7,
};

/** "Mon;Wed", "1 3 5", "Mon-Fri", "weekdays", "daily" -> ISO weekdays, or null when unreadable */
export const parseDays = (value: string): number[] | null => {
  const v = value.trim().toLowerCase();
  if (v === '') return null;
  if (v === 'daily' || v === 'everyday' || v === 'every day') return [1, 2, 3, 4, 5, 6, 7];
  if (v === 'weekdays') return [1, 2, 3, 4, 5];
  if (v === 'weekends' || v === 'weekend') return [6, 7];
  const out = new Set<number>();
  for (const part of v.split(/[;,/\s]+/).filter(Boolean)) {
    const range = /^([a-z0-9]+)-([a-z0-9]+)$/.exec(part);
    const toNum = (x: string): number | undefined => (/^[1-7]$/.test(x) ? Number(x) : DAY_NAMES[x]);
    if (range) {
      const a = toNum(range[1] as string);
      const b = toNum(range[2] as string);
      if (!a || !b) return null;
      for (let d = a; ; d = (d % 7) + 1) {
        out.add(d);
        if (d === b) break;
      }
    } else {
      const d = toNum(part);
      if (!d) return null;
      out.add(d);
    }
  }
  return out.size > 0 ? [...out].sort((a, b) => a - b) : null;
};

const guessCommitmentKind = (text: string): CommitmentDraft['kind'] => {
  if (/\b(work|shift|job|internship|tutor)\b/i.test(text)) return 'work';
  if (/\b(gym|training|practice|workout|run|swim|football|sport|yoga)\b/i.test(text)) return 'training';
  if (/\b(class|lecture|lab|seminar|tutorial|course|section|recitation)\b/i.test(text)) return 'class';
  return 'class';
};

export const COMMITMENT_TEMPLATE = 'label,kind,days,start,end\nLectures,class,Mon;Wed,10:30,12:00\nPart-time shift,work,Tue;Thu,14:00,18:00\nGym,training,Mon;Wed;Fri,17:30,18:30\n';
export const TOPIC_TEMPLATE = 'course,name,topic\nCSC230,Data Structures,Linked lists\nCSC230,Data Structures,Trees and graphs\nMTH210,Linear Algebra,Eigenvalues\n';

export const parseCommitmentsCsv = (text: string): CommitmentParse => {
  const rows = parseCsvRows(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('label') || header.includes('days') || header.includes('start');
  if (hasHeader) rows.shift();
  const col = (names: string[], fallback: number): number => {
    const i = header.findIndex((h) => names.includes(h));
    return hasHeader ? i : fallback;
  };
  const iLabel = col(['label', 'name', 'title', 'class'], 0);
  const iKind = col(['kind', 'type'], 1);
  const iDays = col(['days', 'day'], 2);
  const iStart = col(['start', 'from'], 3);
  const iEnd = col(['end', 'to'], 4);
  const items: CommitmentDraft[] = [];
  const errors: string[] = [];
  if (hasHeader && (iLabel < 0 || iDays < 0 || iStart < 0 || iEnd < 0)) return { items, errors: ['The first row needs the columns label, days, start and end (kind is optional).'] };
  rows.forEach((r, n) => {
    const line = n + (hasHeader ? 2 : 1);
    const label = (r[iLabel] ?? '').trim();
    const days = parseDays(r[iDays] ?? '');
    const start = normTime(r[iStart] ?? '');
    const end = normTime(r[iEnd] ?? '');
    if (!label || !days || !start || !end) {
      errors.push(`Row ${line}: needs a name, days (like Mon;Wed), a start and an end time.`);
      return;
    }
    const kindText = iKind >= 0 ? (r[iKind] ?? '').trim().toLowerCase() : '';
    const kind = (['class', 'work', 'training', 'other'] as const).find((k) => k === kindText) ?? guessCommitmentKind(`${kindText} ${label}`);
    items.push({ label: label.slice(0, 60), kind, days, start, end });
  });
  return { items, errors };
};

const ICS_DAYS: Record<string, number> = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

/** Weekly repeating events become commitments. One-off events are skipped (they are not a weekly schedule). */
export const parseCommitmentsIcs = (text: string, timezone: string): CommitmentParse => {
  const items: CommitmentDraft[] = [];
  const errors: string[] = [];
  let skipped = 0;
  let ev: Record<string, { value: string; params: string }> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT' && ev) {
      const summary = (ev.SUMMARY?.value ?? '').replace(/\\,/g, ',').replace(/\\n/g, ' ').trim();
      const start = ev.DTSTART;
      const end = ev.DTEND;
      const rule = ev.RRULE?.value ?? '';
      const byDay = /BYDAY=([A-Z,0-9-]+)/.exec(rule)?.[1];
      if (!summary || !start || !end || !/FREQ=WEEKLY/.test(rule) || !/T/.test(start.value) || !/T/.test(end.value)) skipped += 1;
      else {
        const parse = (v: string, params: string): DateTime => {
          const tzid = /TZID=([^;:]+)/.exec(params)?.[1];
          if (v.endsWith('Z')) return DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss'Z'", { zone: 'utc' }).setZone(timezone);
          return DateTime.fromFormat(v, "yyyyLLdd'T'HHmmss", { zone: tzid ?? timezone }).setZone(timezone);
        };
        const s = parse(start.value, start.params);
        const e = parse(end.value, end.params);
        if (!s.isValid || !e.isValid || e <= s || e.toISODate() !== s.toISODate()) skipped += 1;
        else {
          const days = byDay ? byDay.split(',').map((d) => ICS_DAYS[d.replace(/^[-+]?\d+/, '')]).filter((d): d is number => !!d) : [s.weekday];
          if (days.length === 0) skipped += 1;
          else items.push({ label: summary.slice(0, 60), kind: guessCommitmentKind(summary), days: [...new Set(days)].sort((a, b) => a - b), start: s.toFormat('HH:mm'), end: e.toFormat('HH:mm') });
        }
      }
      ev = null;
    } else if (ev) {
      const m = /^([A-Z-]+)((?:;[^:]*)?):(.*)$/.exec(line);
      if (m) ev[m[1] as string] = { value: m[3] as string, params: m[2] as string };
    }
  }
  if (skipped > 0) errors.push(`${skipped} event${skipped === 1 ? ' was' : 's were'} skipped because ${skipped === 1 ? 'it does' : 'they do'} not repeat weekly or cross midnight.`);
  return { items, errors };
};

// ---------- course topics ----------

export interface TopicDraft {
  course: string;
  name: string;
  topic: string;
}

/** Columns: course (required), name (optional), topic (optional when a name is given). */
export const parseTopicsCsv = (text: string): { items: TopicDraft[]; errors: string[] } => {
  const rows = parseCsvRows(text);
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const hasHeader = header.includes('course') || header.includes('code');
  if (hasHeader) rows.shift();
  const col = (names: string[], fallback: number): number => {
    const i = header.findIndex((h) => names.includes(h));
    return hasHeader ? i : fallback;
  };
  const iCourse = col(['course', 'code'], 0);
  const iName = hasHeader ? col(['name', 'title', 'course name'], -1) : -1;
  const iTopic = hasHeader ? col(['topic', 'content', 'topics'], -1) : 1;
  const items: TopicDraft[] = [];
  const errors: string[] = [];
  rows.forEach((r, n) => {
    const course = (iCourse >= 0 ? (r[iCourse] ?? '') : '').trim().toUpperCase();
    const name = (iName >= 0 ? (r[iName] ?? '') : '').trim();
    const topic = (iTopic >= 0 ? (r[iTopic] ?? '') : '').trim();
    if (!course || (!topic && !name)) errors.push(`Row ${n + (hasHeader ? 2 : 1)}: needs a course code and a name or a topic.`);
    else items.push({ course: course.slice(0, 20), name: name.slice(0, 100), topic: topic.slice(0, 100) });
  });
  return { items, errors };
};
