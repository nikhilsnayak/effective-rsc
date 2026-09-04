'use server';

import { Effect, Schema } from 'effect';

import { CurrentOrganizer, OrganizerERSC } from '@/modules/organizer/current-organizer';
import type { ProgrammeError } from '@/modules/programme/service';
import { ProgrammeService } from '@/modules/programme/service';

export type ProgrammeMutationState =
  | { readonly message: string; readonly status: 'success' }
  | { readonly message: string; readonly status: 'error' };

const RequiredText = (maximum: number) =>
  Schema.String.check(Schema.isTrimmed(), Schema.isMinLength(1), Schema.isMaxLength(maximum));
const PositiveInteger = Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThan(0));
const LocalDateTime = Schema.String.check(Schema.isPattern(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/));

const SaveRoomInput = Schema.fromFormData(
  Schema.Struct({
    capacity: PositiveInteger,
    eventId: Schema.NonEmptyString,
    name: RequiredText(100),
    roomId: Schema.optionalKey(Schema.NonEmptyString),
  }),
);
const SaveSpeakerInput = Schema.fromFormData(
  Schema.Struct({
    bio: RequiredText(1_500),
    eventId: Schema.NonEmptyString,
    name: RequiredText(120),
    organization: RequiredText(120),
    role: RequiredText(120),
    speakerId: Schema.optionalKey(Schema.NonEmptyString),
  }),
);
const SaveSessionInput = Schema.fromFormData(
  Schema.Struct({
    capacity: PositiveInteger,
    endsAt: LocalDateTime,
    eventId: Schema.NonEmptyString,
    roomId: Schema.NonEmptyString,
    sessionId: Schema.optionalKey(Schema.NonEmptyString),
    speakerId: Schema.NonEmptyString,
    startsAt: LocalDateTime,
    summary: RequiredText(1_000),
    title: RequiredText(160),
  }),
);
const SetSessionStatusInput = Schema.Struct({
  eventId: Schema.NonEmptyString,
  sessionId: Schema.NonEmptyString,
  status: Schema.Literals(['draft', 'published', 'cancelled']),
});

const failureState = (error: ProgrammeError): ProgrammeMutationState => {
  switch (error._tag) {
    case '@effective-rsc/example-event-platform/programme/ProgrammeAccessDenied':
      return { message: 'Your organizer role cannot manage this programme.', status: 'error' };
    case '@effective-rsc/example-event-platform/programme/ProgrammeResourceNotManaged':
      return { message: 'That programme resource is unavailable for this event.', status: 'error' };
    case '@effective-rsc/example-event-platform/programme/ProgrammeScheduleInvalid':
      return {
        message: `Check ${error.field}. Sessions must fall within the event schedule.`,
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/programme/ProgrammeCapacityInvalid':
      return {
        message: 'Capacity exceeds its room or event, or conflicts with a scheduled session.',
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/programme/ProgrammeConflict':
      return {
        message: `That ${error.resourceType} is already booked during this time.`,
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/programme/ProgrammeNameConflict':
      return {
        message: `A ${error.resourceType} named “${error.name}” already exists.`,
        status: 'error',
      };
    case '@effective-rsc/example-event-platform/programme/PublicProgrammeNotFound':
      return { message: 'The public programme is unavailable.', status: 'error' };
    case '@effective-rsc/example-event-platform/programme/ProgrammeUnavailable':
      return { message: 'Programme management is temporarily unavailable.', status: 'error' };
  }
};

const result = <A>(effect: Effect.Effect<A, ProgrammeError>, message: (value: A) => string) =>
  effect.pipe(
    Effect.map((value) => ({ message: message(value), status: 'success' }) as const),
    Effect.catch((error) => Effect.succeed(failureState(error))),
  );

export const saveRoom = OrganizerERSC.ServerFn.make({
  input: SaveRoomInput,
  handler: Effect.fn('saveRoom')(function* (input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ProgrammeService;
    return yield* result(service.saveRoom(userId, input), ({ operation }) =>
      operation === 'created' ? 'Room created.' : 'Room saved.',
    );
  }),
});

export const saveSpeaker = OrganizerERSC.ServerFn.make({
  input: SaveSpeakerInput,
  handler: Effect.fn('saveSpeaker')(function* (input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ProgrammeService;
    return yield* result(service.saveSpeaker(userId, input), ({ operation }) =>
      operation === 'created' ? 'Speaker created.' : 'Speaker saved.',
    );
  }),
});

export const saveSession = OrganizerERSC.ServerFn.make({
  input: SaveSessionInput,
  handler: Effect.fn('saveSession')(function* (input) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ProgrammeService;
    return yield* result(service.saveSession(userId, input), ({ operation }) =>
      operation === 'created' ? 'Draft session created.' : 'Session saved.',
    );
  }),
});

export const setSessionStatus = OrganizerERSC.ServerFn.make({
  input: SetSessionStatusInput,
  handler: Effect.fn('setSessionStatus')(function* ({ eventId, sessionId, status }) {
    const { userId } = yield* CurrentOrganizer;
    const service = yield* ProgrammeService;
    return yield* result(
      service.setSessionStatus(userId, eventId, sessionId, status),
      ({ status: nextStatus }) =>
        nextStatus === 'published'
          ? 'Session published.'
          : nextStatus === 'cancelled'
            ? 'Session cancelled.'
            : 'Session moved to draft.',
    );
  }),
});
