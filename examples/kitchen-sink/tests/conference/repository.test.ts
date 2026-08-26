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
  it.effect('migrates, seeds, and transactionally toggles agenda membership', () =>
    Effect.gen(function* () {
      const repository = yield* ConferenceRepository;

      expect(yield* repository.selectedSessionIds).toEqual(
        new Set(['mutation-protocols-that-compose', 'server-components-from-first-principles']),
      );

      expect(yield* repository.toggleAgenda('mutation-protocols-that-compose')).toEqual({
        selected: false,
      });
      expect(yield* repository.toggleAgenda('mutation-protocols-that-compose')).toEqual({
        selected: true,
      });
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
