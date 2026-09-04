'use server';

import { Effect, Schema } from 'effect';

import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import type { ManagedEventStatus } from '@/modules/organizer/model';
import { OrganizerService } from '@/modules/organizer/service';

export type EventStatusMutationState = {
  readonly eventStatus: ManagedEventStatus | null;
  readonly message: string;
  readonly status: 'error' | 'success';
};

const TransitionEventInput = Schema.Struct({
  eventId: Schema.NonEmptyString,
  targetStatus: Schema.Literals(['published', 'cancelled', 'completed']),
});

export const transitionEventStatus = OrganizerERSC.ServerFn.make({
  input: TransitionEventInput,
  handler: Effect.fn('transitionEventStatus')(function* ({ eventId, targetStatus }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* OrganizerService;
    const outcome = yield* service.transitionEvent(userId, eventId, targetStatus).pipe(
      Effect.map((event) => ({ event, _tag: 'Success' }) as const),
      Effect.catch((error) => Effect.succeed({ error, _tag: 'Failure' } as const)),
    );

    if (outcome._tag === 'Success') {
      return {
        eventStatus: outcome.event.status,
        message: `Event moved to ${outcome.event.status}.`,
        status: 'success',
      } satisfies EventStatusMutationState;
    }

    const { error } = outcome;
    switch (error._tag) {
      case '@effective-rsc/example-event-platform/organizer/OrganizerAccessDenied':
        return {
          eventStatus: null,
          message: 'Your demo identity cannot manage this event.',
          status: 'error',
        } satisfies EventStatusMutationState;
      case '@effective-rsc/example-event-platform/organizer/EventStatusTransitionRejected':
        return {
          eventStatus: error.currentStatus,
          message: `An event cannot move from ${error.currentStatus} to ${error.targetStatus}.`,
          status: 'error',
        } satisfies EventStatusMutationState;
      case '@effective-rsc/example-event-platform/organizer/EventConcurrentUpdate':
        return {
          eventStatus: null,
          message: 'The event changed in another request. Review its current status and try again.',
          status: 'error',
        } satisfies EventStatusMutationState;
      case '@effective-rsc/example-event-platform/organizer/OrganizerUnavailable':
        return {
          eventStatus: null,
          message: 'The organizer workspace is temporarily unavailable. Please try again.',
          status: 'error',
        } satisfies EventStatusMutationState;
    }
  }),
});
