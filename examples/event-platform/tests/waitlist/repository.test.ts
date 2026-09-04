import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { WaitlistRepository } from '@/modules/waitlist/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = WaitlistRepository.layer.pipe(Layer.provide(PersistenceLayer));

const joinInput = {
  attendeeEmail: 'grace@example.test',
  attendeeName: 'Grace Hopper',
  eventId: 'event-effect-systems-summit-2026',
  ticketTypeId: 'ticket-summit-lab',
};

describe('WaitlistRepository', () => {
  it.effect('joins a sold-out ticket waitlist idempotently', () =>
    Effect.gen(function* () {
      const repository = yield* WaitlistRepository;
      const joined = yield* repository.join(
        joinInput,
        'waitlist-test-grace',
        '2026-09-04T08:00:00Z',
      );
      expect(joined._tag).toBe('Joined');

      const repeated = yield* repository.join(
        joinInput,
        'waitlist-test-grace-repeated',
        '2026-09-04T08:00:01Z',
      );
      expect(repeated._tag).toBe('Existing');
      if (repeated._tag === 'Existing') {
        expect(repeated.entry.entryId).toBe('waitlist-test-grace');
      }
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('rejects waitlisting while a ticket can be purchased', () =>
    Effect.gen(function* () {
      const repository = yield* WaitlistRepository;
      const result = yield* repository.join(
        { ...joinInput, ticketTypeId: 'ticket-summit-community' },
        'waitlist-test-available',
        '2026-09-04T08:00:00Z',
      );
      expect(result).toEqual({ _tag: 'TicketAvailable' });
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('moves a waiting attendee to notified exactly once', () =>
    Effect.gen(function* () {
      const repository = yield* WaitlistRepository;
      yield* repository.join(joinInput, 'waitlist-test-notify', '2026-09-04T08:00:00Z');

      const notified = yield* repository.notify(
        'user-maya',
        joinInput.eventId,
        'waitlist-test-notify',
        '2026-09-04T08:05:00Z',
      );
      expect(notified?.entry.status).toBe('notified');
      expect(notified?.message.recipient).toBe(joinInput.attendeeEmail);

      const repeated = yield* repository.notify(
        'user-maya',
        joinInput.eventId,
        'waitlist-test-notify',
        '2026-09-04T08:06:00Z',
      );
      expect(repeated).toBeNull();
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
