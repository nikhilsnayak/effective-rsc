import { Context, DateTime, Effect, Layer, Option } from 'effect';

import {
  type CreateEventInput,
  EventAuthoringAccessDenied,
  EventAuthoringConcurrentUpdate,
  EventAuthoringUnavailable,
  type EventDetailsInput,
  EventScheduleInvalid,
  EventSlugConflict,
  TicketInventoryInvalid,
  type TicketTypeInput,
  TicketTypeNotManaged,
  type UpdateEventInput,
} from '@/modules/event-authoring/model';
import { EventAuthoringRepository } from '@/modules/event-authoring/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new EventAuthoringUnavailable({ operation }));

export type EventAuthoringError =
  | EventAuthoringAccessDenied
  | EventAuthoringConcurrentUpdate
  | EventAuthoringUnavailable
  | EventScheduleInvalid
  | EventSlugConflict
  | TicketInventoryInvalid
  | TicketTypeNotManaged;

const zonedInstant = (value: string, timezone: string, field: string) => {
  const zone = DateTime.zoneMakeNamed(timezone);
  if (Option.isNone(zone)) {
    return Effect.fail(new EventScheduleInvalid({ field: 'timezone' }));
  }
  const instant = DateTime.makeZoned(value, {
    adjustForTimeZone: true,
    disambiguation: 'reject',
    timeZone: zone.value,
  });

  return Effect.fromOption(instant, () => new EventScheduleInvalid({ field }));
};

const normalizeRange = Effect.fnUntraced(function* (
  startsAt: string,
  endsAt: string,
  timezone: string,
) {
  const start = yield* zonedInstant(startsAt, timezone, 'startsAt');
  const end = yield* zonedInstant(endsAt, timezone, 'endsAt');
  if (!DateTime.isLessThan(start, end)) {
    return yield* new EventScheduleInvalid({ field: 'endsAt' });
  }

  return { endsAt: DateTime.formatIso(end), startsAt: DateTime.formatIso(start) };
});

const normalizeEvent = Effect.fnUntraced(function* (input: EventDetailsInput) {
  const range = yield* normalizeRange(input.startsAt, input.endsAt, input.timezone);
  return { ...input, ...range };
});

export class EventAuthoringService extends Context.Service<EventAuthoringService>()(
  '@effective-rsc/example-event-platform/event-authoring/EventAuthoringService',
  {
    make: Effect.gen(function* () {
      const repository = yield* EventAuthoringRepository;

      return {
        createEvent: Effect.fn('EventAuthoringService.createEvent')(function* (
          userId: string,
          input: CreateEventInput,
        ) {
          const organization = yield* repository
            .findOrganization(userId, input.organizationId)
            .pipe(unavailable('authorize event creation'));
          if (organization === null) {
            return yield* new EventAuthoringAccessDenied({
              resourceId: input.organizationId,
              userId,
            });
          }
          const slugAvailable = yield* repository
            .isSlugAvailable(input.organizationId, input.eventSlug, null)
            .pipe(unavailable('validate event address'));
          if (!slugAvailable) {
            return yield* new EventSlugConflict({
              eventSlug: input.eventSlug,
              organizationId: input.organizationId,
            });
          }

          const details = yield* normalizeEvent(input);
          const currentTime = yield* DateTime.now;
          const now = DateTime.formatIso(currentTime);
          const eventId = yield* repository
            .createEvent(userId, { ...details, organizationId: input.organizationId }, now)
            .pipe(unavailable('create draft event'));
          if (eventId === null) {
            return yield* new EventAuthoringAccessDenied({
              resourceId: input.organizationId,
              userId,
            });
          }

          return { eventId, organizationSlug: organization.organizationSlug };
        }),
        createTarget: Effect.fn('EventAuthoringService.createTarget')(function* (
          userId: string,
          organizationId: string,
        ) {
          const organization = yield* repository
            .findOrganization(userId, organizationId)
            .pipe(unavailable('load event creation workspace'));
          if (organization === null) {
            return yield* new EventAuthoringAccessDenied({ resourceId: organizationId, userId });
          }
          return organization;
        }),
        editor: Effect.fn('EventAuthoringService.editor')(function* (
          userId: string,
          eventId: string,
        ) {
          const editor = yield* repository
            .loadEditor(userId, eventId)
            .pipe(unavailable('load event editor'));
          if (editor === null) {
            return yield* new EventAuthoringAccessDenied({ resourceId: eventId, userId });
          }
          return editor;
        }),
        saveTicketType: Effect.fn('EventAuthoringService.saveTicketType')(function* (
          userId: string,
          input: TicketTypeInput,
        ) {
          const editor = yield* repository
            .loadEditor(userId, input.eventId)
            .pipe(unavailable('authorize ticket management'));
          if (editor === null) {
            return yield* new EventAuthoringAccessDenied({
              resourceId: input.eventId,
              userId,
            });
          }
          const current =
            input.ticketTypeId === undefined
              ? undefined
              : editor.tickets.find((ticket) => ticket.ticketTypeId === input.ticketTypeId);
          if (input.ticketTypeId !== undefined && current === undefined) {
            return yield* new TicketTypeNotManaged({ ticketTypeId: input.ticketTypeId });
          }
          const allocatedElsewhere = editor.tickets
            .filter((ticket) => ticket.ticketTypeId !== input.ticketTypeId)
            .reduce((total, ticket) => total + ticket.quantityTotal, 0);
          if (allocatedElsewhere + input.quantityTotal > editor.event.capacity) {
            return yield* new TicketInventoryInvalid({
              ticketTypeId: input.ticketTypeId ?? 'new-ticket-type',
            });
          }
          const range = yield* normalizeRange(
            input.salesStartsAt,
            input.salesEndsAt,
            editor.event.timezone,
          );
          const normalized = { ...input, ...range };
          if (input.ticketTypeId === undefined) {
            const ticketTypeId = yield* repository
              .createTicketType(userId, normalized)
              .pipe(unavailable('create ticket type'));
            if (ticketTypeId === null) {
              return yield* new EventAuthoringAccessDenied({
                resourceId: input.eventId,
                userId,
              });
            }
            return { operation: 'created', ticketTypeId } as const;
          }

          if (current === undefined) {
            return yield* Effect.die(
              new TypeError('An existing ticket type must have been loaded before update.'),
            );
          }
          if (input.quantityTotal < current.quantityReserved + current.quantitySold) {
            return yield* new TicketInventoryInvalid({ ticketTypeId: input.ticketTypeId });
          }
          const updated = yield* repository
            .updateTicketType(userId, { ...normalized, ticketTypeId: input.ticketTypeId })
            .pipe(unavailable('update ticket type'));
          if (!updated) {
            return yield* new TicketInventoryInvalid({ ticketTypeId: input.ticketTypeId });
          }
          return { operation: 'updated', ticketTypeId: input.ticketTypeId } as const;
        }),
        setTicketTypeStatus: Effect.fn('EventAuthoringService.setTicketTypeStatus')(function* (
          userId: string,
          eventId: string,
          ticketTypeId: string,
          status: 'active' | 'hidden',
        ) {
          const editor = yield* repository
            .loadEditor(userId, eventId)
            .pipe(unavailable('authorize ticket visibility'));
          if (editor === null) {
            return yield* new EventAuthoringAccessDenied({ resourceId: eventId, userId });
          }
          if (!editor.tickets.some((ticket) => ticket.ticketTypeId === ticketTypeId)) {
            return yield* new TicketTypeNotManaged({ ticketTypeId });
          }
          const updated = yield* repository
            .setTicketTypeStatus(userId, eventId, ticketTypeId, status)
            .pipe(unavailable('update ticket visibility'));
          if (!updated) {
            return yield* new TicketTypeNotManaged({ ticketTypeId });
          }
          return { status, ticketTypeId };
        }),
        updateEvent: Effect.fn('EventAuthoringService.updateEvent')(function* (
          userId: string,
          input: UpdateEventInput,
        ) {
          const editor = yield* repository
            .loadEditor(userId, input.eventId)
            .pipe(unavailable('authorize event editing'));
          if (editor === null) {
            return yield* new EventAuthoringAccessDenied({ resourceId: input.eventId, userId });
          }
          const slugAvailable = yield* repository
            .isSlugAvailable(editor.event.organizationId, input.eventSlug, input.eventId)
            .pipe(unavailable('validate event address'));
          if (!slugAvailable) {
            return yield* new EventSlugConflict({
              eventSlug: input.eventSlug,
              organizationId: editor.event.organizationId,
            });
          }
          const allocatedTickets = editor.tickets.reduce(
            (total, ticket) => total + ticket.quantityTotal,
            0,
          );
          if (input.capacity < allocatedTickets) {
            return yield* new TicketInventoryInvalid({ ticketTypeId: 'event-capacity' });
          }
          const details = yield* normalizeEvent(input);
          const currentTime = yield* DateTime.now;
          const updatedAt = DateTime.formatIso(currentTime);
          const updated = yield* repository
            .updateEvent(userId, input.eventId, details, input.expectedUpdatedAt, updatedAt)
            .pipe(unavailable('update event details'));
          if (!updated) {
            return yield* new EventAuthoringConcurrentUpdate({ eventId: input.eventId });
          }
          return { eventId: input.eventId, updatedAt };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
