import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../lib/api';
import { WEEKDAYS } from '../lib/format';
import { Sheet } from './Sheet';
import { useToast } from './Toast';
import { Seg } from './ui';

export type BulkMode = 'commitments' | 'topics';

interface CommitmentItem {
  label: string;
  kind: string;
  days: number[];
  start: string;
  end: string;
}
interface TopicItem {
  course: string;
  name?: string;
  topic: string;
}
interface Preview {
  items: Array<CommitmentItem | TopicItem>;
  errors: string[];
}

const TEMPLATES: Record<BulkMode, string> = {
  commitments: 'label,kind,days,start,end\nLectures,class,Mon;Wed,10:30,12:00\nPart-time shift,work,Tue;Thu,14:00,18:00\nGym,training,Mon;Wed;Fri,17:30,18:30\n',
  topics: 'course,name,topic\nCSC230,Data Structures,Linked lists\nCSC230,Data Structures,Trees and graphs\nMTH210,Linear Algebra,Eigenvalues\n',
};

const COPY: Record<BulkMode, { title: string; hint: string; placeholder: string }> = {
  commitments: {
    title: 'Import classes and shifts',
    hint: 'One row per class, shift or training. Days can be Mon;Wed or 1;3 or weekdays. Times are 24 hour or like 2:30pm. From a calendar app, export a .ics file: weekly repeating events become rows.',
    placeholder: 'label,kind,days,start,end\nLectures,class,Mon;Wed,10:30,12:00',
  },
  topics: {
    title: 'Import courses and topics',
    hint: 'Columns: course code, course name (optional), topic (optional). A row with only a code and a name adds the course; each topic row adds one topic. Courses that do not exist yet are created.',
    placeholder: 'course,name,topic\nCSC230,Data Structures,Linked lists',
  },
};

const describe = (mode: BulkMode, item: CommitmentItem | TopicItem): { title: string; sub: string } => {
  if (mode === 'topics') {
    const t = item as TopicItem;
    return { title: t.topic || t.name || t.course, sub: t.topic ? `${t.course}${t.name ? ' · ' + t.name : ''}` : `${t.course} · new course` };
  }
  const c = item as CommitmentItem;
  return { title: c.label, sub: `${c.days.map((d) => WEEKDAYS[d - 1]).join(' ')} · ${c.start} to ${c.end}` };
};

export const BulkImportSheet = ({ mode, open, onClose, hasPlaceholders = false }: { mode: BulkMode; open: boolean; onClose: () => void; hasPlaceholders?: boolean }) => {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState<'csv' | 'ics'>('csv');
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const copy = COPY[mode];
  const base = `/api/import/${mode}`;
  const run = useMutation({ mutationFn: () => api<Preview>('POST', `${base}/preview`, { kind: mode === 'topics' ? 'csv' : kind, text }), onSuccess: setPreview });
  const commit = useMutation({
    mutationFn: () => api<{ created: number }>('POST', `${base}/commit`, { items: preview?.items ?? [], replacePlaceholders: mode === 'topics' && replace }),
    onSuccess: (r) => {
      void qc.invalidateQueries();
      toast(r.created === 0 ? 'Nothing new to add' : `Added ${r.created}`);
      setPreview(null);
      setText('');
      onClose();
    },
  });
  const onFile = async (f: File | undefined): Promise<void> => {
    if (!f) return;
    if (mode === 'commitments') setKind(f.name.toLowerCase().endsWith('.ics') ? 'ics' : 'csv');
    setText(await f.text());
    setPreview(null);
  };
  const copyTemplate = async (): Promise<void> => {
    setText(TEMPLATES[mode]);
    setPreview(null);
    try {
      await navigator.clipboard.writeText(TEMPLATES[mode]);
      toast('Template copied and pasted below. Edit it, then Preview.');
    } catch {
      toast('Template pasted below. Edit it, then Preview.');
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={copy.title}>
      <div className="stack">
        <p className="t-cap">{copy.hint}</p>
        {mode === 'commitments' && <Seg label="Format" value={kind} onChange={setKind} options={[['csv', 'CSV'], ['ics', 'Calendar (.ics)']]} />}
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <label className="btn secondary small" style={{ cursor: 'pointer' }}>
            Choose file
            <input type="file" accept={mode === 'commitments' ? '.csv,.ics,text/csv,text/calendar' : '.csv,text/csv,text/plain'} className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <button className="btn ghost small" onClick={() => void copyTemplate()}>Use a template</button>
        </div>
        <textarea className="textarea" aria-label="Paste data" placeholder={copy.placeholder} value={text} onChange={(e) => { setText(e.target.value); setPreview(null); }} />
        <button className="btn secondary" disabled={!text.trim() || run.isPending} onClick={() => run.mutate()}>Preview</button>
        {run.error && <div className="banner" role="alert">{run.error.message}</div>}
        {commit.error && <div className="banner" role="alert">{commit.error.message}</div>}
        {preview && (
          <>
            {preview.errors.length > 0 && <div className="banner" role="status"><div>{preview.errors.map((e) => <div key={e}>{e}</div>)}</div></div>}
            <div className="list" style={{ maxHeight: 240, overflow: 'auto' }}>
              {preview.items.map((it, n) => {
                const d = describe(mode, it);
                return (
                  <div key={n} className="list-row" style={{ minHeight: 48, padding: '8px 0' }}>
                    <div className="grow"><b>{d.title}</b><div className="t-cap">{d.sub}</div></div>
                  </div>
                );
              })}
            </div>
            {mode === 'topics' && hasPlaceholders && (
              <label className="row" style={{ gap: 10 }}>
                <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
                <span className="t-cap">Replace the placeholder topics (Lectures 1-3, Problem sets, ...) of these courses</span>
              </label>
            )}
            <button className="btn" disabled={preview.items.length === 0 || commit.isPending} onClick={() => commit.mutate()}>Add {preview.items.length}</button>
          </>
        )}
      </div>
    </Sheet>
  );
};
