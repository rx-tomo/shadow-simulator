import { describe, expect, it, vi } from 'vitest';
import { refreshAfterMapMove, shouldTrackMapInteraction } from '../public/analytics-policy.js';

describe('analytics event policy', () => {
  it('ignores programmatic map movement', () => {
    expect(shouldTrackMapInteraction(undefined)).toBe(false);
    expect(shouldTrackMapInteraction({})).toBe(false);
  });

  it('tracks map movement caused by browser input', () => {
    expect(shouldTrackMapInteraction({ originalEvent: new Event('mouseup') })).toBe(true);
    expect(shouldTrackMapInteraction({ originalEvent: new Event('touchend') })).toBe(true);
  });

  it('always refreshes shadow stats, but runs user-only work only for browser input', () => {
    const updateShadows = vi.fn();
    const onUserInteraction = vi.fn();

    expect(refreshAfterMapMove(undefined, { updateShadows, onUserInteraction })).toBe(false);
    expect(updateShadows).toHaveBeenCalledTimes(1);
    expect(onUserInteraction).not.toHaveBeenCalled();

    expect(refreshAfterMapMove(
      { originalEvent: new Event('pointerup') },
      { updateShadows, onUserInteraction },
    )).toBe(true);
    expect(updateShadows).toHaveBeenCalledTimes(2);
    expect(onUserInteraction).toHaveBeenCalledTimes(1);
  });
});
