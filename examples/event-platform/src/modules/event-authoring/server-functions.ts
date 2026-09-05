'use server';

import { Effect, Schema } from 'effect';

import type { EventAuthoringError } from '@/modules/event-authoring/service';
import { EventAuthoringService } from '@/modules/event-authoring/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const AuthoringMutationState = Schema.Union([
  Schema.Struct({
    editPath: Schema.NullOr(Schema.String),
    message: Schema.String,
    status: Schema.Literal('success'),
  }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal('error') }),
]);
export type AuthoringMutationState = typeof AuthoringMutationState.Type;

const RequiredText = (maximum: number) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(maximum));
const Slug = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMinLength(2),
  Schema.isMaxLength(80),
  Schema.isPattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
);
const LocalDateTime = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));
const PositiveInteger = Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThan(0));
const MoneyMinor = Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0));

const EventFields = {
  capacity: PositiveInteger,
  countryCode: Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/)),
  description: RequiredText(2_000),
  endsAt: LocalDateTime,
  eventSlug: Slug,
  locality: RequiredText(100),
  name: RequiredText(120),
  startsAt: LocalDateTime,
  tagline: RequiredText(180),
  timezone: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(80)),
  venueName: RequiredText(160),
} as const;

const CreateEventInput = Schema.fromFormData(
  Schema.Struct({ ...EventFields, organizationId: Schema.NonEmptyString }),
);
const UpdateEventInput = Schema.fromFormData(
  Schema.Struct({
    ...EventFields,
    eventId: Schema.NonEmptyString,
    expectedUpdatedAt: Schema.NonEmptyString,
  }),
);
const SaveTicketTypeInput = Schema.fromFormData(
  Schema.Struct({
    currency: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/)),
    description: RequiredText(500),
    eventId: Schema.NonEmptyString,
    name: RequiredText(80),
    priceMinor: MoneyMinor,
    quantityTotal: PositiveInteger,
    salesEndsAt: LocalDateTime,
    salesStartsAt: LocalDateTime,
    ticketTypeId: Schema.optionalKey(Schema.NonEmptyString),
  }),
);
const SetTicketTypeStatusInput = Schema.Struct({
  eventId: Schema.NonEmptyString,
  status: Schema.Literals(['active', 'hidden']),
  ticketTypeId: Schema.NonEmptyString,
});

const failureState = (error: EventAuthoringError): AuthoringMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/event-authoring/EventAuthoringAccessDenied':
      return { message: 'Your organizer role cannot manage this resource.', status: 'error' };
    case '@effective-rsc/example-event-platform/event-authoring/EventSlugConflict':
      return { message: 'That event URL is already used by this organization.', status: 'error' };
    case '@effective-rsc/example-event-platform/event-authoring/EventScheduleInvalid':
      return {
        message: `Check the ${error.field} value and event timezone. End time must follow start time.`,
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/event-authoring/EventAuthoringConcurrentUpdate':
      return {
        message: 'This event changed in another request. Refresh and apply your edits again.',
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/event-authoring/TicketInventoryInvalid':
      return {
        message: 'Capacity cannot be lower than allocated, sold, or reserved tickets.',
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/event-authoring/TicketTypeNotManaged':
      return { message: 'That ticket type does not belong to this event.', status: 'error' };
    case '@effective-rsc/example-event-platform/event-authoring/EventAuthoringUnavailable':
      return {
        message: 'Event authoring is temporarily unavailable. Please try again.',
        status: 'error',
      };
  }
};

const result = <A, E extends EventAuthoringError>(
  effect: Effect.Effect<A, E>,
  success: (value: A) => AuthoringMutationState,
) =>
  effect.pipe(
    Effect.map(success),
    Effect.catch((error) => Effect.succeed(failureState(error))),
  );

export const createEvent = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(AuthoringMutationState), CreateEventInput],
  handler: Effect.fn('createEvent')(function* (_previousState, input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* EventAuthoringService;
    return yield* result(service.createEvent(userId, input), ({ eventId }) => ({
      editPath: `/organizer/events/${eventId}/edit`,
      message: 'Draft event created.',
      status: 'success',
    }));
  }),
});

export const updateEvent = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(AuthoringMutationState), UpdateEventInput],
  handler: Effect.fn('updateEvent')(function* (_previousState, input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* EventAuthoringService;
    return yield* result(service.updateEvent(userId, input), () => ({
      editPath: null,
      message: 'Event details saved.',
      status: 'success',
    }));
  }),
});

export const saveTicketType = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(AuthoringMutationState), SaveTicketTypeInput],
  handler: Effect.fn('saveTicketType')(function* (_previousState, input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* EventAuthoringService;
    return yield* result(service.saveTicketType(userId, input), ({ operation }) => ({
      editPath: null,
      message: operation === 'created' ? 'Ticket type created.' : 'Ticket type saved.',
      status: 'success',
    }));
  }),
});

export const setTicketTypeStatus = OrganizerERSC.ServerFn.make({
  input: SetTicketTypeStatusInput,
  handler: Effect.fn('setTicketTypeStatus')(function* ({ eventId, status, ticketTypeId }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* EventAuthoringService;
    return yield* result(
      service.setTicketTypeStatus(userId, eventId, ticketTypeId, status),
      (updated) => ({
        editPath: null,
        message: updated.status === 'active' ? 'Ticket is on sale.' : 'Ticket is hidden.',
        status: 'success',
      }),
    );
  }),
});
