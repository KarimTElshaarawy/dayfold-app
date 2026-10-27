import { describe, expect, it } from 'vitest';
import { memoryStore } from '../src/device/storage';
import { buildReminders } from '../src/device/reminders';
import { makeDevice, NOW } from './helpers';

describe('on-device API', () => {
  it('starts empty, then loads the fictional demo into an empty planner only once', async () => {
    const d = await makeDevice();
    expect((await d.req('GET', '/api/plan/2026-10-26')).json.state).toBe('empty');
    expect((await d.req('POST', '/api/seed/demo')).status).toBe(200);
    const boot = (await d.req('GET', '/api/bootstrap')).json;
    expect(boot.exams).toHaveLength(11);
    expect(boot.clock.date).toBe('2026-10-26');
    expect(boot.notifications.permission).toBe('unsupported');
    expect((await d.req('POST', '/api/seed/demo')).status).toBe(409);
  });

  it('validates input and answers 404 for unknown routes', async () => {
    const d = await makeDevice();
    expect((await d.req('PUT', '/api/settings', { wakeTime: '25:00' })).status).toBe(400);
    expect((await d.req('PUT', '/api/settings', { timezone: 'Mars/Base' })).status).toBe(400);
    expect((await d.req('POST', '/api/exams', { courseId: 'nope', title: 'x', kind: 'final', date: '2026-11-01', time: '09:00', durationMin: 60, weight: 3, confidence: 3 })).status).toBe(400);
    expect((await d.req('GET', '/api/nothing')).status).toBe(404);
  });

  it('plans today, ticks a task, keeps it through a replan and rolls missed work forward', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    const day = (await d.req('GET', '/api/plan/2026-10-26')).json;
    expect(day.relation).toBe('today');
    const task = day.blocks.find((b: { kind: string }) => b.kind === 'study');
    const r = await d.req('PATCH', `/api/blocks/${encodeURIComponent(task.id)}`, { done: true });
    expect(r.json.day.done).toBe(1);
    const re = (await d.req('POST', '/api/plan/replan')).json;
    expect(re.blocks.find((b: { id: string }) => b.id === task.id).status).toBe('done');
    d.clock.now = NOW + 24 * 3600_000;
    const yesterday = (await d.req('GET', '/api/plan/2026-10-26')).json;
    expect(yesterday.relation).toBe('past');
    expect(yesterday.blocks.some((b: { status: string }) => b.status === 'missed')).toBe(true);
    expect((await d.req('GET', '/api/stats')).json.doneTasks).toBe(1);
  });

  it('answers 409 for a block that no longer exists', async () => {
    const d = await makeDevice();
    expect((await d.req('PATCH', '/api/blocks/gone', { done: true })).status).toBe(409);
  });

  it('creates, edits and deletes courses, exams, topics and commitments', async () => {
    const d = await makeDevice();
    const course = (await d.req('POST', '/api/courses', { code: 'bio101', name: 'Biology', color: 2 })).json;
    expect(course.code).toBe('BIO101');
    expect((await d.req('POST', '/api/courses', { code: 'BIO101' })).status).toBe(409);
    const exam = (await d.req('POST', '/api/exams', { courseId: course.id, title: 'BIO101 Quiz', kind: 'quiz', date: '2026-10-30', time: '10:00', durationMin: 60, weight: 2, confidence: 2 })).json;
    expect((await d.req('PUT', `/api/exams/${exam.id}`, { confidence: 5 })).json.confidence).toBe(5);
    const boot = (await d.req('GET', '/api/bootstrap')).json;
    expect(boot.topics.filter((t: { courseId: string }) => t.courseId === course.id)).toHaveLength(5);
    const topic = boot.topics[0];
    expect((await d.req('PUT', `/api/topics/${topic.id}`, { title: 'Cells' })).status).toBe(200);
    const c = (await d.req('POST', '/api/commitments', { label: 'Lectures', kind: 'class', days: [1, 3], start: '10:30', end: '12:00' })).json;
    expect((await d.req('DELETE', `/api/commitments/${c.id}`)).status).toBe(200);
    expect((await d.req('DELETE', `/api/exams/${exam.id}`)).status).toBe(200);
    expect((await d.req('DELETE', `/api/exams/${exam.id}`)).status).toBe(404);
    expect((await d.req('DELETE', `/api/courses/${course.id}`)).status).toBe(200);
  });

  it('imports CSV once and skips duplicates', async () => {
    const d = await makeDevice();
    const csv = 'course,title,date,time,kind\nBIO101,BIO101 Midterm,2026-11-05,2:30pm,midterm';
    const p = (await d.req('POST', '/api/import/preview', { kind: 'csv', text: csv })).json;
    expect(p.items[0].time).toBe('14:30');
    expect((await d.req('POST', '/api/import/commit', { items: p.items })).json.created).toBe(1);
    expect((await d.req('POST', '/api/import/commit', { items: p.items })).json.created).toBe(0);
  });

  it('previews a far week the same as continuous planning', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    const week = (await d.req('GET', '/api/week?start=2026-11-02')).json;
    const single = (await d.req('GET', '/api/plan/2026-11-03')).json;
    expect(week[1].blocks).toEqual(single.blocks);
    expect((await d.req('GET', '/api/week?start=2036-01-05')).status).toBe(400);
  });
});

describe('persistence', () => {
  it('survives an app restart and a backup round trip', async () => {
    const store = memoryStore();
    const first = await makeDevice(store);
    await first.req('POST', '/api/seed/demo');
    const task = (await first.req('GET', '/api/plan/2026-10-26')).json.blocks.find((b: { kind: string }) => b.kind === 'study');
    await first.req('PATCH', `/api/blocks/${encodeURIComponent(task.id)}`, { done: true });
    await first.repo.flush();

    const second = await makeDevice(store);
    expect((await second.req('GET', '/api/bootstrap')).json.exams).toHaveLength(11);
    expect((await second.req('GET', '/api/stats')).json.doneTasks).toBe(1);

    const backup = (await second.req('GET', '/api/backup')).json.data as string;
    const third = await makeDevice(memoryStore());
    expect((await third.req('POST', '/api/backup/restore', { data: 'not json' })).status).toBe(400);
    expect((await third.req('POST', '/api/backup/restore', { data: backup })).status).toBe(200);
    expect((await third.req('GET', '/api/bootstrap')).json.exams).toHaveLength(11);
  });

  it('does not crash on a corrupted stored document', async () => {
    const d = await makeDevice(memoryStore('{broken'));
    expect((await d.req('GET', '/api/bootstrap')).status).toBe(200);
  });
});

describe('morning reminders', () => {
  it('schedules one per coming day at the chosen time with a useful summary', async () => {
    const d = await makeDevice();
    await d.req('POST', '/api/seed/demo');
    await d.req('PUT', '/api/settings', { emailTime: '06:30' });
    const list = buildReminders(d.svc, NOW);
    // today 06:30 Dubai has passed at 10:00, so the next 13 days remain
    expect(list).toHaveLength(13);
    expect(list[0]!.at).toBe(Date.UTC(2026, 9, 27, 2, 30));
    expect(list[0]!.title).toBe('Tue 27 Oct: CSC230 Quiz 3 in 8 days');
    expect(list[0]!.body).toMatch(/^\d+ sessions?, .*First at \d\d:\d\d/);
    expect(new Set(list.map((r) => r.id)).size).toBe(list.length);
  });
  it('is empty when switched off and says so for an empty planner', async () => {
    const d = await makeDevice();
    expect(buildReminders(d.svc, NOW)[0]?.body).toBe('Add an exam to get a plan.');
    await d.req('PUT', '/api/settings', { emailEnabled: false });
    expect(buildReminders(d.svc, NOW)).toEqual([]);
  });
});
