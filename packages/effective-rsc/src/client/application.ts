// oxlint-disable effecttsgo/process-env -- Rspack replaces NODE_ENV at compile time.
import * as BrowserHttpClient from '@effect/platform-browser/BrowserHttpClient';
import { Effect, Layer } from 'effect';

import { BrowserNavigation } from './browser-navigation';
import { showBrowserFailure } from './browser-screen';
import { ClientRuntime } from './client-runtime';
import { hydrate } from './hydrate';
import { ReactDOMRenderer } from './react-dom-renderer';

const ClientLayer = Layer.mergeAll(
  BrowserNavigation.layer,
  ReactDOMRenderer.layer.pipe(Layer.provideMerge(ClientRuntime.layer)),
).pipe(Layer.provide(BrowserHttpClient.layerFetch));

const renderBrowserFailure = Effect.sync(showBrowserFailure);

const skipHydration = (missingApi: string) =>
  process.env.NODE_ENV === 'development'
    ? Effect.logWarning(
        `effective-rsc did not hydrate because this browser does not provide ${missingApi}. The server-rendered document remains a plain multi-page application.`,
      )
    : Effect.void;

export const browserApplication = hydrate.pipe(
  Effect.provide(ClientLayer),
  Effect.catchTags({
    BrowserHydrationError: () => renderBrowserFailure,
    ReactDOMHydrationError: () => renderBrowserFailure,
    NavigationApiUnavailableError: () => skipHydration('the Navigation API'),
    NavigationPrecommitUnavailableError: () => skipHydration('NavigationPrecommitController'),
  }),
);
