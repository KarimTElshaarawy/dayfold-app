import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

/** Shown while data that could not be read at launch is still parked on the device. */
export const UnreadableBanner = () => {
  const qc = useQueryClient();
  const discard = useMutation({
    mutationFn: () => api('POST', '/api/backup/discard-unreadable'),
    onSuccess: () => void qc.invalidateQueries(),
  });
  return (
    <div className="banner" style={{ marginBottom: 16 }} role="alert">
      <TriangleAlert size={18} />
      <div>
        <div>Dayfold could not read your saved data and started fresh. The old data is kept. In Settings, Backup and restore, tap &quot;Load data saved from a failed start&quot;, copy the text and keep it.</div>
        <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
          <Link className="btn secondary small" to="/settings">Open Settings</Link>
          <button className="btn ghost small" onClick={() => discard.mutate()}>Discard it</button>
        </div>
      </div>
    </div>
  );
};
