import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { ConferenceRepository } from '../../src/modules/conference/repository';
import { runMigrations } from '../../src/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = ConferenceRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('ConferenceRepository', () => {
  it.effect('migrates, seeds, and toggles agenda membership', () =>
    Effect.gen(function* () {
      const repository = yield* ConferenceRepository;

      const selectedSessionIds = yield* repository.selectedSessionIds;
      expect(selectedSessionIds).toEqual(
        new Set(['mutation-protocols-that-compose', 'server-components-from-first-principles']),
      );

      const removed = yield* repository.toggleAgenda('mutation-protocols-that-compose');
      expect(removed).toEqual({
        selected: false,
      });
      const restored = yield* repository.toggleAgenda('mutation-protocols-that-compose');
      expect(restored).toEqual({
        selected: true,
      });
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
