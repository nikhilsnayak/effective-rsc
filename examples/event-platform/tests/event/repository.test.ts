import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { EventRepository } from '@/modules/event/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = EventRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('EventRepository', () => {
  it.effect('lists public events across organizations and resolves their public addresses', () =>
    Effect.gen(function* () {
      const repository = yield* EventRepository;

      const events = yield* repository.listPublic;
      expect(events.map((event) => event.eventId)).toEqual([
        'event-effective-rsc-conf-2026',
        'event-effect-systems-summit-2026',
      ]);
      expect(new Set(events.map((event) => event.organizationId)).size).toBe(2);

      const conference = yield* repository.findPublicBySlug(
        'effective-rsc',
        'effective-rsc-conf-2026',
      );
      expect(conference?.name).toBe('effective-rsc Conf');

      const missing = yield* repository.findPublicBySlug('effective-rsc', 'missing-event');
      expect(missing).toBeNull();
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
