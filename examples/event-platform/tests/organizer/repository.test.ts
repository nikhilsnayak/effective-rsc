import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { OrganizerRepository } from '@/modules/organizer/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = OrganizerRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('OrganizerRepository', () => {
  it.effect('loads membership-scoped events and atomically changes their status', () =>
    Effect.gen(function* () {
      const repository = yield* OrganizerRepository;
      const dashboard = yield* repository.loadDashboard('user-nikhil');

      expect(dashboard?.user.name).toBe('Nikhil Nayak');
      expect(
        dashboard?.organizations.map(({ organizationSlug, role }) => ({ organizationSlug, role })),
      ).toEqual([
        { organizationSlug: 'effective-rsc', role: 'owner' },
        { organizationSlug: 'runtime-collective', role: 'check_in_staff' },
      ]);
      expect(dashboard?.events.map((event) => event.status)).toEqual([
        'draft',
        'published',
        'completed',
      ]);

      const access = yield* repository.findEventAccess(
        'user-nikhil',
        'event-rsc-workshop-lab-2026',
      );
      expect(access?.role).toBe('owner');
      expect(access?.status).toBe('draft');

      const updated = yield* repository.compareAndSetEventStatus(
        'user-nikhil',
        'event-rsc-workshop-lab-2026',
        'draft',
        'published',
        '2026-09-03T12:00:00Z',
      );
      expect(updated).toBe(true);

      const staleUpdate = yield* repository.compareAndSetEventStatus(
        'user-nikhil',
        'event-rsc-workshop-lab-2026',
        'draft',
        'cancelled',
        '2026-09-03T12:01:00Z',
      );
      expect(staleUpdate).toBe(false);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
