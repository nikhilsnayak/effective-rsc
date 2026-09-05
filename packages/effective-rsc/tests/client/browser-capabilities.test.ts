import { afterEach, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';

import { navigationMode } from '../../src/client/browser-capabilities';

afterEach(() => {
  vi.unstubAllGlobals();
});

it.effect('uses document navigation without the Navigation API', () => {
  vi.stubGlobal('window', {});
  return navigationMode.pipe(Effect.map((mode) => expect(mode).toBe('Document')));
});

it.effect('uses document navigation without navigation precommit', () => {
  vi.stubGlobal('window', { navigation: new EventTarget() });
  return navigationMode.pipe(Effect.map((mode) => expect(mode).toBe('Document')));
});

it.effect('uses client navigation when both APIs are available', () => {
  vi.stubGlobal('window', {
    navigation: new EventTarget(),
    NavigationPrecommitController: class {},
  });
  return navigationMode.pipe(Effect.map((mode) => expect(mode).toBe('Client')));
});
