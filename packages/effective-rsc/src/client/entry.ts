import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime';

import { hydrate } from './hydrate';

BrowserRuntime.runMain(hydrate);
