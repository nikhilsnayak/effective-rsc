import { beforeEach, expect, it } from '@effect/vitest';
import { vi } from 'vitest';

import { findDevSourceMapURL } from '../../src/dev/source-map';

beforeEach(() => {
  vi.stubGlobal('location', { origin: 'https://effective-rsc.test' });
});

it('constructs an encoded same-origin development source-map URL', () => {
  expect(findDevSourceMapURL('/workspace/main value.js', 'Server')).toBe(
    'https://effective-rsc.test/_ersc/dev/source-map?fileName=%2Fworkspace%2Fmain+value.js&environmentName=Server',
  );
});
