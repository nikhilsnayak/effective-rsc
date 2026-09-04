import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { AttendeeRepository } from '@/modules/attendee/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = AttendeeRepository.layer.pipe(Layer.provideMerge(PersistenceLayer));

describe('AttendeeRepository', () => {
  it.effect('resolves a session and scopes ticket access to its attendee email', () =>
    Effect.gen(function* () {
      const repository = yield* AttendeeRepository;
      const sql = yield* SqlClient;
      const email = yield* repository.resolveSession('demo-attendee-ada', '2026-09-03T12:00:00Z');
      expect(email).toBe('ada@example.test');

      const stableFixture = yield* repository.resolveSession(
        'demo-attendee-ada',
        '2099-01-02T00:00:00Z',
      );
      expect(stableFixture).toBe('ada@example.test');

      yield* sql`
        INSERT INTO attendee_sessions (token, attendee_email, expires_at, created_at)
        VALUES (
          'expired-attendee-session',
          'ada@example.test',
          '2026-09-03T12:00:00Z',
          '2026-09-01T12:00:00Z'
        )
      `;
      const expired = yield* repository.resolveSession(
        'expired-attendee-session',
        '2026-09-04T00:00:00Z',
      );
      expect(expired).toBeNull();

      const tickets = yield* repository.listTickets('ada@example.test');
      expect(tickets.map((ticket) => ticket.code)).toEqual(['GTH-DEMOADA0001']);

      const owned = yield* repository.findTicket('ada@example.test', 'GTH-DEMOADA0001');
      expect(owned?.holderName).toBe('Ada Lovelace');
      const hidden = yield* repository.findTicket('somebody@example.test', 'GTH-DEMOADA0001');
      expect(hidden).toBeNull();

      const updated = yield* repository.updateHolderName(
        'ada@example.test',
        'ticket-demo-ada',
        'Ada Byron',
        '2026-09-03T12:01:00Z',
      );
      expect(updated).toBe(true);
      const renamed = yield* repository.findTicket('ada@example.test', 'GTH-DEMOADA0001');
      expect(renamed?.holderName).toBe('Ada Byron');
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('exposes only delivered transactional email in the local mailbox', () =>
    Effect.gen(function* () {
      const repository = yield* AttendeeRepository;
      const messages = yield* repository.listDeliveredEmail('ada@example.test');

      expect(messages).toHaveLength(1);
      expect(messages[0]?.subject).toBe('Your Effect Systems Summit ticket');
      const pending = yield* repository.listPendingEmail('ada@example.test');
      expect(pending).toEqual([]);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
