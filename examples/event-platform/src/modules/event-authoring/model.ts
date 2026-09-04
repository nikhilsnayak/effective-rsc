import { Schema } from 'effect';

import { OrganizationRole } from '@/modules/organizer/model';

export const AuthoringOrganization = Schema.Struct({
  name: Schema.String,
  organizationId: Schema.String,
  organizationSlug: Schema.String,
  role: OrganizationRole,
});
export type AuthoringOrganization = typeof AuthoringOrganization.Type;

export const EditableEvent = Schema.Struct({
  capacity: Schema.Finite,
  countryCode: Schema.String,
  description: Schema.String,
  endsAt: Schema.String,
  eventId: Schema.String,
  eventSlug: Schema.String,
  locality: Schema.String,
  name: Schema.String,
  organizationId: Schema.String,
  organizationName: Schema.String,
  organizationSlug: Schema.String,
  startsAt: Schema.String,
  status: Schema.Literals(['draft', 'published', 'cancelled', 'completed']),
  tagline: Schema.String,
  timezone: Schema.String,
  updatedAt: Schema.String,
  venueName: Schema.String,
});
export type EditableEvent = typeof EditableEvent.Type;

export const ManagedTicketType = Schema.Struct({
  currency: Schema.String,
  description: Schema.String,
  name: Schema.String,
  priceMinor: Schema.Finite,
  quantityReserved: Schema.Finite,
  quantitySold: Schema.Finite,
  quantityTotal: Schema.Finite,
  salesEndsAt: Schema.String,
  salesStartsAt: Schema.String,
  status: Schema.Literals(['active', 'hidden']),
  ticketTypeId: Schema.String,
});
export type ManagedTicketType = typeof ManagedTicketType.Type;

export type EventEditor = {
  readonly event: EditableEvent;
  readonly tickets: ReadonlyArray<ManagedTicketType>;
};

export type EventDetailsInput = {
  readonly capacity: number;
  readonly countryCode: string;
  readonly description: string;
  readonly endsAt: string;
  readonly eventSlug: string;
  readonly locality: string;
  readonly name: string;
  readonly startsAt: string;
  readonly tagline: string;
  readonly timezone: string;
  readonly venueName: string;
};

export type CreateEventInput = EventDetailsInput & {
  readonly organizationId: string;
};

export type UpdateEventInput = EventDetailsInput & {
  readonly eventId: string;
  readonly expectedUpdatedAt: string;
};

export type TicketTypeInput = {
  readonly currency: string;
  readonly description: string;
  readonly eventId: string;
  readonly name: string;
  readonly priceMinor: number;
  readonly quantityTotal: number;
  readonly salesEndsAt: string;
  readonly salesStartsAt: string;
  readonly ticketTypeId?: string;
};

export class EventAuthoringAccessDenied extends Schema.TaggedError<EventAuthoringAccessDenied>()(
  '@effective-rsc/example-event-platform/event-authoring/EventAuthoringAccessDenied',
  { resourceId: Schema.String, userId: Schema.String },
) {}

export class EventSlugConflict extends Schema.TaggedError<EventSlugConflict>()(
  '@effective-rsc/example-event-platform/event-authoring/EventSlugConflict',
  { eventSlug: Schema.String, organizationId: Schema.String },
) {}

export class EventScheduleInvalid extends Schema.TaggedError<EventScheduleInvalid>()(
  '@effective-rsc/example-event-platform/event-authoring/EventScheduleInvalid',
  { field: Schema.String },
) {}

export class EventAuthoringConcurrentUpdate extends Schema.TaggedError<EventAuthoringConcurrentUpdate>()(
  '@effective-rsc/example-event-platform/event-authoring/EventAuthoringConcurrentUpdate',
  { eventId: Schema.String },
) {}

export class TicketInventoryInvalid extends Schema.TaggedError<TicketInventoryInvalid>()(
  '@effective-rsc/example-event-platform/event-authoring/TicketInventoryInvalid',
  { ticketTypeId: Schema.String },
) {}

export class TicketTypeNotManaged extends Schema.TaggedError<TicketTypeNotManaged>()(
  '@effective-rsc/example-event-platform/event-authoring/TicketTypeNotManaged',
  { ticketTypeId: Schema.String },
) {}

export class EventAuthoringUnavailable extends Schema.TaggedError<EventAuthoringUnavailable>()(
  '@effective-rsc/example-event-platform/event-authoring/EventAuthoringUnavailable',
  { operation: Schema.String },
) {}
