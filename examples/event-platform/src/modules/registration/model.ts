import { Schema } from 'effect';

export const PaymentMethod = Schema.Literals(['approve', 'decline']);
export type PaymentMethod = typeof PaymentMethod.Type;

export const TicketType = Schema.Struct({
  available: Schema.Finite,
  currency: Schema.String,
  description: Schema.String,
  eventId: Schema.String,
  name: Schema.String,
  priceMinor: Schema.Finite,
  ticketTypeId: Schema.String,
});
export type TicketType = typeof TicketType.Type;

export const RegistrationQuestionType = Schema.Literals(['text', 'select']);
export type RegistrationQuestionType = typeof RegistrationQuestionType.Type;

export const RegistrationQuestion = Schema.Struct({
  description: Schema.String,
  eventId: Schema.String,
  label: Schema.String,
  options: Schema.Array(Schema.String),
  questionId: Schema.String,
  questionType: RegistrationQuestionType,
  required: Schema.Boolean,
  sortOrder: Schema.Finite,
});
export type RegistrationQuestion = typeof RegistrationQuestion.Type;

export const RegistrationAnswerInput = Schema.Struct({
  answer: Schema.String.check(Schema.isMaxLength(500)),
  questionId: Schema.NonEmptyString,
});
export type RegistrationAnswerInput = typeof RegistrationAnswerInput.Type;

export const CheckoutReceipt = Schema.Struct({
  attendeeAccessPath: Schema.String,
  buyerEmail: Schema.String,
  buyerName: Schema.String,
  currency: Schema.String,
  discountCode: Schema.NullOr(Schema.String),
  discountMinor: Schema.Finite,
  eventId: Schema.String,
  orderId: Schema.String,
  providerReference: Schema.String,
  subtotalMinor: Schema.Finite,
  ticketCode: Schema.String,
  ticketId: Schema.String,
  ticketTypeId: Schema.String,
  totalMinor: Schema.Finite,
});
export type CheckoutReceipt = typeof CheckoutReceipt.Type;

export type CheckoutInput = {
  readonly answers?: ReadonlyArray<RegistrationAnswerInput>;
  readonly buyerEmail: string;
  readonly buyerName: string;
  readonly discountCode?: string;
  readonly eventId: string;
  readonly idempotencyKey: string;
  readonly paymentMethod: PaymentMethod;
  readonly ticketTypeId: string;
};

export class RegistrationUnavailable extends Schema.TaggedError<RegistrationUnavailable>()(
  '@effective-rsc/example-event-platform/registration/RegistrationUnavailable',
  { operation: Schema.String },
) {}

export class TicketTypeNotFound extends Schema.TaggedError<TicketTypeNotFound>()(
  '@effective-rsc/example-event-platform/registration/TicketTypeNotFound',
  { eventId: Schema.String, ticketTypeId: Schema.String },
) {}

export class TicketSoldOut extends Schema.TaggedError<TicketSoldOut>()(
  '@effective-rsc/example-event-platform/registration/TicketSoldOut',
  { ticketTypeId: Schema.String },
) {}

export class DiscountCodeInvalid extends Schema.TaggedError<DiscountCodeInvalid>()(
  '@effective-rsc/example-event-platform/registration/DiscountCodeInvalid',
  { code: Schema.String },
) {}

export class RegistrationAnswersInvalid extends Schema.TaggedError<RegistrationAnswersInvalid>()(
  '@effective-rsc/example-event-platform/registration/RegistrationAnswersInvalid',
  { reason: Schema.String },
) {}

export class PaymentDeclined extends Schema.TaggedError<PaymentDeclined>()(
  '@effective-rsc/example-event-platform/registration/PaymentDeclined',
  { reason: Schema.String },
) {}

export class CheckoutConflict extends Schema.TaggedError<CheckoutConflict>()(
  '@effective-rsc/example-event-platform/registration/CheckoutConflict',
  { orderId: Schema.String },
) {}
