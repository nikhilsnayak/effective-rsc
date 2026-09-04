import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { FixtureRepository } from '@/modules/fixture/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = FixtureRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('FixtureRepository', () => {
  it.effect('migrates, seeds, and toggles selection membership', () =>
    Effect.gen(function* () {
      const repository = yield* FixtureRepository;

      const selectedItemIds = yield* repository.selectedItemIds;
      expect(selectedItemIds).toEqual(new Set(['document-stream', 'server-function-mutation']));

      const removed = yield* repository.toggleSelection('server-function-mutation');
      expect(removed).toEqual({
        selected: false,
      });
      const restored = yield* repository.toggleSelection('server-function-mutation');
      expect(restored).toEqual({
        selected: true,
      });
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
