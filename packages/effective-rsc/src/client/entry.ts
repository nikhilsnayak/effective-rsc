import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import * as BrowserRuntime from '@effect/platform-browser/BrowserRuntime';
import { Effect, Layer } from 'effect';

import { BrowserNavigation } from './browser-navigation';
import { ClientRuntime } from './client-runtime';
import { hydrate } from './hydrate';

const ClientLayer = Layer.mergeAll(BrowserNavigation.layer, ClientRuntime.layer).pipe(
  Layer.provide(BrowserHttpClient.layerFetch),
);

BrowserRuntime.runMain(hydrate.pipe(Effect.provide(ClientLayer)));
