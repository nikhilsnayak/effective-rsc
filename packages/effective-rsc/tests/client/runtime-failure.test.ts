import { expect, it } from '@effect/vitest';

import { fromBrowserError, fromUnhandledRejection } from '../../src/dev/runtime-failure';

it('normalizes browser errors for the development panel', () => {
  const error = new TypeError('Render failed');

  expect(fromBrowserError({ error, message: error.message })).toEqual({
    _tag: 'RuntimeError',
    name: 'TypeError',
    message: 'Render failed',
    stack: error.stack,
  });
  expect(fromBrowserError({ error: null, message: 'Script failed' })).toEqual({
    _tag: 'RuntimeError',
    name: 'Error',
    message: 'Script failed',
  });
});

it('normalizes rejected errors and values for the development panel', () => {
  const error = new Error('Request failed');

  expect(fromUnhandledRejection({ reason: error })).toEqual({
    _tag: 'UnhandledRejection',
    name: 'Error',
    message: 'Request failed',
    stack: error.stack,
  });
  expect(fromUnhandledRejection({ reason: { status: 500 } })).toEqual({
    _tag: 'UnhandledRejection',
    name: 'UnhandledRejection',
    message: '{\n  "status": 500\n}',
  });
});
