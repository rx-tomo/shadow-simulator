import { afterEach, describe, expect, test, vi } from 'vitest';

const originalDocument = global.document;
const originalWindow = global.window;

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
  global.document = originalDocument;
  global.window = originalWindow;
});

describe('loading fallback telemetry', () => {
  test('reports one non-PII bootstrap timeout when the app has not cleared the overlay', async () => {
    vi.useFakeTimers();
    const track = vi.fn();
    const overlay = { classList: { add: vi.fn(), contains: vi.fn(() => false) } };
    global.window = { shadowAnalytics: { track } };
    global.document = {
      readyState: 'complete',
      getElementById: vi.fn(() => overlay),
    };

    await import('../public/loading-fallback.js');
    await vi.advanceTimersByTimeAsync(16000);

    expect(track).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('app_bootstrap_timeout', { stage: 'bootstrap' });
    expect(overlay.classList.add).toHaveBeenCalledWith('hidden');
  });

  test('does not fail when analytics is absent', async () => {
    vi.useFakeTimers();
    global.window = {};
    global.document = {
      readyState: 'complete',
      getElementById: vi.fn(() => ({ classList: { add: vi.fn(), contains: vi.fn(() => false) } })),
    };

    await import('../public/loading-fallback.js');
    await vi.advanceTimersByTimeAsync(8000);
  });
});
