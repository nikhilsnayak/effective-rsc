import { randomUUID } from 'node:crypto';

import { Context, DateTime, Effect, Exit, Layer } from 'effect';

import {
  type CheckoutInput,
  type CheckoutReceipt,
  CheckoutConflict,
  DiscountCodeInvalid,
  PaymentDeclined,
  RegistrationAnswersInvalid,
  RegistrationUnavailable,
  TicketSoldOut,
  TicketTypeNotFound,
} from '@/modules/registration/model';
import { PaymentGateway } from '@/modules/registration/payment-gateway';
import { orderReceipt, RegistrationRepository } from '@/modules/registration/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new RegistrationUnavailable({ operation }));

const orderId = (eventId: string, idempotencyKey: string) => `order-${eventId}-${idempotencyKey}`;

const issueCredential = Effect.sync(() => {
  const ticketId = randomUUID();
  return {
    attendeeSessionToken: randomUUID(),
    ticketCode: `GTH-${ticketId.replaceAll('-', '').toUpperCase()}`,
    ticketId: `ticket-${ticketId}`,
  };
});

export class RegistrationService extends Context.Service<RegistrationService>()(
  '@effective-rsc/example-event-platform/registration/RegistrationService',
  {
    make: Effect.gen(function* () {
      const gateway = yield* PaymentGateway;
      const repository = yield* RegistrationRepository;

      return {
        checkout: Effect.fn('RegistrationService.checkout')(function* (
          input: CheckoutInput,
        ): Effect.fn.Return<
          CheckoutReceipt,
          | CheckoutConflict
          | DiscountCodeInvalid
          | PaymentDeclined
          | RegistrationAnswersInvalid
          | RegistrationUnavailable
          | TicketSoldOut
          | TicketTypeNotFound
        > {
          const normalized = {
            ...input,
            buyerEmail: input.buyerEmail.trim().toLowerCase(),
            buyerName: input.buyerName.trim(),
            discountCode: input.discountCode?.trim().toUpperCase() ?? '',
          };
          const now = yield* DateTime.now;
          const startedAt = DateTime.formatIso(now);
          const checkoutOrderId = orderId(input.eventId, input.idempotencyKey);
          const reservation = yield* repository
            .reserveOrder(normalized, checkoutOrderId, startedAt)
            .pipe(unavailable('reserve ticket inventory'));

          if (reservation._tag === 'TicketUnavailable') {
            return yield* new TicketTypeNotFound({
              eventId: input.eventId,
              ticketTypeId: input.ticketTypeId,
            });
          }
          if (reservation._tag === 'SoldOut') {
            return yield* new TicketSoldOut({ ticketTypeId: input.ticketTypeId });
          }
          if (reservation._tag === 'DiscountUnavailable') {
            return yield* new DiscountCodeInvalid({ code: reservation.code });
          }
          if (reservation._tag === 'AnswersInvalid') {
            return yield* new RegistrationAnswersInvalid({ reason: reservation.reason });
          }
          if (reservation._tag === 'ReplayMismatch') {
            return yield* new CheckoutConflict({ orderId: reservation.orderId });
          }

          const existingReceipt = orderReceipt(reservation.order);
          if (existingReceipt !== null) {
            return existingReceipt;
          }
          if (reservation.order.status === 'failed') {
            return yield* new PaymentDeclined({
              reason: 'This checkout attempt was already declined.',
            });
          }
          if (reservation.order.status !== 'pending') {
            return yield* new CheckoutConflict({ orderId: reservation.order.orderId });
          }

          return yield* Effect.uninterruptibleMask((restore) =>
            Effect.gen(function* () {
              const payment = yield* restore(
                gateway.charge({
                  amountMinor: reservation.order.totalMinor,
                  currency: reservation.order.currency,
                  idempotencyKey: `${input.eventId}:${input.idempotencyKey}`,
                  paymentMethod: normalized.paymentMethod,
                }),
              ).pipe(
                Effect.onExit((exit) =>
                  Exit.isFailure(exit)
                    ? repository
                        .failOrder(checkoutOrderId, startedAt)
                        .pipe(unavailable('release incomplete ticket reservation'), Effect.asVoid)
                    : Effect.void,
                ),
              );
              const credential = yield* issueCredential;
              const completedNow = yield* DateTime.now;
              const completedAt = DateTime.formatIso(completedNow);
              const completed = yield* repository
                .completeOrder(
                  checkoutOrderId,
                  payment.providerReference,
                  credential.ticketId,
                  credential.ticketCode,
                  credential.attendeeSessionToken,
                  completedAt,
                )
                .pipe(unavailable('complete registration'));
              const receipt = completed === null ? null : orderReceipt(completed);

              if (receipt === null) {
                return yield* new CheckoutConflict({ orderId: checkoutOrderId });
              }
              return receipt;
            }),
          );
        }),
        listTickets: Effect.fn('RegistrationService.listTickets')(function* (eventId: string) {
          const now = yield* DateTime.now;
          return yield* repository
            .listAvailable(eventId, DateTime.formatIso(now))
            .pipe(unavailable('list ticket inventory'));
        }),
        listQuestions: Effect.fn('RegistrationService.listQuestions')(function* (eventId: string) {
          return yield* repository
            .listQuestions(eventId)
            .pipe(unavailable('list registration questions'));
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
