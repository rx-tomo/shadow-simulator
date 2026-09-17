import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

describe('map lifecycle refresh ordering', () => {
  test('registers moveend refresh before restoring a shared URL and refreshes after idle', () => {
    const moveendListener = app.indexOf('map.on("moveend", (event) => {');
    const restore = app.indexOf('applyUrlParams(map, urlParams);');

    expect(moveendListener).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(moveendListener);
    expect(app.indexOf('map.once("idle", updateShadows);', restore)).toBeGreaterThan(restore);
  });
});
