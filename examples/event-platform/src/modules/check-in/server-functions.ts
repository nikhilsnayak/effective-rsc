'use server';

import { Effect, Schema } from 'effect';

import { CheckInTicket } from '@/modules/check-in/model';
import { type CheckInError, type CheckInResult, CheckInService } from '@/modules/check-in/service';
import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';

const CheckInMutationState = Schema.Union([
  Schema.Struct({
    message: Schema.String,
    outcome: Schema.Literals(['already_checked_in', 'checked_in', 'reopened']),
    status: Schema.Literal('success'),
    ticket: CheckInTicket,
  }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal('error') }),
]);
export type CheckInMutationState = typeof CheckInMutationState.Type;

const successState = (result: CheckInResult): CheckInMutationState => {
  switch (result._tag) {
    case 'CheckedIn':
      return {
        message: `${result.ticket.holderName} is checked in.`,
        outcome: 'checked_in',
        status: 'success',
        ticket: result.ticket,
      };
    case 'AlreadyCheckedIn':
      return {
        message: `${result.ticket.holderName} was already checked in.`,
        outcome: 'already_checked_in',
        status: 'success',
        ticket: result.ticket,
      };
    case 'Reopened':
      return {
        message: `${result.ticket.holderName}'s check-in was undone.`,
        outcome: 'reopened',
        status: 'success',
        ticket: result.ticket,
      };
  }
};

const failureState = (error: CheckInError): CheckInMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/check-in/CheckInAccessDenied':
      return { message: 'Your staff identity cannot operate this event.', status: 'error' };
    case '@effective-rsc/example-event-platform/check-in/CheckInCredentialNotFound':
      return { message: 'No ticket matched this credential for the event.', status: 'error' };
    case '@effective-rsc/example-event-platform/check-in/CheckInTicketCancelled':
      return { message: 'This ticket is cancelled and cannot be checked in.', status: 'error' };
    case '@effective-rsc/example-event-platform/check-in/CheckInTicketNotCheckedIn':
      return { message: 'This ticket is not currently checked in.', status: 'error' };
    case '@effective-rsc/example-event-platform/check-in/CheckInConcurrentUpdate':
      return {
        message: 'Another staff request changed this ticket. Scan it again.',
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/check-in/CheckInUnavailable':
      return {
        message: 'Check-in is temporarily unavailable. Please try again.',
        status: 'error',
      };
  }
};

const execute = <E extends CheckInError>(effect: Effect.Effect<CheckInResult, E>) =>
  effect.pipe(
    Effect.map(successState),
    Effect.catch((error) => Effect.succeed(failureState(error))),
  );

const CredentialInput = Schema.fromFormData(
  Schema.Struct({
    eventId: Schema.NonEmptyString,
    operation: Schema.Literals(['check_in', 'undo']),
    ticketCode: Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1)),
  }),
);

export const mutateCheckIn = OrganizerERSC.ServerFn.make({
  input: [Schema.NullOr(CheckInMutationState), CredentialInput],
  handler: Effect.fn('mutateCheckIn')(function* (
    _previousState,
    { eventId, operation, ticketCode },
  ) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* CheckInService;
    if (operation === 'check_in') {
      return yield* execute(service.checkIn(userId, eventId, ticketCode));
    }
    return yield* execute(service.undo(userId, eventId, ticketCode));
  }),
});
