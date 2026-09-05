'use server';

import { Effect, Schema } from 'effect';

import { AttendeeHubERSC, CurrentAttendeeSession } from '@/modules/attendee/current-attendee';
import { AttendeeService } from '@/modules/attendee/service';

const TicketHolderMutationState = Schema.Union([
  Schema.Struct({ message: Schema.String, status: Schema.Literal('success') }),
  Schema.Struct({ message: Schema.String, status: Schema.Literal('error') }),
]);
export type TicketHolderMutationState = typeof TicketHolderMutationState.Type;

const HolderName = Schema.String.check(
  Schema.isTrimmed(),
  Schema.isMinLength(1),
  Schema.isMaxLength(100),
);
const UpdateTicketHolderInput = Schema.fromFormData(
  Schema.Struct({
    holderName: HolderName,
    ticketId: Schema.NonEmptyString,
  }),
);

export const updateTicketHolder = AttendeeHubERSC.ServerFn.make({
  input: [Schema.NullOr(TicketHolderMutationState), UpdateTicketHolderInput],
  handler: Effect.fn('updateTicketHolder')(function* (_previousState, { holderName, ticketId }) {
    const { token } = yield* CurrentAttendeeSession;
    const service = yield* AttendeeService;
    const outcome = yield* service.updateHolderName(token, ticketId, holderName).pipe(
      Effect.as({ _tag: 'Success' } as const),
      Effect.catch((error) => Effect.succeed({ error, _tag: 'Failure' } as const)),
    );

    if (outcome._tag === 'Success') {
      return {
        message: 'Ticket holder updated.',
        status: 'success',
      } satisfies TicketHolderMutationState;
    }

    switch (outcome.error._tag) {
      case '@effective-rsc/example-event-platform/attendee/AttendeeAccessDenied':
        return {
          message: 'Your attendee session has expired.',
          status: 'error',
        } satisfies TicketHolderMutationState;
      case '@effective-rsc/example-event-platform/attendee/TicketHolderUpdateRejected':
        return {
          message: 'This ticket cannot be updated.',
          status: 'error',
        } satisfies TicketHolderMutationState;
      case '@effective-rsc/example-event-platform/attendee/AttendeeHubUnavailable':
        return {
          message: 'The attendee hub is temporarily unavailable. Please try again.',
          status: 'error',
        } satisfies TicketHolderMutationState;
    }
  }),
});
