import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { AttendeeRepository } from '@/modules/attendee/repository';
import type { CheckoutInput } from '@/modules/registration/model';
import { orderReceipt, RegistrationRepository } from '@/modules/registration/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = Layer.merge(RegistrationRepository.layer, AttendeeRepository.layer).pipe(
  Layer.provideMerge(PersistenceLayer),
);

const checkout = {
  answers: [{ answer: 'Engineer', questionId: 'question-summit-role' }],
  buyerEmail: 'ada@example.test',
  buyerName: 'Ada Lovelace',
  eventId: 'event-effect-systems-summit-2026',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  paymentMethod: 'approve',
  ticketTypeId: 'ticket-summit-community',
} satisfies CheckoutInput;

describe('RegistrationRepository', () => {
  it.effect('reserves inventory idempotently and issues one paid ticket', () =>
    Effect.gen(function* () {
      const repository = yield* RegistrationRepository;
      const attendees = yield* AttendeeRepository;
      const sql = yield* SqlClient;
      const before = yield* repository.listAvailable(checkout.eventId, '2026-09-03T12:00:00Z');
      expect(
        before.find((ticket) => ticket.ticketTypeId === checkout.ticketTypeId)?.available,
      ).toBe(59);

      const reservation = yield* repository.reserveOrder(
        checkout,
        'order-registration-test-1',
        '2026-09-03T12:00:00Z',
      );
      expect(reservation._tag).toBe('Reserved');

      const repeated = yield* repository.reserveOrder(
        checkout,
        'order-registration-test-duplicate',
        '2026-09-03T12:00:01Z',
      );
      expect(repeated._tag).toBe('Existing');

      const completed = yield* repository.completeOrder(
        'order-registration-test-1',
        'local-payment-test-1',
        'ticket-registration-test-1',
        'GTH-TEST00000001',
        'attendee-session-registration-test-1',
        '2026-09-03T12:00:02Z',
      );
      expect(completed === null ? null : orderReceipt(completed)?.ticketCode).toBe(
        'GTH-TEST00000001',
      );
      const pendingEmail = yield* attendees.listPendingEmail(checkout.buyerEmail);
      expect(pendingEmail.map((message) => message.emailId)).toEqual([
        'email-ticket-registration-test-1',
      ]);
      const attendeeEmail = yield* attendees.resolveSession(
        'attendee-session-registration-test-1',
        '2026-09-03T12:00:03Z',
      );
      expect(attendeeEmail).toBe(checkout.buyerEmail);
      const answers = yield* sql<{ readonly answer: string }>`
        SELECT answer
        FROM registration_answers
        WHERE order_id = 'order-registration-test-1'
          AND question_id = 'question-summit-role'
      `;
      expect(answers[0]?.answer).toBe('Engineer');

      const after = yield* repository.listAvailable(checkout.eventId, '2026-09-03T12:00:04Z');
      expect(after.find((ticket) => ticket.ticketTypeId === checkout.ticketTypeId)?.available).toBe(
        58,
      );
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('rejects a replay whose checkout identity does not match', () =>
    Effect.gen(function* () {
      const repository = yield* RegistrationRepository;
      const first = yield* repository.reserveOrder(
        checkout,
        'order-registration-replay-test',
        '2026-09-03T12:00:00Z',
      );
      expect(first._tag).toBe('Reserved');

      const replay = yield* repository.reserveOrder(
        { ...checkout, buyerEmail: 'mallory@example.test' },
        'order-registration-replay-test-ignored',
        '2026-09-03T12:00:01Z',
      );
      expect(replay).toEqual({
        orderId: 'order-registration-replay-test',
        _tag: 'ReplayMismatch',
      });
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('releases reserved inventory after a declined payment', () =>
    Effect.gen(function* () {
      const repository = yield* RegistrationRepository;
      const sql = yield* SqlClient;
      const reservation = yield* repository.reserveOrder(
        { ...checkout, discountCode: 'community20' },
        'order-registration-test-2',
        '2026-09-03T12:00:00Z',
      );
      expect(reservation._tag).toBe('Reserved');
      if (reservation._tag !== 'Reserved') {
        return;
      }
      expect(reservation.order.subtotalMinor).toBe(5900);
      expect(reservation.order.discountMinor).toBe(1180);
      expect(reservation.order.totalMinor).toBe(4720);
      expect(reservation.order.discountCode).toBe('COMMUNITY20');

      const failed = yield* repository.failOrder(
        'order-registration-test-2',
        '2026-09-03T12:00:01Z',
      );
      expect(failed).toBe(true);

      const inventory = yield* repository.listAvailable(checkout.eventId, '2026-09-03T12:00:02Z');
      expect(
        inventory.find((ticket) => ticket.ticketTypeId === checkout.ticketTypeId)?.available,
      ).toBe(59);
      const redemptions = yield* sql<{ readonly redeemedCount: number }>`
        SELECT redeemed_count AS redeemedCount
        FROM discount_codes
        WHERE code = 'COMMUNITY20'
      `;
      expect(redemptions[0]?.redeemedCount).toBe(0);
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('rejects an unavailable discount without consuming ticket inventory', () =>
    Effect.gen(function* () {
      const repository = yield* RegistrationRepository;
      const result = yield* repository.reserveOrder(
        { ...checkout, discountCode: 'NOT-A-CODE' },
        'order-registration-test-invalid-discount',
        '2026-09-03T12:00:00Z',
      );

      expect(result).toEqual({ code: 'NOT-A-CODE', _tag: 'DiscountUnavailable' });
      const inventory = yield* repository.listAvailable(checkout.eventId, '2026-09-03T12:00:01Z');
      expect(
        inventory.find((ticket) => ticket.ticketTypeId === checkout.ticketTypeId)?.available,
      ).toBe(59);
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('validates required answers before reserving inventory', () =>
    Effect.gen(function* () {
      const repository = yield* RegistrationRepository;
      const result = yield* repository.reserveOrder(
        { ...checkout, answers: [] },
        'order-registration-test-missing-answer',
        '2026-09-03T12:00:00Z',
      );

      expect(result._tag).toBe('AnswersInvalid');
      const inventory = yield* repository.listAvailable(checkout.eventId, '2026-09-03T12:00:01Z');
      expect(
        inventory.find((ticket) => ticket.ticketTypeId === checkout.ticketTypeId)?.available,
      ).toBe(59);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
