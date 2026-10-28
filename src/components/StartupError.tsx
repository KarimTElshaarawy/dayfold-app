import { Preferences } from '@capacitor/preferences';
import { useState } from 'react';
import { Logo } from './Logo';
import { APP_NAME } from '../lib/appInfo';
import { copyText } from '../lib/clipboard';

const KEYS = ['dayfold-data-v1', 'dayfold-data-unreadable'];

/** Shown when the app cannot start. The stored data is never deleted unless the user taps Reset. */
export const StartupError = ({ error }: { error: unknown }) => {
  const [raw, setRaw] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const show = async (): Promise<void> => {
    const main = (await Preferences.get({ key: KEYS[0] as string })).value;
    const kept = (await Preferences.get({ key: KEYS[1] as string })).value;
    setRaw(main ?? kept ?? '(no stored data)');
  };
  const copy = async (): Promise<void> => {
    setMessage((await copyText(raw ?? '')) ? 'Copied. Paste it somewhere safe before resetting.' : 'Select the text and copy it.');
  };
  const reset = async (): Promise<void> => {
    if (!window.confirm(`Delete all ${APP_NAME} data on this device? Copy it first if you want to keep it.`)) return;
    for (const key of KEYS) await Preferences.remove({ key });
    try {
      localStorage.removeItem('dayfold-accent');
      localStorage.removeItem('dayfold-theme');
    } catch {
      // storage unavailable
    }
    window.location.reload();
  };
  return (
    <div className="center-screen top">
      <div className="wizard">
        <Logo size={40} />
        <h1 className="t-title">{APP_NAME} could not start</h1>
        <p className="muted">{error instanceof Error ? error.message : 'Something went wrong while opening your data.'} Your data has not been deleted.</p>
        <button className="btn" onClick={() => window.location.reload()}>Try again</button>
        <button className="btn secondary" onClick={() => void show()}>Show my data</button>
        {raw !== null && (
          <>
            <textarea className="textarea" aria-label="Stored data" readOnly value={raw} />
            <button className="btn secondary" onClick={() => void copy()}>Copy data</button>
          </>
        )}
        {message && <p className="t-cap">{message}</p>}
        <button className="btn danger" onClick={() => void reset()}>Reset app data</button>
      </div>
    </div>
  );
};
