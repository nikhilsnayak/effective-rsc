import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime';
import { Effect } from 'effect';

import { hydrate } from './hydrate';

BrowserRuntime.runMain(hydrate.pipe(Effect.provide(BrowserHttpClient.layerFetch)));
