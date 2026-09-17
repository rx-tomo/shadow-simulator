import { describe, expect, it, vi } from 'vitest';
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_STEPS,
  shouldShowOnboarding,
} from '../public/onboarding.js';

function createStorage(value = null) {
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn(),
  };
}

describe('onboarding visibility policy', () => {
  it('shows three task-oriented steps to a regular first visitor', () => {
    const storage = createStorage();

    expect(ONBOARDING_STEPS).toHaveLength(3);
    expect(ONBOARDING_STEPS.map((step) => step.title)).toEqual([
      '場所を決める',
      '日時を変える',
      '2つの状態を比べる',
    ]);
    expect(shouldShowOnboarding({ storage, search: '', width: 1024 })).toBe(true);
    expect(storage.getItem).toHaveBeenCalledWith(ONBOARDING_STORAGE_KEY);
  });

  it.each(['complete', 'skipped'])('does not show after %s is stored', (value) => {
    expect(shouldShowOnboarding({
      storage: createStorage(value),
      search: '',
      width: 390,
    })).toBe(false);
  });

  it('keeps the specialized X mobile guide as the only first-visit guide', () => {
    expect(shouldShowOnboarding({
      storage: createStorage(),
      search: '?utm_source=x',
      width: 390,
    })).toBe(false);
  });

  it('fails open when localStorage cannot be read', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('storage denied');
      }),
    };

    expect(shouldShowOnboarding({ storage, search: '', width: 1024 })).toBe(true);
  });
});
