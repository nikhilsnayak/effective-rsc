import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { ReportingRepository } from '@/modules/reporting/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = ReportingRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('ReportingRepository', () => {
  it.effect('loads sales, revenue, inventory, and attendance for an authorized manager', () =>
    Effect.gen(function* () {
      const repository = yield* ReportingRepository;
      const eventId = 'event-effect-systems-summit-2026';

      const event = yield* repository.loadEvent('user-maya', eventId);
      const summary = yield* repository.loadSummary('user-maya', eventId);
      const ticketSales = yield* repository.loadTicketSales('user-maya', eventId);
      const payments = yield* repository.loadPayments('user-maya', eventId);

      expect(event).toMatchObject({
        eventName: 'Effect Systems Summit',
        organizationName: 'Runtime Collective',
        role: 'owner',
      });
      expect(summary).toEqual({
        capacity: 240,
        checkedInTickets: 0,
        issuedTickets: 1,
        reservedTickets: 24,
        soldTickets: 1,
      });
      expect(ticketSales).toHaveLength(3);
      expect(
        ticketSales.find(({ ticketTypeId }) => ticketTypeId === 'ticket-summit-community'),
      ).toMatchObject({ quantitySold: 1, quantityTotal: 60 });
      expect(
        ticketSales.find(({ ticketTypeId }) => ticketTypeId === 'ticket-summit-lab'),
      ).toMatchObject({ quantityReserved: 24, quantityTotal: 24 });
      expect(payments).toEqual([
        { currency: 'EUR', orderCount: 1, status: 'paid', totalMinor: 5900 },
      ]);
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('does not expose financial reports to check-in-only staff', () =>
    Effect.gen(function* () {
      const repository = yield* ReportingRepository;
      const eventId = 'event-effect-systems-summit-2026';

      const event = yield* repository.loadEvent('user-nikhil', eventId);
      const summary = yield* repository.loadSummary('user-nikhil', eventId);
      const ticketSales = yield* repository.loadTicketSales('user-nikhil', eventId);
      const payments = yield* repository.loadPayments('user-nikhil', eventId);

      expect(event).toBeNull();
      expect(summary).toBeNull();
      expect(ticketSales).toEqual([]);
      expect(payments).toEqual([]);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
