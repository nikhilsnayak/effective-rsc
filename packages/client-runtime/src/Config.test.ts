import { assert, it } from '@effect/vitest';
import { Effect } from 'effect';
import { Atom, AtomRegistry } from 'effect/unstable/reactivity';

import { serverUrlAtom } from './Config.ts';

it.effect('retains a RegistryProvider-style initial value after the idle cleanup turn', () => {
  const configuredUrl = 'http://192.0.2.10:8008';
  const registry = AtomRegistry.make({
    initialValues: [Atom.initialValue(serverUrlAtom, configuredUrl)],
  });

  return Effect.gen(function* () {
    assert.strictEqual(registry.get(serverUrlAtom), configuredUrl);
    yield* Effect.yieldNow;
    assert.strictEqual(registry.get(serverUrlAtom), configuredUrl);
  }).pipe(Effect.ensuring(Effect.sync(() => registry.dispose())));
});
