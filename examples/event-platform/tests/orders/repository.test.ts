import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { OrdersRepository } from '@/modules/orders/repository';
import { RegistrationRepository } from '@/modules/registration/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = Layer.merge(OrdersRepository.layer, RegistrationRepository.layer).pipe(
  Layer.provide(PersistenceLayer),
);

describe('OrdersRepository', () => {
  it.effect('refunds an order atomically, cancels its ticket, and restores inventory', () =>
    Effect.gen(function* () {
      const orders = yield* OrdersRepository;
      const registration = yield* RegistrationRepository;
      const eventId = 'event-effect-systems-summit-2026';

      const initialOrders = yield* orders.listOrders('user-maya', eventId);
      expect(initialOrders).toMatchObject([
        { orderId: 'order-demo-ada', status: 'paid', ticketStatus: 'valid' },
      ]);
      const before = yield* registration.listAvailable(eventId, '2026-09-04T08:00:00Z');
      expect(
        before.find(({ ticketTypeId }) => ticketTypeId === 'ticket-summit-community')?.available,
      ).toBe(59);

      const refunded = yield* orders.refund(
        'user-maya',
        eventId,
        'order-demo-ada',
        'Attendee requested cancellation',
        '2026-09-04T08:01:00Z',
      );
      expect(refunded?.order).toMatchObject({ status: 'refunded', ticketStatus: 'cancelled' });
      expect(refunded?.message.recipient).toBe('ada@example.test');
      const after = yield* registration.listAvailable(eventId, '2026-09-04T08:02:00Z');
      expect(
        after.find(({ ticketTypeId }) => ticketTypeId === 'ticket-summit-community')?.available,
      ).toBe(60);

      const repeated = yield* orders.refund(
        'user-maya',
        eventId,
        'order-demo-ada',
        'Repeated request',
        '2026-09-04T08:03:00Z',
      );
      expect(repeated).toBeNull();
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('hides orders from check-in-only staff', () =>
    Effect.gen(function* () {
      const repository = yield* OrdersRepository;
      const eventId = 'event-effect-systems-summit-2026';
      const event = yield* repository.loadEvent('user-nikhil', eventId);
      const orders = yield* repository.listOrders('user-nikhil', eventId);

      expect(event).toBeNull();
      expect(orders).toEqual([]);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
