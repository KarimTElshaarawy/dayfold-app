import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ImportSheet } from '../components/ImportSheet';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Field, Seg, Skeleton, Switch, TextField, TimeField, cvar } from '../components/ui';
import { api } from '../lib/api';
import { WEEKDAYS } from '../lib/format';
import { applyTheme, getTheme, type ThemePref } from '../lib/hooks';
import { useBoot } from '../lib/query';
import { ACCENT_PRESETS, applyAccent } from '../lib/accent';
import { copyText } from '../lib/clipboard';
import { BulkImportSheet, type BulkMode } from '../components/BulkImportSheet';
import type { Boot, Commitment, Course, Settings as S } from '../lib/types';
import { APP_NAME } from '../lib/appInfo';

export const usePatchSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<S>) => api<S>('PUT', '/api/settings', patch),
    onSuccess: () => void qc.invalidateQueries(),
  });
};

/** Text-ish input that commits on blur so typing never fights the server round trip. */
export const Commit = ({ label, value, onCommit, ...p }: { label: string; value: string | number; onCommit: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) => {
  const [v, setV] = useState(String(value));
  useEffect(() => setV(String(value)), [value]);
  return <TextField label={label} {...p} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== String(value) && onCommit(v)} />;
};

const zones = (): string[] => {
  try {
    return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
};

const CommitmentSheet = ({ item, open, onClose }: { item: Commitment | null; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [d, setD] = useState<Omit<Commitment, 'id'>>({ label: '', kind: 'class', days: [1, 3], start: '10:00', end: '11:30' });
  useEffect(() => {
    if (open) setD(item ? { label: item.label, kind: item.kind, days: item.days, start: item.start, end: item.end } : { label: '', kind: 'class', days: [1, 3], start: '10:00', end: '11:30' });
  }, [open, item]);
  const save = useMutation({
    mutationFn: () => (item ? api('PUT', `/api/commitments/${item.id}`, d) : api('POST', '/api/commitments', d)),
    onSuccess: () => { void qc.invalidateQueries(); onClose(); },
  });
  const del = useMutation({ mutationFn: () => api('DELETE', `/api/commitments/${item?.id}`), onSuccess: () => { void qc.invalidateQueries(); onClose(); } });
  return (
    <Sheet open={open} onClose={onClose} title={item ? 'Edit commitment' : 'Add commitment'}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); if (d.label.trim() && d.days.length) save.mutate(); }}>
        <TextField label="Name" value={d.label} onChange={(e) => setD({ ...d, label: e.target.value })} placeholder="Lectures, shift, training" />
        <Field label="Type"><Seg label="Type" value={d.kind} onChange={(kind) => setD({ ...d, kind })} options={[['class', 'Class'], ['work', 'Work'], ['training', 'Training'], ['other', 'Other']]} /></Field>
        <Field label="Days">
          <div className="chips" style={{ marginBottom: 8 }}>
            {([['Weekdays', [1, 2, 3, 4, 5]], ['Mon Wed', [1, 3]], ['Tue Thu', [2, 4]], ['Mon Wed Fri', [1, 3, 5]], ['Every day', [1, 2, 3, 4, 5, 6, 7]]] as Array<[string, number[]]>).map(([name, days]) => (
              <button type="button" key={name} className="chip" aria-pressed={d.days.join() === days.join()} onClick={() => setD({ ...d, days })}>{name}</button>
            ))}
          </div>
          <div className="day-toggle">
            {WEEKDAYS.map((w, i) => (
              <button type="button" key={w} aria-pressed={d.days.includes(i + 1)} aria-label={w} onClick={() => setD({ ...d, days: d.days.includes(i + 1) ? d.days.filter((x) => x !== i + 1) : [...d.days, i + 1].sort() })}>{w[0]}</button>
            ))}
          </div>
        </Field>
        <div className="form-grid">
          <TimeField label="Starts" value={d.start} onChange={(v) => setD({ ...d, start: v })} />
          <TimeField label="Ends" value={d.end} onChange={(v) => setD({ ...d, end: v })} />
        </div>
        {(save.error ?? del.error) && <div className="banner" role="alert">{(save.error ?? del.error)?.message}</div>}
        <div className="row" style={{ justifyContent: 'space-between' }}>
          {item ? <button type="button" className="btn danger" onClick={() => del.mutate()}>Delete</button> : <span />}
          <button className="btn" disabled={!d.label.trim() || d.days.length === 0}>Save</button>
        </div>
      </form>
    </Sheet>
  );
};

const CourseSheet = ({ boot, course, open, onClose }: { boot: Boot; course: Course | null; open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const [d, setD] = useState({ code: '', name: '', color: 0 });
  useEffect(() => { if (course) setD({ code: course.code, name: course.name, color: course.color }); }, [course]);
  const topics = boot.topics.filter((t) => t.courseId === course?.id);
  const [newTopic, setNewTopic] = useState('');
  const [bulkTopics, setBulkTopics] = useState('');
  const refresh = (): void => void qc.invalidateQueries();
  const save = useMutation({ mutationFn: () => api('PUT', `/api/courses/${course?.id}`, { ...d, code: d.code.trim().toUpperCase() }), onSuccess: () => { refresh(); onClose(); } });
  const del = useMutation({ mutationFn: () => api('DELETE', `/api/courses/${course?.id}`), onSuccess: () => { refresh(); onClose(); } });
  const addTopic = useMutation({ mutationFn: () => api('POST', '/api/topics', { courseId: course?.id, title: newTopic.trim() }), onSuccess: () => { setNewTopic(''); refresh(); } });
  const addMany = useMutation({
    mutationFn: () => api('POST', '/api/import/topics/commit', { items: bulkTopics.split('\n').map((t) => t.trim()).filter(Boolean).map((topic) => ({ course: course?.code ?? '', topic })), replacePlaceholders: false }),
    onSuccess: () => { setBulkTopics(''); refresh(); },
  });
  const rename = useMutation({ mutationFn: ({ id, title }: { id: string; title: string }) => api('PUT', `/api/topics/${id}`, { title }), onSuccess: refresh });
  const rm = useMutation({ mutationFn: (id: string) => api('DELETE', `/api/topics/${id}`), onSuccess: refresh });
  return (
    <Sheet open={open && !!course} onClose={onClose} title="Course">
      <div className="stack">
        <div className="form-grid">
          <TextField label="Code" value={d.code} onChange={(e) => setD({ ...d, code: e.target.value })} />
          <TextField label="Name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        </div>
        <Field label="Color">
          <div className="color-swatches">
            {Array.from({ length: 8 }, (_, i) => (
              <button key={i} className="swatch" style={{ background: cvar(i) }} aria-pressed={d.color === i} aria-label={`Color ${i + 1}`} onClick={() => setD({ ...d, color: i })} />
            ))}
          </div>
        </Field>
        <div>
          <div className="t-eyebrow" style={{ marginBottom: 8 }}>Topics</div>
          <div className="list">
            {topics.map((t) => (
              <div className="list-row" key={t.id} style={{ minHeight: 48, padding: '6px 0' }}>
                <input className="input grow" style={{ height: 40 }} defaultValue={t.title} aria-label="Topic" onBlur={(e) => e.target.value.trim() && e.target.value !== t.title && rename.mutate({ id: t.id, title: e.target.value.trim() })} />
                <button className="btn ghost small icon" aria-label={`Remove ${t.title}`} onClick={() => rm.mutate(t.id)}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <div className="t-cap" style={{ margin: '12px 0 6px' }}>Add several at once, one per line</div>
          <textarea className="textarea" style={{ minHeight: 88 }} aria-label="Several topics, one per line" placeholder={'Linked lists\nTrees and graphs\nSorting'} value={bulkTopics} onChange={(e) => setBulkTopics(e.target.value)} />
          <button className="btn secondary small" style={{ marginTop: 8 }} disabled={!bulkTopics.trim() || addMany.isPending} onClick={() => addMany.mutate()}>Add these topics</button>
          <form className="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); if (newTopic.trim()) addTopic.mutate(); }}>
            <input className="input grow" style={{ height: 40 }} placeholder="Add a topic" aria-label="New topic" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} />
            <button className="btn secondary small" disabled={!newTopic.trim()}>Add</button>
          </form>
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <button className="btn danger" onClick={() => del.mutate()}>Delete course</button>
          <button className="btn" onClick={() => save.mutate()} disabled={!d.code.trim()}>Save</button>
        </div>
      </div>
    </Sheet>
  );
};

const BackupSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState('');
  const exportData = useMutation({
    mutationFn: () => api<{ data: string }>('GET', '/api/backup'),
    onSuccess: async (r) => {
      setText(r.data);
      toast((await copyText(r.data)) ? 'Backup copied. Paste it into Notes or a message to keep it.' : 'Select the text below and copy it.');
    },
  });
  const unreadable = useMutation({
    mutationFn: () => api<{ data: string | null }>('GET', '/api/backup/unreadable'),
    onSuccess: async (r) => {
      if (!r.data) {
        toast('No unreadable data was saved.');
        return;
      }
      setText(r.data);
      toast((await copyText(r.data)) ? 'Copied. Paste it into Notes to keep it.' : 'Select the text and copy it.');
    },
  });
  const restore = useMutation({
    mutationFn: () => api('POST', '/api/backup/restore', { data: text.trim() }),
    onSuccess: async () => {
      try { applyAccent((await api<{ accent: string }>('GET', '/api/prefs')).accent); } catch { /* keep the current color */ }
      void qc.invalidateQueries();
      toast('Restored');
      onClose();
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title="Backup and restore">
      <div className="stack">
        <p className="t-cap">Your data lives only on this phone. Copy a backup now and then. Deleting the app deletes the data.</p>
        <button className="btn secondary" onClick={() => exportData.mutate()} disabled={exportData.isPending}>Copy backup</button>
        <button className="btn ghost" onClick={() => unreadable.mutate()}>Load data saved from a failed start</button>
        <textarea className="textarea" aria-label="Backup data" placeholder="Paste a backup here to restore it" value={text} onChange={(e) => setText(e.target.value)} />
        {restore.error && <div className="banner" role="alert">{restore.error.message}</div>}
        <button className="btn" disabled={!text.trim() || restore.isPending} onClick={() => restore.mutate()}>Restore from this text</button>
      </div>
    </Sheet>
  );
};

export const Settings = () => {
  const boot = useBoot();
  const patch = usePatchSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [theme, setTheme] = useState<ThemePref>(getTheme());
  const [commitment, setCommitment] = useState<Commitment | null>(null);
  const [cOpen, setCOpen] = useState(false);
  const [course, setCourse] = useState<Course | null>(null);
  const [impOpen, setImpOpen] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [bulk, setBulk] = useState<BulkMode | null>(null);
  const tzList = useRef(zones()).current;
  const prefsMut = useMutation({
    mutationFn: (patch: Partial<{ sessionReminders: boolean; sessionLeadMin: number; accent: string }>) => api('PUT', '/api/prefs', patch),
    onSuccess: () => void qc.invalidateQueries(),
  });
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The color picker fires on every drag step: show it live and save once it settles. */
  const dragAccent = (hex: string): void => {
    applyAccent(hex);
    if (dragTimer.current) clearTimeout(dragTimer.current);
    dragTimer.current = setTimeout(() => prefsMut.mutate({ accent: hex }), 400);
  };
  const pickAccent = (hex: string): void => {
    applyAccent(hex);
    prefsMut.mutate({ accent: hex });
  };
  const allow = useMutation({
    mutationFn: () => api<{ permission: string }>('POST', '/api/notifications/permission'),
    onSuccess: (r) => { void qc.invalidateQueries(); toast(r.permission === 'granted' ? 'Notifications are on' : 'Notifications are off. Enable them in iPhone or Android Settings.'); },
  });
  const test = useMutation({
    mutationFn: () => api<{ sent: boolean }>('POST', '/api/notifications/test'),
    onSuccess: (r) => toast(r.sent ? 'A test arrives in a few seconds' : 'Allow notifications first'),
  });
  const demo = useMutation({ mutationFn: () => api('POST', '/api/seed/demo'), onSuccess: () => { void qc.invalidateQueries(); toast('Demo data loaded'); } });
  if (!boot.data) return <div className="stack"><Skeleton h={44} w={200} /><Skeleton h={300} r={28} /></div>;
  const b = boot.data;
  const s = b.settings;
  const save = (p: Partial<S>): void => patch.mutate(p);
  const hours = (m: number): string => String(m / 60);

  return (
    <>
      <header className="page-head"><div><div className="t-eyebrow">{APP_NAME}</div><h1 className="t-title">Settings</h1></div></header>
      {patch.error && <div className="banner" role="alert" style={{ marginBottom: 16 }}>{patch.error.message}</div>}
      <div className="stack">
        <div className="set-cols">
          <section className="card stack">
            <h2 className="t-head">Profile</h2>
            <Commit label="Name" value={s.name} onCommit={(v) => save({ name: v })} />
            <Field label="Timezone">
              <select className="select" value={s.timezone} onChange={(e) => save({ timezone: e.target.value })}>
                {(tzList.includes(s.timezone) ? tzList : [s.timezone, ...tzList]).map((z) => <option key={z}>{z}</option>)}
              </select>
            </Field>
            <Field label="Appearance"><Seg label="Appearance" value={theme} onChange={(t) => { setTheme(t); applyTheme(t); }} options={[['system', 'System'], ['light', 'Light'], ['dark', 'Dark']]} /></Field>
            <Field label="Accent color">
              <div className="color-swatches" role="group" aria-label="Accent color">
                {ACCENT_PRESETS.map((p) => (
                  <button key={p.id} className="swatch" style={{ background: p.hex }} aria-pressed={b.prefs.accent === p.hex} aria-label={p.name} onClick={() => pickAccent(p.hex)} />
                ))}
                <label className="swatch custom" aria-label="Custom color" title="Custom color" style={ACCENT_PRESETS.some((p) => p.hex === b.prefs.accent) ? undefined : { background: b.prefs.accent, boxShadow: '0 0 0 2px var(--ink)' }}>
                  <input type="color" defaultValue={b.prefs.accent} onChange={(e) => dragAccent(e.target.value)} />
                </label>
              </div>
              <div className="row" style={{ marginTop: 10, gap: 8 }}>
                <span className="pill" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>Preview</span>
                <button className="btn small" style={{ background: 'var(--accent-strong)' }} tabIndex={-1} aria-hidden="true">Button</button>
              </div>
            </Field>
          </section>
          <section className="card stack">
            <h2 className="t-head">Your day</h2>
            <div className="form-grid">
              <TimeField label="Wake up" value={s.wakeTime} onChange={(v) => save({ wakeTime: v })} />
              <TimeField label="Sleep" value={s.sleepTime} onChange={(v) => save({ sleepTime: v })} />
              <Commit label="Session (min)" type="number" min={20} max={120} value={s.sessionMin} onCommit={(v) => save({ sessionMin: Number(v) })} />
              <Commit label="Break (min)" type="number" min={0} max={60} value={s.breakMin} onCommit={(v) => save({ breakMin: Number(v) })} />
              <Commit label="Long break (min)" type="number" min={0} max={90} value={s.longBreakMin} onCommit={(v) => save({ longBreakMin: Number(v) })} />
              <Commit label="Daily cap (hours)" type="number" min={1} max={16} step={0.5} value={hours(s.dailyCapMin)} onCommit={(v) => save({ dailyCapMin: Math.round(Number(v) * 60) })} />
            </div>
          </section>
        </div>

        <section className="card">
          <div className="row"><h2 className="t-head grow">Commitments</h2><button className="btn ghost small" onClick={() => setBulk('commitments')}>Import</button><button className="btn secondary small" onClick={() => { setCommitment(null); setCOpen(true); }}><Plus size={16} /> Add</button></div>
          {b.commitments.length === 0 ? <p className="t-cap" style={{ marginTop: 8 }}>Classes, shifts and training that {APP_NAME} plans around. Add them one by one, or tap Import to paste a whole timetable from a CSV or calendar file.</p> : (
            <div className="list" style={{ marginTop: 8 }}>
              {b.commitments.map((c) => (
                <button key={c.id} className="list-row link" style={{ textAlign: 'left' }} onClick={() => { setCommitment(c); setCOpen(true); }}>
                  <div className="grow"><b>{c.label}</b><div className="t-cap">{c.days.map((d) => WEEKDAYS[d - 1]).join(' ')} · {c.start} to {c.end}</div></div>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="t-head">Meals</h2>
          <div className="list" style={{ marginTop: 8 }}>
            {s.meals.map((m, i) => (
              <div key={i} className="list-row">
                <input className="input grow" aria-label="Meal name" defaultValue={m.label} onBlur={(e) => e.target.value !== m.label && e.target.value.trim() && save({ meals: s.meals.map((x, j) => (j === i ? { ...x, label: e.target.value.trim() } : x)) })} />
                <input className="input tnum" style={{ width: 96 }} inputMode="numeric" maxLength={5} aria-label="Meal time" defaultValue={m.time} onBlur={(e) => { const t = /^([01]?\d|2[0-3]):?([0-5]\d)$/.exec(e.target.value.trim()); if (t) { const v = `${t[1]!.padStart(2, '0')}:${t[2]}`; e.target.value = v; if (v !== m.time) save({ meals: s.meals.map((x, j) => (j === i ? { ...x, time: v } : x)) }); } else e.target.value = m.time; }} />
                <button className="btn ghost small icon" aria-label={`Remove ${m.label}`} onClick={() => save({ meals: s.meals.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
          <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => save({ meals: [...s.meals, { label: 'Snack', time: '16:00', durationMin: 20 }] })}><Plus size={16} /> Add meal</button>
        </section>

        <section className="card">
          <div className="row"><h2 className="t-head grow">Courses</h2></div>
          <div className="list" style={{ marginTop: 8 }}>
            {b.courses.map((c) => (
              <button key={c.id} className="list-row link" style={{ textAlign: 'left' }} onClick={() => setCourse(c)}>
                <span className="dot" style={{ background: cvar(c.color) }} />
                <div className="grow"><b>{c.code}</b> <span className="t-cap">{c.name}</span></div>
                <span className="t-cap">{b.topics.filter((t) => t.courseId === c.id).length} topics</span>
              </button>
            ))}
            {b.courses.length === 0 && <p className="t-cap">Courses appear when you add an exam.</p>}
          </div>
        </section>

        <section className="card stack">
          <h2 className="t-head">Notifications</h2>
          <div className="row"><span className="grow">Morning plan</span><Switch label="Morning plan notification" checked={s.emailEnabled} onChange={(v) => save({ emailEnabled: v })} /></div>
          {s.emailEnabled && <TimeField label="Morning plan arrives at" value={s.emailTime} onChange={(v) => save({ emailTime: v })} />}
          <div className="row"><span className="grow">When a study session starts</span><Switch label="Session reminders" checked={b.prefs.sessionReminders} onChange={(v) => prefsMut.mutate({ sessionReminders: v })} /></div>
          {b.prefs.sessionReminders && (
            <Field label="Remind me">
              <Seg label="Reminder lead time" value={b.prefs.sessionLeadMin} onChange={(v) => prefsMut.mutate({ sessionLeadMin: v })} options={[[0, 'At start'], [5, '5 min'], [10, '10 min'], [15, '15 min']]} />
            </Field>
          )}
          {b.notifications.permission === 'denied' && (
            <div className="banner" role="status"><Bell size={18} /><div>Notifications are blocked for {APP_NAME}. Turn them on in your phone&apos;s Settings.</div></div>
          )}
          {b.notifications.permission === 'unsupported' && (
            <div className="banner" role="status"><Bell size={18} /><div>Notifications work in the installed app, not in a browser.</div></div>
          )}
          <p className="t-cap">Reminders for the next few days are scheduled on your phone, so they arrive even when the app is closed. Open {APP_NAME} now and then so they stay up to date, and when you tick a session off its reminder is removed.</p>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            {b.notifications.permission !== 'granted' && <button className="btn small" onClick={() => allow.mutate()} disabled={allow.isPending}>Allow notifications</button>}
            <button className="btn secondary small" onClick={() => test.mutate()} disabled={test.isPending}>Send a test</button>
          </div>
        </section>

        <section className="card stack">
          <h2 className="t-head">Data</h2>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn secondary small" onClick={() => setImpOpen(true)}>Import exams</button>
            <button className="btn secondary small" onClick={() => setBulk('topics')}>Import courses and topics</button>
            {b.exams.length === 0 && b.courses.length === 0 && b.commitments.length === 0 && <button className="btn secondary small" onClick={() => demo.mutate()}>Load demo data</button>}
            <button className="btn secondary small" onClick={() => setBackupOpen(true)}>Backup and restore</button>
          </div>
        </section>
      </div>
      <CommitmentSheet item={commitment} open={cOpen} onClose={() => setCOpen(false)} />
      <CourseSheet boot={b} course={course} open={!!course} onClose={() => setCourse(null)} />
      <ImportSheet open={impOpen} onClose={() => setImpOpen(false)} />
      <BackupSheet open={backupOpen} onClose={() => setBackupOpen(false)} />
      <BulkImportSheet key={bulk ?? 'commitments'} mode={bulk ?? 'commitments'} open={bulk !== null} onClose={() => setBulk(null)} hasPlaceholders={b.topics.some((t) => ['Lectures 1-3', 'Lectures 4-6', 'Lectures 7-9', 'Problem sets', 'Past paper themes'].includes(t.title))} />
    </>
  );
};
