import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import { Effect, Layer } from 'effect';

import { BrowserNavigation } from './browser-navigation';
import { showBrowserFailure, showUnsupportedBrowser } from './browser-screen';
import { ClientRuntime } from './client-runtime';
import { hydrate } from './hydrate';

const ClientLayer = Layer.mergeAll(BrowserNavigation.layer, ClientRuntime.layer).pipe(
  Layer.provide(BrowserHttpClient.layerFetch),
);

const renderBrowserFailure = Effect.sync(showBrowserFailure);
const renderUnsupportedBrowser = Effect.sync(showUnsupportedBrowser);

export const browserApplication = hydrate.pipe(
  Effect.provide(ClientLayer),
  Effect.catchTags({
    BrowserHydrationError: () => renderBrowserFailure,
    BrowserRootHydrationError: () => renderBrowserFailure,
    NavigationApiUnavailableError: () => renderUnsupportedBrowser,
    NavigationPrecommitUnavailableError: () => renderUnsupportedBrowser,
  }),
);
