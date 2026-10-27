import { EXAM_DEFAULTS } from '@shared/defaults';
import { DateTime } from 'luxon';
import { contextFromSeed, type SeedFile } from '@shared/seed';
import { addDays, diffDays, examEndMs, examStartMs, isValidTimezone } from '@shared/time';
import type { Commitment, Exam, Settings } from '@shared/types';
import { ApiError } from '../lib/errors';
import demo from './demo.json';
import { parseCsv, parseIcs } from './importers';
import type { Notifier } from './notifications';
import type { DeviceRepo } from './repo';
import type { Service } from './service';

const PLACEHOLDER_TOPICS = ['Lectures 1-3', 'Lectures 4-6', 'Lectures 7-9', 'Problem sets', 'Past paper themes'];

const bad = (msg: string): never => {
  throw new ApiError(400, msg);
};
const str = (v: unknown, name: string, max: number, allowEmpty = false): string => {
  if (typeof v !== 'string' || v.length > max || (!allowEmpty && v.trim() === '')) return bad(`${name} is invalid`);
  return v;
};
const int = (v: unknown, name: string, lo: number, hi: number): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return bad(`${name} must be a whole number from ${lo} to ${hi}`);
  return v;
};
const hhmm = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return bad(`${name} must be HH:MM`);
  return v;
};
const isoDate = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !DateTime.fromISO(v, { zone: 'utc' }).isValid) return bad(`${name} must be a real date (YYYY-MM-DD)`);
  return v;
};
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : bad('Invalid request body'));

const KINDS = ['quiz', 'midterm', 'final', 'deadline'] as const;
const CKINDS = ['class', 'work', 'training', 'other'] as const;

const parseSettings = (raw: unknown): Partial<Settings> => {
  const b = obj(raw);
  const out: Partial<Settings> = {};
  if ('name' in b) out.name = str(b.name, 'name', 60, true);
  if ('timezone' in b) {
    const tz = str(b.timezone, 'timezone', 64);
    if (!isValidTimezone(tz)) bad('Unknown timezone');
    out.timezone = tz;
  }
  if ('wakeTime' in b) out.wakeTime = hhmm(b.wakeTime, 'wakeTime');
  if ('sleepTime' in b) out.sleepTime = hhmm(b.sleepTime, 'sleepTime');
  if ('sessionMin' in b) out.sessionMin = int(b.sessionMin, 'sessionMin', 20, 120);
  if ('breakMin' in b) out.breakMin = int(b.breakMin, 'breakMin', 0, 60);
  if ('longBreakMin' in b) out.longBreakMin = int(b.longBreakMin, 'longBreakMin', 0, 90);
  if ('longBreakEvery' in b) out.longBreakEvery = int(b.longBreakEvery, 'longBreakEvery', 2, 8);
  if ('dailyCapMin' in b) out.dailyCapMin = int(b.dailyCapMin, 'dailyCapMin', 60, 960);
  if ('windDownMin' in b) out.windDownMin = int(b.windDownMin, 'windDownMin', 0, 180);
  if ('morningMin' in b) out.morningMin = int(b.morningMin, 'morningMin', 0, 180);
  if ('emailTime' in b) out.emailTime = hhmm(b.emailTime, 'emailTime');
  if ('emailEnabled' in b) out.emailEnabled = b.emailEnabled === true;
  if ('setupDone' in b) out.setupDone = b.setupDone === true;
  if ('meals' in b) {
    if (!Array.isArray(b.meals) || b.meals.length > 6) bad('meals is invalid');
    out.meals = (b.meals as unknown[]).map((m) => {
      const o = obj(m);
      return { label: str(o.label, 'meal name', 30), time: hhmm(o.time, 'meal time'), durationMin: int(o.durationMin, 'meal length', 10, 120) };
    });
  }
  return out;
};

const parseExam = (raw: unknown, partial: boolean): Partial<Omit<Exam, 'id'>> => {
  const b = obj(raw);
  const out: Partial<Omit<Exam, 'id'>> = {};
  const need = (k: string): boolean => (partial ? k in b : true);
  if (need('courseId')) out.courseId = str(b.courseId, 'courseId', 80);
  if (need('title')) out.title = str(b.title, 'title', 100);
  if (need('kind')) {
    if (!KINDS.includes(b.kind as (typeof KINDS)[number])) bad('kind is invalid');
    out.kind = b.kind as Exam['kind'];
  }
  if (need('date')) out.date = isoDate(b.date, 'date');
  if (need('time')) out.time = hhmm(b.time, 'time');
  if (need('durationMin')) out.durationMin = int(b.durationMin, 'durationMin', 0, 480);
  if (need('weight')) out.weight = int(b.weight, 'weight', 1, 5);
  if (need('confidence')) out.confidence = int(b.confidence, 'confidence', 1, 5);
  return out;
};

const parseCommitment = (raw: unknown, partial: boolean): Partial<Omit<Commitment, 'id'>> => {
  const b = obj(raw);
  const out: Partial<Omit<Commitment, 'id'>> = {};
  const need = (k: string): boolean => (partial ? k in b : true);
  if (need('label')) out.label = str(b.label, 'label', 60);
  if (need('kind')) {
    if (!CKINDS.includes(b.kind as (typeof CKINDS)[number])) bad('kind is invalid');
    out.kind = b.kind as Commitment['kind'];
  }
  if (need('days')) {
    if (!Array.isArray(b.days) || b.days.length < 1 || b.days.length > 7) bad('days is invalid');
    out.days = (b.days as unknown[]).map((d) => int(d, 'day', 1, 7));
  }
  if (need('start')) out.start = hhmm(b.start, 'start');
  if (need('end')) out.end = hhmm(b.end, 'end');
  return out;
};

export interface Reply {
  status: number;
  json: unknown;
}

export interface Router {
  handle(method: string, url: string, body?: unknown): Promise<Reply>;
}

export const createRouter = (repo: DeviceRepo, svc: Service, notifier: Notifier): Router => {
  let syncTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSync = (): void => {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void notifier.sync().catch(() => undefined), 800);
  };
  const afterEdit = (): void => {
    svc.replanToday();
    scheduleSync();
  };
  const seedTopics = (courseId: string): void => {
    for (const title of PLACEHOLDER_TOPICS) repo.createTopic({ courseId, title });
  };

  const bootstrap = async () => {
    const settings = repo.getSettings();
    return {
      settings,
      courses: repo.listCourses(),
      exams: repo.listExams().map((e) => ({ ...e, startMs: examStartMs(e, settings.timezone), endMs: examEndMs(e, settings.timezone) })),
      topics: repo.listTopics(),
      commitments: repo.listCommitments(),
      clock: { ...svc.clock(), timezone: settings.timezone, nowMs: svc.now() },
      notifications: { permission: await notifier.permission() },
    };
  };

  const handle = async (method: string, rawUrl: string, body?: unknown): Promise<Reply> => {
    const [path = '', query = ''] = rawUrl.split('?');
    const params = new URLSearchParams(query);
    const seg = path.split('/').filter(Boolean); // ['api', ...]
    const [, a, b] = seg;
    const ok = (json: unknown, status = 200): Reply => ({ status, json });

    if (method === 'GET' && a === 'bootstrap') return ok(await bootstrap());

    if (a === 'settings' && method === 'PUT') {
      const patch = parseSettings(body);
      const settings = repo.saveSettings(patch);
      afterEdit();
      return ok(settings);
    }

    if (a === 'courses') {
      if (method === 'POST') {
        const o = obj(body);
        const code = str(o.code, 'code', 20).trim().toUpperCase();
        const course = repo.tx(() => {
          const c = repo.createCourse({ code, name: 'name' in o ? str(o.name, 'name', 80, true) : '', color: 'color' in o ? int(o.color, 'color', 0, 7) : 0 });
          seedTopics(c.id);
          return c;
        });
        return ok(course, 201);
      }
      if (method === 'PUT' && b) {
        const o = obj(body);
        const patch: { code?: string; name?: string; color?: number } = {};
        if ('code' in o) patch.code = str(o.code, 'code', 20).trim().toUpperCase();
        if ('name' in o) patch.name = str(o.name, 'name', 80, true);
        if ('color' in o) patch.color = int(o.color, 'color', 0, 7);
        const c = repo.updateCourse(b, patch);
        if (!c) throw new ApiError(404, 'not found');
        afterEdit();
        return ok(c);
      }
      if (method === 'DELETE' && b) {
        if (!repo.deleteCourse(b)) throw new ApiError(404, 'not found');
        afterEdit();
        return ok({ ok: true });
      }
    }

    if (a === 'exams') {
      if (method === 'POST') {
        const e = parseExam(body, false) as Omit<Exam, 'id'>;
        if (!repo.getCourse(e.courseId)) bad('unknown course');
        const created = repo.createExam(e);
        afterEdit();
        return ok(created, 201);
      }
      if (method === 'PUT' && b) {
        const patch = parseExam(body, true);
        if (patch.courseId && !repo.getCourse(patch.courseId)) bad('unknown course');
        const e = repo.updateExam(b, patch);
        if (!e) throw new ApiError(404, 'not found');
        afterEdit();
        return ok(e);
      }
      if (method === 'DELETE' && b) {
        if (!repo.deleteExam(b)) throw new ApiError(404, 'not found');
        afterEdit();
        return ok({ ok: true });
      }
    }

    if (a === 'topics') {
      if (method === 'POST') {
        const o = obj(body);
        const courseId = str(o.courseId, 'courseId', 80);
        if (!repo.getCourse(courseId)) bad('unknown course');
        const t = repo.createTopic({ courseId, title: str(o.title, 'title', 100) });
        afterEdit();
        return ok(t, 201);
      }
      if (method === 'PUT' && b) {
        if (!repo.updateTopic(b, str(obj(body).title, 'title', 100))) throw new ApiError(404, 'not found');
        afterEdit();
        return ok({ ok: true });
      }
      if (method === 'DELETE' && b) {
        if (!repo.deleteTopic(b)) throw new ApiError(404, 'not found');
        afterEdit();
        return ok({ ok: true });
      }
    }

    if (a === 'commitments') {
      if (method === 'POST') {
        const c = repo.createCommitment(parseCommitment(body, false) as Omit<Commitment, 'id'>);
        afterEdit();
        return ok(c, 201);
      }
      if (method === 'PUT' && b) {
        const c = repo.updateCommitment(b, parseCommitment(body, true));
        if (!c) throw new ApiError(404, 'not found');
        afterEdit();
        return ok(c);
      }
      if (method === 'DELETE' && b) {
        if (!repo.deleteCommitment(b)) throw new ApiError(404, 'not found');
        afterEdit();
        return ok({ ok: true });
      }
    }

    if (method === 'GET' && a === 'plan' && b) {
      const date = isoDate(b, 'date');
      if (Math.abs(diffDays(date, svc.clock().date)) > 400) bad('date is out of range');
      return ok(svc.day(date));
    }
    if (method === 'POST' && a === 'plan' && b === 'replan') {
      const day = svc.replanToday();
      scheduleSync();
      return ok(day);
    }
    if (method === 'GET' && a === 'week') {
      const start = isoDate(params.get('start'), 'start');
      if (Math.abs(diffDays(start, svc.clock().date)) > 400) bad('start is out of range');
      return ok(svc.range(start, addDays(start, 6)));
    }
    if (method === 'PATCH' && a === 'blocks' && b) {
      const done = obj(body).done === true;
      const block = svc.toggle(decodeURIComponent(b), done);
      if (!block) throw new ApiError(409, 'That session changed. The plan was refreshed.');
      scheduleSync();
      return ok({ ok: true, block, day: svc.day(block.date) });
    }
    if (method === 'GET' && a === 'stats') return ok(svc.stats());

    if (a === 'import' && method === 'POST') {
      const o = obj(body);
      if (b === 'preview') {
        const text = str(o.text, 'text', 500_000);
        return ok(o.kind === 'ics' ? parseIcs(text, repo.getSettings().timezone) : parseCsv(text));
      }
      if (b === 'commit') {
        if (!Array.isArray(o.items) || o.items.length > 300) bad('items is invalid');
        // validate every row first so a bad row cannot leave a half-finished import behind
        const rows = (o.items as unknown[]).map((raw) => {
          const it = obj(raw);
          const kind = KINDS.includes(it.kind as (typeof KINDS)[number]) ? (it.kind as Exam['kind']) : 'midterm';
          return {
            code: str(it.course, 'course', 20).trim().toUpperCase(),
            title: str(it.title, 'title', 100),
            date: isoDate(it.date, 'date'),
            time: hhmm(it.time, 'time'),
            kind,
            durationMin: int(it.durationMin ?? EXAM_DEFAULTS[kind].durationMin, 'durationMin', 0, 480),
            weight: int(it.weight ?? EXAM_DEFAULTS[kind].weight, 'weight', 1, 5),
            confidence: int(it.confidence ?? 3, 'confidence', 1, 5),
          };
        });
        const created = repo.tx(() => {
          let n = 0;
          for (const row of rows) {
            let course = repo.listCourses().find((c) => c.code === row.code);
            if (!course) {
              course = repo.createCourse({ code: row.code, name: '', color: repo.listCourses().length % 8 });
              seedTopics(course.id);
            }
            const courseId = course.id;
            if (repo.listExams().some((e) => e.courseId === courseId && e.date === row.date && e.time === row.time && e.title === row.title)) continue;
            repo.createExam({ courseId, title: row.title, kind: row.kind, date: row.date, time: row.time, durationMin: row.durationMin, weight: row.weight, confidence: row.confidence });
            n += 1;
          }
          return n;
        });
        afterEdit();
        return ok({ created });
      }
    }

    if (method === 'POST' && a === 'seed' && b === 'demo') {
      if (!repo.isEmpty()) throw new ApiError(409, 'Demo data can only be loaded into an empty planner.');
      const ctx = contextFromSeed(demo as unknown as SeedFile);
      repo.tx(() => {
        for (const c of ctx.courses) repo.createCourse({ code: c.code, name: c.name, color: c.color }, c.id);
        for (const t of ctx.topics) repo.createTopic({ courseId: t.courseId, title: t.title }, t.id);
        for (const e of ctx.exams) repo.createExam({ ...e }, e.id);
        for (const c of ctx.commitments) repo.createCommitment({ ...c }, c.id);
      });
      afterEdit();
      return ok({ ok: true });
    }

    if (a === 'notifications') {
      if (method === 'POST' && b === 'permission') {
        const permission = await notifier.request();
        scheduleSync();
        return ok({ permission });
      }
      if (method === 'POST' && b === 'test') {
        const sent = await notifier.test();
        return ok({ sent });
      }
    }

    if (a === 'backup') {
      if (method === 'GET' && b === 'unreadable') return ok({ data: await repo.unreadable() });
      if (method === 'GET') return ok({ data: repo.export() });
      if (method === 'POST' && b === 'restore') {
        const data = str(obj(body).data, 'data', 5_000_000);
        const previous = repo.export();
        try {
          await repo.restore(data);
          svc.replanToday();
        } catch {
          await repo.restore(previous);
          bad('That is not a usable Dayfold backup. Nothing was changed.');
        }
        scheduleSync();
        return ok({ ok: true });
      }
    }

    throw new ApiError(404, 'not found');
  };

  return {
    handle: async (method, url, body) => {
      try {
        return await handle(method, url, body);
      } catch (e) {
        if (e instanceof ApiError) return { status: e.status, json: { error: e.message } };
        return { status: 500, json: { error: 'Something went wrong.' } };
      }
    },
  };
};
