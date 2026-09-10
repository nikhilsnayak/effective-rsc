import { expect, it } from '@effect/vitest';
import { Effect, Fiber } from 'effect';
import { TestClock } from 'effect/testing';

import { QueryControl } from '@/modules/fixture/query-control';

it.effect('holds a query past its normal delay until the test releases it', () =>
  Effect.gen(function* () {
    const control = yield* QueryControl;
    yield* control.hold('catalog-primary');
    const pending = yield* control
      .delay('catalog-primary', '2 seconds')
      .pipe(Effect.forkChild({ startImmediately: true }));
    yield* TestClock.adjust('10 seconds');
    const waiting = yield* control.waiting('catalog-primary');
    expect(waiting).toBe(1);

    yield* control.release('catalog-primary');
    yield* Fiber.join(pending);
    const remaining = yield* control.waiting('catalog-primary');
    expect(remaining).toBe(0);
  }).pipe(Effect.provide(QueryControl.layer)),
);

it.effect('interrupts a held request without releasing another request', () =>
  Effect.gen(function* () {
    const control = yield* QueryControl;
    yield* control.hold('catalog-primary');
    const first = yield* control
      .delay('catalog-primary', '2 seconds')
      .pipe(Effect.forkChild({ startImmediately: true }));
    const second = yield* control
      .delay('catalog-primary', '2 seconds')
      .pipe(Effect.forkChild({ startImmediately: true }));
    yield* Fiber.interrupt(first);
    const waiting = yield* control.waiting('catalog-primary');
    expect(waiting).toBe(1);
    yield* control.release('catalog-primary');
    yield* Fiber.join(second);

    const heldAgain = yield* control.hold('catalog-primary');
    expect(heldAgain).toBe(true);
    yield* control.release('catalog-primary');
  }).pipe(Effect.provide(QueryControl.layer)),
);
