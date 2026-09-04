import { Schema } from 'effect';

export const ProgrammeEvent = Schema.Struct({
  capacity: Schema.Finite,
  endsAt: Schema.String,
  eventId: Schema.String,
  eventName: Schema.String,
  eventSlug: Schema.String,
  organizationName: Schema.String,
  organizationSlug: Schema.String,
  startsAt: Schema.String,
  status: Schema.Literals(['draft', 'published', 'cancelled', 'completed']),
  timezone: Schema.String,
});
export type ProgrammeEvent = typeof ProgrammeEvent.Type;

export const ProgrammeRoom = Schema.Struct({
  capacity: Schema.Finite,
  name: Schema.String,
  roomId: Schema.String,
});
export type ProgrammeRoom = typeof ProgrammeRoom.Type;

export const ProgrammeSpeaker = Schema.Struct({
  bio: Schema.String,
  name: Schema.String,
  organization: Schema.String,
  role: Schema.String,
  speakerId: Schema.String,
});
export type ProgrammeSpeaker = typeof ProgrammeSpeaker.Type;

export const ProgrammeSessionStatus = Schema.Literals(['draft', 'published', 'cancelled']);
export type ProgrammeSessionStatus = typeof ProgrammeSessionStatus.Type;

export const ProgrammeSession = Schema.Struct({
  capacity: Schema.Finite,
  endsAt: Schema.String,
  roomId: Schema.String,
  roomName: Schema.String,
  sessionId: Schema.String,
  speakerId: Schema.String,
  speakerName: Schema.String,
  startsAt: Schema.String,
  status: ProgrammeSessionStatus,
  summary: Schema.String,
  title: Schema.String,
});
export type ProgrammeSession = typeof ProgrammeSession.Type;

export type ProgrammeEditor = {
  readonly event: ProgrammeEvent;
  readonly rooms: ReadonlyArray<ProgrammeRoom>;
  readonly sessions: ReadonlyArray<ProgrammeSession>;
  readonly speakers: ReadonlyArray<ProgrammeSpeaker>;
};

export type RoomInput = {
  readonly capacity: number;
  readonly eventId: string;
  readonly name: string;
  readonly roomId?: string;
};

export type SpeakerInput = {
  readonly bio: string;
  readonly eventId: string;
  readonly name: string;
  readonly organization: string;
  readonly role: string;
  readonly speakerId?: string;
};

export type SessionInput = {
  readonly capacity: number;
  readonly endsAt: string;
  readonly eventId: string;
  readonly roomId: string;
  readonly sessionId?: string;
  readonly speakerId: string;
  readonly startsAt: string;
  readonly summary: string;
  readonly title: string;
};

export type PublicProgramme = {
  readonly event: ProgrammeEvent;
  readonly sessions: ReadonlyArray<ProgrammeSession>;
};

export class ProgrammeAccessDenied extends Schema.TaggedError<ProgrammeAccessDenied>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeAccessDenied',
  { eventId: Schema.String, userId: Schema.String },
) {}

export class ProgrammeResourceNotManaged extends Schema.TaggedError<ProgrammeResourceNotManaged>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeResourceNotManaged',
  { resourceId: Schema.String, resourceType: Schema.String },
) {}

export class ProgrammeScheduleInvalid extends Schema.TaggedError<ProgrammeScheduleInvalid>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeScheduleInvalid',
  { field: Schema.String },
) {}

export class ProgrammeCapacityInvalid extends Schema.TaggedError<ProgrammeCapacityInvalid>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeCapacityInvalid',
  { resourceId: Schema.String },
) {}

export class ProgrammeConflict extends Schema.TaggedError<ProgrammeConflict>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeConflict',
  { resourceId: Schema.String, resourceType: Schema.Literals(['room', 'speaker']) },
) {}

export class ProgrammeNameConflict extends Schema.TaggedError<ProgrammeNameConflict>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeNameConflict',
  { name: Schema.String, resourceType: Schema.Literals(['room']) },
) {}

export class PublicProgrammeNotFound extends Schema.TaggedError<PublicProgrammeNotFound>()(
  '@effective-rsc/example-event-platform/programme/PublicProgrammeNotFound',
  { eventSlug: Schema.String, organizationSlug: Schema.String },
) {}

export class ProgrammeUnavailable extends Schema.TaggedError<ProgrammeUnavailable>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeUnavailable',
  { operation: Schema.String },
) {}
