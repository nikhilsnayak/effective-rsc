import { Schema } from 'effect';

export const EventStatus = Schema.Literals(['published', 'completed']);
export type EventStatus = typeof EventStatus.Type;

export const EventSummary = Schema.Struct({
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
  status: EventStatus,
  tagline: Schema.String,
  timezone: Schema.String,
  venueName: Schema.String,
});
export type EventSummary = typeof EventSummary.Type;

export class EventCatalogUnavailable extends Schema.TaggedError<EventCatalogUnavailable>()(
  '@effective-rsc/example-event-platform/event/EventCatalogUnavailable',
  { operation: Schema.String },
) {}

export class PublishedEventNotFound extends Schema.TaggedError<PublishedEventNotFound>()(
  '@effective-rsc/example-event-platform/event/PublishedEventNotFound',
  {
    eventSlug: Schema.String,
    organizationSlug: Schema.String,
  },
) {}
