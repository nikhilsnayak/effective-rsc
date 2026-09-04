'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from '@/ersc';
import { RegistrationAnswerInput, type CheckoutReceipt } from '@/modules/registration/model';
import { RegistrationService } from '@/modules/registration/service';

export type RegistrationState =
  | { readonly message: string; readonly status: 'error' }
  | { readonly receipt: CheckoutReceipt; readonly status: 'success' };

const PersonName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
);
const EmailAddress = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMaxLength(254),
  Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
);

const RegistrationInput = Schema.fromFormData(
  Schema.Struct({
    answers: Schema.fromJsonString(Schema.Array(RegistrationAnswerInput)),
    buyerEmail: EmailAddress,
    buyerName: PersonName,
    discountCode: Schema.String.check(Schema.isTrimmed(), Schema.isMaxLength(40)),
    eventId: Schema.NonEmptyString,
    idempotencyKey: Schema.String.check(Schema.isUUID()),
    paymentMethod: Schema.Literals(['approve', 'decline']),
    ticketTypeId: Schema.NonEmptyString,
  }),
);

export const registerAttendee = ERSC.ServerFn.make({
  input: RegistrationInput,
  handler: Effect.fn('registerAttendee')(function* (input) {
    const service = yield* RegistrationService;
    const outcome = yield* service.checkout(input).pipe(
      Effect.map((receipt) => ({ receipt, _tag: 'Success' }) as const),
      Effect.catch((error) => Effect.succeed({ error, _tag: 'Failure' } as const)),
    );

    if (outcome._tag === 'Success') {
      return { receipt: outcome.receipt, status: 'success' } satisfies RegistrationState;
    }

    switch (outcome.error._tag) {
      case '@effective-rsc/example-event-platform/registration/TicketTypeNotFound':
        return {
          message: 'That ticket is not currently available for this event.',
          status: 'error',
        } satisfies RegistrationState;
      case '@effective-rsc/example-event-platform/registration/TicketSoldOut':
        return {
          message: 'That ticket allocation has just sold out.',
          status: 'error',
        } satisfies RegistrationState;
      case '@effective-rsc/example-event-platform/registration/DiscountCodeInvalid':
        return {
          message: 'That discount code is invalid, expired, or has reached its usage limit.',
          status: 'error',
        } satisfies RegistrationState;
      case '@effective-rsc/example-event-platform/registration/RegistrationAnswersInvalid':
        return {
          message: outcome.error.reason,
          status: 'error',
        } satisfies RegistrationState;
      case '@effective-rsc/example-event-platform/registration/PaymentDeclined':
        return {
          message: 'The simulated payment was declined. No ticket was issued.',
          status: 'error',
        } satisfies RegistrationState;
      case '@effective-rsc/example-event-platform/registration/CheckoutConflict':
        return {
          message: 'This checkout is already being processed. Refresh before trying again.',
          status: 'error',
        } satisfies RegistrationState;
      case '@effective-rsc/example-event-platform/registration/RegistrationUnavailable':
        return {
          message: 'Registration is temporarily unavailable. Please try again.',
          status: 'error',
        } satisfies RegistrationState;
    }
  }),
});
