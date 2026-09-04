import { describe, expect, it } from '@effect/vitest';
import { Effect, Fiber, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { SqlError, UnknownError } from 'effect/unstable/sql/SqlError';

import { FixtureRepository } from '@/modules/fixture/repository';
import { FixtureService } from '@/modules/fixture/service';

const RepositoryLayer = FixtureRepository.layerTest({
  selectedItemIds: Effect.succeed(new Set(['document-stream'])),
  toggleSelection: (itemId) => Effect.succeed({ selected: itemId.length > 0 }),
});
const ServiceLayer = FixtureService.layer.pipe(Layer.provide(RepositoryLayer));

describe('FixtureService', () => {
  it.effect('joins SQL-owned selection membership into fixture domain models', () =>
    Effect.gen(function* () {
      const service = yield* FixtureService;
      const selectionFiber = yield* Effect.forkChild(service.selection);
      const catalogFiber = yield* Effect.forkChild(service.catalog('primary'));

      yield* TestClock.adjust('2 seconds');

      const selection = yield* Fiber.join(selectionFiber);
      const catalog = yield* Fiber.join(catalogFiber);

      expect(selection.data.map((item) => item.id)).toEqual(['document-stream']);
      expect(catalog.data.items[0]?.isSelected).toBe(true);
      expect(catalog.data.items[1]?.isSelected).toBe(false);
      const missingItem = yield* service.toggleSelection('missing-item');
      expect(missingItem).toBeNull();
    }).pipe(Effect.provide(ServiceLayer)),
  );

  it.effect('maps repository failures to the domain error', () =>
    Effect.gen(function* () {
      const failure = new SqlError({
        reason: new UnknownError({ cause: new Error('database unavailable') }),
      });
      const serviceLayer = FixtureService.layer.pipe(
        Layer.provide(
          FixtureRepository.layerTest({
            selectedItemIds: Effect.fail(failure),
          }),
        ),
      );
      const error = yield* Effect.gen(function* () {
        const service = yield* FixtureService;
        return yield* service.selection;
      }).pipe(Effect.provide(serviceLayer), Effect.flip);

      expect(error._tag).toBe('@effective-rsc/framework-e2e/fixture/FixtureUnavailable');
      expect(error.operation).toBe('load selection');
    }),
  );
});
