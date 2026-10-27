import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useToast } from './Toast';
import { APP_NAME } from '../lib/appInfo';

/** Shown while data that could not be read at launch is still parked on the device. Works before setup too. */
export const UnreadableBanner = () => {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const show = useMutation({
    mutationFn: () => api<{ data: string | null }>('GET', '/api/backup/unreadable'),
    onSuccess: (r) => setText(r.data ?? ''),
  });
  const discard = useMutation({
    mutationFn: () => api('POST', '/api/backup/discard-unreadable'),
    onSuccess: () => void qc.invalidateQueries(),
  });
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text ?? '');
      toast('Copied. Paste it into Notes to keep it.');
    } catch {
      toast('Select the text and copy it.');
    }
  };
  const confirmDiscard = (): void => {
    if (window.confirm('Delete the saved data for good? Copy it first if you might need it.')) discard.mutate();
  };
  return (
    <div className="banner" style={{ marginBottom: 16 }} role="alert">
      <TriangleAlert size={18} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div>{APP_NAME} could not read your saved data and started fresh. The old data is kept on this phone.</div>
        {text !== null && (
          <>
            <textarea className="textarea" readOnly aria-label="Saved data" value={text} style={{ marginTop: 8 }} />
            <button className="btn secondary small" style={{ marginTop: 8 }} onClick={() => void copy()}>Copy this text</button>
          </>
        )}
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          {text === null && <button className="btn secondary small" onClick={() => show.mutate()}>Show saved data</button>}
          <button className="btn ghost small" onClick={confirmDiscard}>Discard it</button>
        </div>
      </div>
    </div>
  );
};
