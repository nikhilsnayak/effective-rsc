import { afterEach, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';

import {
  checkBrowserCapabilities,
  NavigationApiUnavailableError,
  NavigationPrecommitUnavailableError,
} from '../../src/client/browser-capabilities';

afterEach(() => {
  vi.unstubAllGlobals();
});

it.effect('fails explicitly when the browser does not provide the Navigation API', () => {
  vi.stubGlobal('window', {});
  return checkBrowserCapabilities.pipe(
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(NavigationApiUnavailableError);
    }),
  );
});

it.effect('fails explicitly when the browser does not provide navigation precommit', () => {
  vi.stubGlobal('window', { navigation: new EventTarget() });
  return checkBrowserCapabilities.pipe(
    Effect.flip,
    Effect.map((error) => {
      expect(error).toBeInstanceOf(NavigationPrecommitUnavailableError);
    }),
  );
});
