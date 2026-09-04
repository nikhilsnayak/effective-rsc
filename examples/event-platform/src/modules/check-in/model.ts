import { Schema } from 'effect';

export const CheckInTicketStatus = Schema.Literals(['valid', 'cancelled', 'checked_in']);
export type CheckInTicketStatus = typeof CheckInTicketStatus.Type;

export const CheckInEvent = Schema.Struct({
  checkedIn: Schema.Finite,
  eventId: Schema.String,
  eventName: Schema.String,
  issued: Schema.Finite,
  organizationName: Schema.String,
  role: Schema.String,
});
export type CheckInEvent = typeof CheckInEvent.Type;

export const CheckInTicket = Schema.Struct({
  code: Schema.String,
  eventId: Schema.String,
  eventName: Schema.String,
  holderEmail: Schema.String,
  holderName: Schema.String,
  status: CheckInTicketStatus,
  ticketId: Schema.String,
  ticketTypeName: Schema.String,
});
export type CheckInTicket = typeof CheckInTicket.Type;

export const CheckInAuditEntry = Schema.Struct({
  action: Schema.Literals(['check_in', 'undo']),
  holderName: Schema.String,
  recordedAt: Schema.String,
  staffName: Schema.String,
  ticketCode: Schema.String,
});
export type CheckInAuditEntry = typeof CheckInAuditEntry.Type;

export type CheckInConsole = {
  readonly audit: ReadonlyArray<CheckInAuditEntry>;
  readonly event: CheckInEvent;
};

export class CheckInAccessDenied extends Schema.TaggedError<CheckInAccessDenied>()(
  '@effective-rsc/example-event-platform/check-in/CheckInAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class CheckInCredentialNotFound extends Schema.TaggedError<CheckInCredentialNotFound>()(
  '@effective-rsc/example-event-platform/check-in/CheckInCredentialNotFound',
  { eventId: Schema.String, ticketCode: Schema.String },
) {}

export class CheckInTicketCancelled extends Schema.TaggedError<CheckInTicketCancelled>()(
  '@effective-rsc/example-event-platform/check-in/CheckInTicketCancelled',
  { ticketCode: Schema.String },
) {}

export class CheckInTicketNotCheckedIn extends Schema.TaggedError<CheckInTicketNotCheckedIn>()(
  '@effective-rsc/example-event-platform/check-in/CheckInTicketNotCheckedIn',
  { ticketCode: Schema.String },
) {}

export class CheckInConcurrentUpdate extends Schema.TaggedError<CheckInConcurrentUpdate>()(
  '@effective-rsc/example-event-platform/check-in/CheckInConcurrentUpdate',
  { ticketCode: Schema.String },
) {}

export class CheckInUnavailable extends Schema.TaggedError<CheckInUnavailable>()(
  '@effective-rsc/example-event-platform/check-in/CheckInUnavailable',
  { operation: Schema.String },
) {}
