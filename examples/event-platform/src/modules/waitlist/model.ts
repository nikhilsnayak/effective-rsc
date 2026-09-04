import { Schema } from 'effect';

import { ManagedEventStatus, OrganizationRole } from '@/modules/organizer/model';

export const WaitlistStatus = Schema.Literals(['waiting', 'notified', 'cancelled']);
export type WaitlistStatus = typeof WaitlistStatus.Type;

export const WaitlistEntry = Schema.Struct({
  attendeeEmail: Schema.String,
  attendeeName: Schema.String,
  createdAt: Schema.String,
  entryId: Schema.String,
  eventId: Schema.String,
  notifiedAt: Schema.NullOr(Schema.String),
  status: WaitlistStatus,
  ticketTypeId: Schema.String,
  ticketTypeName: Schema.String,
});
export type WaitlistEntry = typeof WaitlistEntry.Type;

export const WaitlistEvent = Schema.Struct({
  eventId: Schema.String,
  eventName: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
  status: ManagedEventStatus,
});
export type WaitlistEvent = typeof WaitlistEvent.Type;

export type JoinWaitlistInput = {
  readonly attendeeEmail: string;
  readonly attendeeName: string;
  readonly eventId: string;
  readonly ticketTypeId: string;
};

export type WaitlistWorkspace = {
  readonly entries: ReadonlyArray<WaitlistEntry>;
  readonly event: WaitlistEvent;
};

export class WaitlistAccessDenied extends Schema.TaggedError<WaitlistAccessDenied>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class WaitlistEntryUnavailable extends Schema.TaggedError<WaitlistEntryUnavailable>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistEntryUnavailable',
  { entryId: Schema.String },
) {}

export class WaitlistTicketAvailable extends Schema.TaggedError<WaitlistTicketAvailable>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistTicketAvailable',
  { ticketTypeId: Schema.String },
) {}

export class WaitlistTicketUnavailable extends Schema.TaggedError<WaitlistTicketUnavailable>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistTicketUnavailable',
  { ticketTypeId: Schema.String },
) {}

export class WaitlistUnavailable extends Schema.TaggedError<WaitlistUnavailable>()(
  '@effective-rsc/example-event-platform/waitlist/WaitlistUnavailable',
  { operation: Schema.String },
) {}
