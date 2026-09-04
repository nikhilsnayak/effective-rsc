import { describe, expect, it } from '@effect/vitest';
import { Deferred, Effect, Fiber, Layer } from 'effect';

import type { CheckoutInput } from '@/modules/registration/model';
import { PaymentDeclined } from '@/modules/registration/model';
import { PaymentGateway } from '@/modules/registration/payment-gateway';
import type { OrderRecord } from '@/modules/registration/repository';
import { RegistrationRepository } from '@/modules/registration/repository';
import { RegistrationService } from '@/modules/registration/service';

const checkout = {
  answers: [{ answer: 'Engineer', questionId: 'question-summit-role' }],
  buyerEmail: 'ada@example.test',
  buyerName: 'Ada Lovelace',
  eventId: 'event-effect-systems-summit-2026',
  idempotencyKey: '00000000-0000-4000-8000-000000000001',
  paymentMethod: 'approve',
  ticketTypeId: 'ticket-summit-community',
} satisfies CheckoutInput;

const pendingOrder = {
  attendeeSessionToken: null,
  buyerEmail: checkout.buyerEmail,
  buyerName: checkout.buyerName,
  checkoutFingerprint: JSON.stringify({
    answers: checkout.answers,
    buyerEmail: checkout.buyerEmail,
    buyerName: checkout.buyerName,
    discountCode: null,
    paymentMethod: checkout.paymentMethod,
    ticketTypeId: checkout.ticketTypeId,
  }),
  currency: 'EUR',
  discountCode: null,
  discountMinor: 0,
  eventId: checkout.eventId,
  orderId: `order-${checkout.eventId}-${checkout.idempotencyKey}`,
  providerReference: null,
  status: 'pending',
  subtotalMinor: 5900,
  ticketCode: null,
  ticketId: null,
  ticketTypeId: checkout.ticketTypeId,
  totalMinor: 5900,
} satisfies OrderRecord;

const paidOrder = {
  ...pendingOrder,
  attendeeSessionToken: 'attendee-session-test',
  providerReference: `local-payment-${checkout.eventId}:${checkout.idempotencyKey}`,
  status: 'paid',
  ticketCode: 'GTH-000000000001',
  ticketId: `ticket-${checkout.idempotencyKey}`,
} satisfies OrderRecord;

const serviceLayer = (
  repository: Parameters<typeof RegistrationRepository.layerTest>[0],
  gateway: Parameters<typeof PaymentGateway.layerTest>[0],
) =>
  RegistrationService.layer.pipe(
    Layer.provide(
      Layer.merge(RegistrationRepository.layerTest(repository), PaymentGateway.layerTest(gateway)),
    ),
  );

describe('RegistrationService', () => {
  it.effect('charges a reservation and returns the issued ticket receipt', () =>
    Effect.gen(function* () {
      const service = yield* RegistrationService;
      const receipt = yield* service.checkout(checkout);

      expect(receipt.orderId).toBe(pendingOrder.orderId);
      expect(receipt.ticketCode).toBe('GTH-000000000001');
      expect(receipt.totalMinor).toBe(5900);
    }).pipe(
      Effect.provide(
        serviceLayer(
          {
            completeOrder: () => Effect.succeed(paidOrder),
            reserveOrder: () => Effect.succeed({ order: pendingOrder, _tag: 'Reserved' }),
          },
          {
            charge: () =>
              Effect.succeed({
                providerReference: `local-payment-${checkout.eventId}:${checkout.idempotencyKey}`,
              }),
          },
        ),
      ),
    ),
  );

  it.effect('returns an existing paid checkout without charging again', () =>
    Effect.gen(function* () {
      const service = yield* RegistrationService;
      const receipt = yield* service.checkout(checkout);

      expect(receipt.ticketId).toBe(paidOrder.ticketId);
    }).pipe(
      Effect.provide(
        serviceLayer(
          {
            reserveOrder: () => Effect.succeed({ order: paidOrder, _tag: 'Existing' }),
          },
          {
            charge: () => Effect.die(new Error('idempotent replay must not charge again')),
          },
        ),
      ),
    ),
  );

  it.effect('surfaces a declined payment after releasing the reservation', () =>
    Effect.gen(function* () {
      const service = yield* RegistrationService;
      const error = yield* service
        .checkout({ ...checkout, paymentMethod: 'decline' })
        .pipe(Effect.flip);

      expect(error._tag).toBe('@effective-rsc/example-event-platform/registration/PaymentDeclined');
    }).pipe(
      Effect.provide(
        serviceLayer(
          {
            failOrder: () => Effect.succeed(true),
            reserveOrder: () => Effect.succeed({ order: pendingOrder, _tag: 'Reserved' }),
          },
          {
            charge: () =>
              Effect.fail(new PaymentDeclined({ reason: 'The deterministic payment declined.' })),
          },
        ),
      ),
    ),
  );

  it.effect('releases a reservation when payment is interrupted', () =>
    Effect.gen(function* () {
      const paymentStarted = yield* Deferred.make<void>();
      const released = yield* Deferred.make<void>();
      const checkoutFiber = yield* RegistrationService.pipe(
        Effect.flatMap((service) => service.checkout(checkout)),
        Effect.provide(
          serviceLayer(
            {
              failOrder: () => Deferred.succeed(released, undefined).pipe(Effect.as(true)),
              reserveOrder: () => Effect.succeed({ order: pendingOrder, _tag: 'Reserved' }),
            },
            {
              charge: () =>
                Deferred.succeed(paymentStarted, undefined).pipe(Effect.andThen(Effect.never)),
            },
          ),
        ),
        Effect.forkChild,
      );

      yield* Deferred.await(paymentStarted);
      yield* Fiber.interrupt(checkoutFiber);
      yield* Deferred.await(released);
    }),
  );
});
