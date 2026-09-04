import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { CheckInRepository } from '@/modules/check-in/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = CheckInRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('CheckInRepository', () => {
  it.effect('scopes credentials to staff membership and records reversible transitions', () =>
    Effect.gen(function* () {
      const repository = yield* CheckInRepository;
      const eventId = 'event-effect-systems-summit-2026';
      const ticketCode = 'GTH-DEMOADA0001';

      const event = yield* repository.loadEvent('user-nikhil', eventId);
      expect(event).toMatchObject({ checkedIn: 0, issued: 1, role: 'check_in_staff' });
      const hiddenEvent = yield* repository.loadEvent('unknown-user', eventId);
      expect(hiddenEvent).toBeNull();

      const ticket = yield* repository.findCredential('user-nikhil', eventId, ticketCode);
      expect(ticket?.holderName).toBe('Ada Lovelace');
      const hiddenTicket = yield* repository.findCredential('unknown-user', eventId, ticketCode);
      expect(hiddenTicket).toBeNull();

      const checkedIn = yield* repository.transitionCredential({
        action: 'check_in',
        eventId,
        expectedStatus: 'valid',
        recordedAt: '2026-09-03T12:00:00Z',
        staffUserId: 'user-nikhil',
        targetStatus: 'checked_in',
        ticketId: 'ticket-demo-ada',
      });
      expect(checkedIn).toBe(true);

      const repeated = yield* repository.transitionCredential({
        action: 'check_in',
        eventId,
        expectedStatus: 'valid',
        recordedAt: '2026-09-03T12:00:01Z',
        staffUserId: 'user-nikhil',
        targetStatus: 'checked_in',
        ticketId: 'ticket-demo-ada',
      });
      expect(repeated).toBe(false);
      const updatedEvent = yield* repository.loadEvent('user-nikhil', eventId);
      expect(updatedEvent).toMatchObject({ checkedIn: 1 });

      const undone = yield* repository.transitionCredential({
        action: 'undo',
        eventId,
        expectedStatus: 'checked_in',
        recordedAt: '2026-09-03T12:00:02Z',
        staffUserId: 'user-nikhil',
        targetStatus: 'valid',
        ticketId: 'ticket-demo-ada',
      });
      expect(undone).toBe(true);

      const audit = yield* repository.loadAudit('user-nikhil', eventId);
      expect(audit.map((entry) => entry.action)).toEqual(['undo', 'check_in']);
      expect(audit.every((entry) => entry.staffName === 'Nikhil Nayak')).toBe(true);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
