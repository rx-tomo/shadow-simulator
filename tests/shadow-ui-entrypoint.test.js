import { execFileSync } from 'node:child_process';
import { describe, expect, test } from 'vitest';

describe('shadow-ui entrypoint', () => {
  test('loads after the immutable R2 source removes the fallback runtime', () => {
    expect(() => execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import('./public/shadow-ui.js')",
    ], { cwd: new URL('..', import.meta.url), stdio: 'pipe' })).not.toThrow();
  });
});
