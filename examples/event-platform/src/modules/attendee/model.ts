import { Schema } from 'effect';

export const AttendeeTicketStatus = Schema.Literals(['valid', 'cancelled', 'checked_in']);
export type AttendeeTicketStatus = typeof AttendeeTicketStatus.Type;

export const AttendeeTicket = Schema.Struct({
  code: Schema.String,
  currency: Schema.String,
  endsAt: Schema.String,
  eventId: Schema.String,
  eventName: Schema.String,
  holderEmail: Schema.String,
  holderName: Schema.String,
  locality: Schema.String,
  orderId: Schema.String,
  organizationName: Schema.String,
  providerReference: Schema.String,
  startsAt: Schema.String,
  status: AttendeeTicketStatus,
  ticketId: Schema.String,
  ticketTypeName: Schema.String,
  timezone: Schema.String,
  totalMinor: Schema.Finite,
  venueName: Schema.String,
});
export type AttendeeTicket = typeof AttendeeTicket.Type;

export const DeliveredEmail = Schema.Struct({
  body: Schema.String,
  emailId: Schema.String,
  recipient: Schema.String,
  sentAt: Schema.String,
  subject: Schema.String,
});
export type DeliveredEmail = typeof DeliveredEmail.Type;

export type AttendeeDashboard = {
  readonly email: string;
  readonly messages: ReadonlyArray<DeliveredEmail>;
  readonly tickets: ReadonlyArray<AttendeeTicket>;
};

export class AttendeeAccessDenied extends Schema.TaggedError<AttendeeAccessDenied>()(
  '@effective-rsc/example-event-platform/attendee/AttendeeAccessDenied',
  { sessionToken: Schema.String },
) {}

export class AttendeeHubUnavailable extends Schema.TaggedError<AttendeeHubUnavailable>()(
  '@effective-rsc/example-event-platform/attendee/AttendeeHubUnavailable',
  { operation: Schema.String },
) {}

export class AttendeeTicketNotFound extends Schema.TaggedError<AttendeeTicketNotFound>()(
  '@effective-rsc/example-event-platform/attendee/AttendeeTicketNotFound',
  { ticketCode: Schema.String },
) {}

export class TicketHolderUpdateRejected extends Schema.TaggedError<TicketHolderUpdateRejected>()(
  '@effective-rsc/example-event-platform/attendee/TicketHolderUpdateRejected',
  { ticketId: Schema.String },
) {}
