'use server';

import { Effect, Schema } from 'effect';

import { ERSC } from '@/ersc';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import type { WaitlistError } from '@/modules/waitlist/service';
import { WaitlistService } from '@/modules/waitlist/service';

const WaitlistMutationState = Schema.Union([
  Schema.Struct({ message: Schema.String, status: Schema.Literal('success') }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal('error') }),
]);
export type WaitlistMutationState = typeof WaitlistMutationState.Type;

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
const JoinInput = Schema.fromFormData(
  Schema.Struct({
    attendeeEmail: EmailAddress,
    attendeeName: PersonName,
    eventId: Schema.NonEmptyString,
    idempotencyKey: Schema.String.check(Schema.isUUID()),
    ticketTypeId: Schema.NonEmptyString,
  }),
);
const NotifyInput = Schema.fromFormData(
  Schema.Struct({
    entryId: Schema.NonEmptyString,
    eventId: Schema.NonEmptyString,
  }),
);

const failureState = (error: WaitlistError): WaitlistMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/waitlist/WaitlistTicketAvailable':
      return { message: 'A ticket is available now. Register directly instead.', status: 'error' };
    case '@effective-rsc/example-event-platform/waitlist/WaitlistTicketUnavailable':
      return { message: 'That ticket is not eligible for a waitlist.', status: 'error' };
    case '@effective-rsc/example-event-platform/waitlist/WaitlistAccessDenied':
      return { message: 'Your organizer role cannot manage this waitlist.', status: 'error' };
    case '@effective-rsc/example-event-platform/waitlist/WaitlistEntryUnavailable':
      return { message: 'That attendee was already notified or is unavailable.', status: 'error' };
    case '@effective-rsc/example-event-platform/waitlist/WaitlistUnavailable':
      return { message: 'The waitlist is temporarily unavailable.', status: 'error' };
  }
};

export const joinWaitlist = ERSC.ServerFn.make({
  input: JoinInput,
  handler: Effect.fn('joinWaitlist')(function* ({ idempotencyKey, ...input }) {
    const service = yield* WaitlistService;
    return yield* service.join(input, idempotencyKey).pipe(
      Effect.map(
        (entry) =>
          ({
            message:
              entry.status === 'waiting'
                ? `You are on the ${entry.ticketTypeName} waitlist.`
                : `Your ${entry.ticketTypeName} waitlist status is ${entry.status}.`,
            status: 'success',
          }) as const,
      ),
      Effect.catch((error) => Effect.succeed(failureState(error))),
    );
  }),
});

export const notifyWaitlistEntry = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(WaitlistMutationState), NotifyInput],
  handler: Effect.fn('notifyWaitlistEntry')(function* (_previousState, { entryId, eventId }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* WaitlistService;
    return yield* service.notify(userId, eventId, entryId).pipe(
      Effect.map(
        (entry) =>
          ({ message: `Update sent to ${entry.attendeeEmail}.`, status: 'success' }) as const,
      ),
      Effect.catch((error) => Effect.succeed(failureState(error))),
    );
  }),
});
