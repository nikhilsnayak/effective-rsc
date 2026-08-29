import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime';
import { Effect } from 'effect';

import { browserApplication } from '../client/application';
import { devHmrClient } from './hmr-client';

const program = Effect.all([browserApplication, devHmrClient], {
  concurrency: 'unbounded',
  discard: true,
});

BrowserRuntime.runMain(program);
