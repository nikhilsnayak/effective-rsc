import { afterEach, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { vi } from 'vitest';

import { NavigationApi } from '../../src/client/navigation-api';

afterEach(() => vi.unstubAllGlobals());

it.effect('supports document refresh without the Navigation API', () => {
  const location = {
    href: 'https://effective-rsc.test/catalog/primary',
    reload: vi.fn(),
    replace: vi.fn(),
  };
  vi.stubGlobal('window', { location });
  return Effect.gen(function* () {
    const api = yield* NavigationApi;
    expect(api.getCurrentEntry()).toBeNull();
    expect(api.getTransition()).toBeNull();
    expect(api.getCurrentUrl()).toBe(location.href);
    const unsubscribe = api.subscribe(vi.fn());
    unsubscribe();
    api.reloadDocument();
    api.replaceDocument('/catalog/secondary');
    expect(location.reload).toHaveBeenCalledOnce();
    expect(location.replace).toHaveBeenCalledWith('/catalog/secondary');
  }).pipe(Effect.provide(NavigationApi.layer));
});

it.effect('subscribes and unsubscribes when the Navigation API is available', () => {
  const navigation = new EventTarget();
  vi.stubGlobal('window', { navigation });
  return Effect.gen(function* () {
    const api = yield* NavigationApi;
    const listener = vi.fn();
    const unsubscribe = api.subscribe(listener);
    navigation.dispatchEvent(new Event('navigate'));
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    navigation.dispatchEvent(new Event('navigate'));
    expect(listener).toHaveBeenCalledOnce();
  }).pipe(Effect.provide(NavigationApi.layer));
});
