import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import { EventAuthoringRepository } from '@/modules/event-authoring/repository';
import { EventAuthoringService } from '@/modules/event-authoring/service';
import { RegistrationRepository } from '@/modules/registration/repository';
import { runMigrations } from '@/persistence/Migrations';
import repairTicketSaleInstants from '@/persistence/Migrations/015_TicketSaleInstants';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const ServiceLayer = Layer.mergeAll(
  EventAuthoringService.layer.pipe(Layer.provide(EventAuthoringRepository.layer)),
  RegistrationRepository.layer,
).pipe(Layer.provideMerge(PersistenceLayer));

const workshopId = 'event-rsc-workshop-lab-2026';

describe('Event authoring with SQLite', () => {
  it.effect('opens and closes ticket sales at the venue-local times on creation and edit', () =>
    Effect.gen(function* () {
      const authoring = yield* EventAuthoringService;
      const registration = yield* RegistrationRepository;
      const sql = yield* SqlClient;
      yield* sql`UPDATE events SET status = 'published' WHERE id = ${workshopId}`;
      const ticket = {
        eventId: workshopId,
        name: 'Morning admission',
        description: 'Admission to the workshop.',
        currency: 'INR',
        priceMinor: 500,
        quantityTotal: 20,
        salesStartsAt: '2026-12-01T09:00',
        salesEndsAt: '2026-12-01T10:00',
      };

      const created = yield* authoring.saveTicketType('user-nikhil', ticket);
      const editor = yield* authoring.editor('user-nikhil', workshopId);
      expect(editor.tickets[0]).toMatchObject({
        ticketTypeId: created.ticketTypeId,
        salesStartsAt: '2026-12-01T03:30:00.000Z',
        salesEndsAt: '2026-12-01T04:30:00.000Z',
      });
      // The venue is in Asia/Kolkata: 09:00 there is 03:30 UTC.
      for (const [instant, count] of [
        ['2026-12-01T03:29:59Z', 0],
        ['2026-12-01T03:30:00Z', 1],
        ['2026-12-01T04:30:00Z', 1],
        ['2026-12-01T04:30:01Z', 0],
      ] as const) {
        const available = yield* registration.listAvailable(workshopId, instant);
        expect(available, instant).toHaveLength(count);
      }

      yield* authoring.saveTicketType('user-nikhil', {
        ...ticket,
        ticketTypeId: created.ticketTypeId,
        salesStartsAt: '2026-12-01T11:00',
        salesEndsAt: '2026-12-01T12:00',
      });
      const edited = yield* authoring.editor('user-nikhil', workshopId);
      expect(edited.tickets[0]).toMatchObject({
        salesStartsAt: '2026-12-01T05:30:00.000Z',
        salesEndsAt: '2026-12-01T06:30:00.000Z',
      });
      for (const [instant, count] of [
        ['2026-12-01T03:30:00Z', 0],
        ['2026-12-01T05:29:59Z', 0],
        ['2026-12-01T05:30:00Z', 1],
        ['2026-12-01T06:30:00Z', 1],
        ['2026-12-01T06:30:01Z', 0],
      ] as const) {
        const available = yield* registration.listAvailable(workshopId, instant);
        expect(available, instant).toHaveLength(count);
      }
    }).pipe(Effect.provide(ServiceLayer)),
  );

  it.effect('repairs legacy local sale times without converting UTC values a second time', () =>
    Effect.gen(function* () {
      const authoring = yield* EventAuthoringService;
      const sql = yield* SqlClient;
      const { ticketTypeId } = yield* authoring.saveTicketType('user-nikhil', {
        eventId: workshopId,
        name: 'Legacy admission',
        description: 'A ticket saved before the normalization fix.',
        currency: 'INR',
        priceMinor: 500,
        quantityTotal: 20,
        salesStartsAt: '2026-12-01T09:00',
        salesEndsAt: '2026-12-01T12:00',
      });
      yield* sql`
        UPDATE ticket_types
        SET sales_starts_at = '2026-12-01T09:00', sales_ends_at = '2026-12-01T12:00'
        WHERE id = ${ticketTypeId}
      `;
      yield* repairTicketSaleInstants;
      const repaired = yield* authoring.editor('user-nikhil', workshopId);
      expect(repaired.tickets[0]).toMatchObject({
        salesStartsAt: '2026-12-01T03:30:00.000Z',
        salesEndsAt: '2026-12-01T06:30:00.000Z',
      });
      yield* repairTicketSaleInstants;
      const repeated = yield* authoring.editor('user-nikhil', workshopId);
      expect(repeated.tickets).toEqual(repaired.tickets);
    }).pipe(Effect.provide(ServiceLayer)),
  );

  for (const [description, changes] of [
    ['capacity below an existing session', { capacity: 79 }],
    ['start after an existing session begins', { startsAt: '2026-12-05T11:00' }],
    ['end before an existing session finishes', { endsAt: '2026-12-05T13:00' }],
  ] as const) {
    it.effect(`rejects event ${description} without changing the event`, () =>
      Effect.gen(function* () {
        const authoring = yield* EventAuthoringService;
        const { event } = yield* authoring.editor('user-nikhil', workshopId);
        const error = yield* authoring
          .updateEvent('user-nikhil', {
            ...event,
            expectedUpdatedAt: event.updatedAt,
            startsAt: '2026-12-05T09:30',
            endsAt: '2026-12-05T17:30',
            ...changes,
          })
          .pipe(Effect.flip);

        expect(error._tag).toBe(
          '@effective-rsc/example-event-platform/event-authoring/EventProgrammeInvalid',
        );
        const after = yield* authoring.editor('user-nikhil', workshopId);
        expect(after.event).toEqual(event);
      }).pipe(Effect.provide(ServiceLayer)),
    );
  }

  for (const [description, startsAt, endsAt, capacity] of [
    ['capacity', '2026-12-05T09:00:00Z', '2026-12-05T10:00:00Z', 81],
    ['start', '2026-12-05T03:00:00Z', '2026-12-05T04:00:00Z', 28],
    ['end', '2026-12-05T12:00:00Z', '2026-12-05T13:00:00Z', 28],
  ] as const) {
    it.effect(`checks event ${description} bounds when a session is inserted or updated`, () =>
      Effect.gen(function* () {
        const sql = yield* SqlClient;
        // These writes bypass the service's earlier checks, as a stale request could.
        const inserted = yield* sql`
          INSERT INTO programme_sessions (
            id, event_id, room_id, title, summary, starts_at, ends_at,
            capacity, status, created_at, updated_at
          ) VALUES (
            'invalid-session', ${workshopId}, 'room-workshop-clinic', 'Invalid session', '',
            ${startsAt}, ${endsAt}, ${capacity}, 'draft', '2026-09-08', '2026-09-08'
          )
        `.pipe(Effect.flip);
        expect(inserted.reason.cause).toMatchObject({
          message: 'session exceeds event dates or capacity',
        });
        const updated = yield* sql`
          UPDATE programme_sessions
          SET starts_at = ${startsAt}, ends_at = ${endsAt}, capacity = ${capacity}
          WHERE id = 'session-workshop-debugging'
        `.pipe(Effect.flip);
        expect(updated.reason.cause).toMatchObject({
          message: 'session exceeds event dates or capacity',
        });
      }).pipe(Effect.provide(ServiceLayer)),
    );
  }

  it.effect('allows event edits that still contain the existing programme', () =>
    Effect.gen(function* () {
      const authoring = yield* EventAuthoringService;
      const { event } = yield* authoring.editor('user-nikhil', workshopId);
      yield* authoring.updateEvent('user-nikhil', {
        ...event,
        expectedUpdatedAt: event.updatedAt,
        startsAt: '2026-12-05T09:30',
        endsAt: '2026-12-05T17:30',
        name: 'Renamed workshop',
      });
      const after = yield* authoring.editor('user-nikhil', workshopId);
      expect(after.event.name).toBe('Renamed workshop');
    }).pipe(Effect.provide(ServiceLayer)),
  );
});
