import { DateTime } from 'luxon';
import { addDays, diffDays, fmtMin, formatDateLong } from '@shared/time';
import { isStudy } from '@shared/types';
import type { Service } from './service';

export interface Reminder {
  id: number;
  /** epoch ms */
  at: number;
  title: string;
  body: string;
}

export const REMINDER_ID_BASE = 1000;
export const TEST_NOTIFICATION_ID = 999;
/** iOS keeps at most 64 pending local notifications; two weeks is plenty and stays well under it. */
export const REMINDER_DAYS = 14;

const dur = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
};

/**
 * The morning notification. A local notification cannot be computed at fire time, so the next days are
 * scheduled in advance from the planner's preview and rebuilt whenever the app opens or data changes.
 */
export const buildReminders = (svc: Service, nowMs: number, days = REMINDER_DAYS): Reminder[] => {
  const settings = svc.repo.getSettings();
  if (!settings.emailEnabled) return [];
  const { date: today } = svc.clock();
  const courses = svc.repo.listCourses();
  const exams = svc.repo.listExams().filter((e) => e.kind !== 'deadline');
  const views = svc.range(today, addDays(today, days - 1));
  const out: Reminder[] = [];
  views.forEach((view, i) => {
    const at = DateTime.fromISO(`${view.date}T${settings.emailTime}`, { zone: settings.timezone }).toMillis();
    if (!(at > nowMs + 5_000)) return;
    const sessions = view.blocks.filter((b) => isStudy(b) && b.status !== 'done');
    const next = exams.filter((e) => e.date >= view.date).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
    const code = next ? (courses.find((c) => c.id === next.courseId)?.code ?? '') : '';
    const name = next ? (code && !next.title.toUpperCase().startsWith(code.toUpperCase()) ? `${code} ${next.title}` : next.title) : '';
    const left = next ? diffDays(next.date, view.date) : 0;
    const when = left === 0 ? `today at ${next?.time}` : left === 1 ? 'tomorrow' : `in ${left} days`;
    const title = next ? `${formatDateLong(view.date)}: ${name} ${when}` : `${formatDateLong(view.date)}: Your plan`;
    let body: string;
    if (view.state === 'all-done') body = 'Every exam is behind you.';
    else if (view.state === 'empty') body = 'Add an exam to get a plan.';
    else if (sessions.length === 0) body = 'Nothing to study today. Rest.';
    else {
      const first = sessions[0];
      const firstCode = first?.courseId ? (courses.find((c) => c.id === first.courseId)?.code ?? '') : '';
      const total = sessions.reduce((s, b) => s + b.end - b.start, 0);
      body = `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}, ${dur(total)}. First at ${fmtMin(first?.start ?? 0)}${firstCode ? `: ${firstCode}` : ''}${first?.topicTitle ? ` ${first.topicTitle}` : ''}.`;
    }
    out.push({ id: REMINDER_ID_BASE + i, at, title, body });
  });
  return out;
};
