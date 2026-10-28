import { afterEach, describe, expect, it, vi } from 'vitest';

const write = vi.fn();
vi.mock('@capacitor/clipboard', () => ({ Clipboard: { write: (o: unknown) => write(o) } }));
let native = false;
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native } }));

const { copyText } = await import('../src/lib/clipboard');

afterEach(() => {
  write.mockReset();
  vi.unstubAllGlobals();
  native = false;
});

describe('copyText', () => {
  it('uses the phone clipboard on a device', async () => {
    native = true;
    write.mockResolvedValue(undefined);
    expect(await copyText('abc')).toBe(true);
    expect(write).toHaveBeenCalledWith({ string: 'abc' });
  });

  it('falls back to the browser clipboard when the plugin fails', async () => {
    native = true;
    write.mockRejectedValue(new Error('no plugin'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('abc')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('abc');
  });

  it('falls back to the legacy copy, gives focus back, and reports false when nothing works', async () => {
    const focus = vi.fn();
    class FakeEl { focus = focus; }
    const active = new FakeEl();
    const area = { value: '', style: { cssText: '' }, setAttribute: vi.fn(), select: vi.fn(), setSelectionRange: vi.fn(), remove: vi.fn() };
    const execCommand = vi.fn().mockReturnValue(false);
    vi.stubGlobal('HTMLElement', FakeEl);
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    vi.stubGlobal('document', { activeElement: active, createElement: () => area, body: { appendChild: vi.fn() }, execCommand });
    expect(await copyText('abc')).toBe(false);
    expect(area.remove).toHaveBeenCalled();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    execCommand.mockReturnValue(true);
    expect(await copyText('abc')).toBe(true);
  });
});
