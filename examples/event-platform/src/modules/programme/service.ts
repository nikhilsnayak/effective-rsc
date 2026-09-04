import { Context, DateTime, Effect, Layer, Option } from 'effect';

import {
  ProgrammeAccessDenied,
  ProgrammeCapacityInvalid,
  ProgrammeConflict,
  type ProgrammeEditor,
  ProgrammeNameConflict,
  ProgrammeResourceNotManaged,
  ProgrammeScheduleInvalid,
  type ProgrammeSessionStatus,
  ProgrammeUnavailable,
  PublicProgrammeNotFound,
  type RoomInput,
  type SessionInput,
  type SpeakerInput,
} from '@/modules/programme/model';
import { ProgrammeRepository } from '@/modules/programme/repository';

const unavailable = (operation: string) =>
  Effect.mapError(() => new ProgrammeUnavailable({ operation }));

export type ProgrammeError =
  | ProgrammeAccessDenied
  | ProgrammeCapacityInvalid
  | ProgrammeConflict
  | ProgrammeNameConflict
  | ProgrammeResourceNotManaged
  | ProgrammeScheduleInvalid
  | ProgrammeUnavailable
  | PublicProgrammeNotFound;

const localInstant = (value: string, timezone: string, field: string) => {
  const zone = DateTime.zoneMakeNamed(timezone);
  if (Option.isNone(zone)) {
    return Effect.fail(new ProgrammeScheduleInvalid({ field: 'timezone' }));
  }
  const instant = DateTime.makeZoned(value, {
    adjustForTimeZone: true,
    disambiguation: 'reject',
    timeZone: zone.value,
  });

  return Effect.fromOption(instant, () => new ProgrammeScheduleInvalid({ field }));
};

const normalizedSession = Effect.fnUntraced(function* (
  input: SessionInput,
  editor: ProgrammeEditor,
) {
  const room = editor.rooms.find(({ roomId }) => roomId === input.roomId);
  if (room === undefined) {
    return yield* new ProgrammeResourceNotManaged({
      resourceId: input.roomId,
      resourceType: 'room',
    });
  }
  const speaker = editor.speakers.find(({ speakerId }) => speakerId === input.speakerId);
  if (speaker === undefined) {
    return yield* new ProgrammeResourceNotManaged({
      resourceId: input.speakerId,
      resourceType: 'speaker',
    });
  }
  if (input.capacity > room.capacity || input.capacity > editor.event.capacity) {
    return yield* new ProgrammeCapacityInvalid({ resourceId: input.sessionId ?? 'new-session' });
  }

  const start = yield* localInstant(input.startsAt, editor.event.timezone, 'startsAt');
  const end = yield* localInstant(input.endsAt, editor.event.timezone, 'endsAt');
  const eventStart = DateTime.makeUnsafe(editor.event.startsAt);
  const eventEnd = DateTime.makeUnsafe(editor.event.endsAt);
  if (!DateTime.isLessThan(start, end)) {
    return yield* new ProgrammeScheduleInvalid({ field: 'endsAt' });
  }
  if (DateTime.isLessThan(start, eventStart)) {
    return yield* new ProgrammeScheduleInvalid({ field: 'startsAt' });
  }
  if (DateTime.isLessThan(eventEnd, end)) {
    return yield* new ProgrammeScheduleInvalid({ field: 'endsAt' });
  }

  return {
    ...input,
    endsAt: DateTime.formatIso(end),
    startsAt: DateTime.formatIso(start),
  };
});

export class ProgrammeService extends Context.Service<ProgrammeService>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeService',
  {
    make: Effect.gen(function* () {
      const repository = yield* ProgrammeRepository;
      const authorize = Effect.fnUntraced(function* (userId: string, eventId: string) {
        const editor = yield* repository
          .loadEditor(userId, eventId)
          .pipe(unavailable('load programme workspace'));
        if (editor === null) {
          return yield* new ProgrammeAccessDenied({ eventId, userId });
        }
        return editor;
      });

      return {
        editor: Effect.fn('ProgrammeService.editor')(function* (userId: string, eventId: string) {
          return yield* authorize(userId, eventId);
        }),
        publicProgramme: Effect.fn('ProgrammeService.publicProgramme')(function* (
          organizationSlug: string,
          eventSlug: string,
        ) {
          const programme = yield* repository
            .loadPublic(organizationSlug, eventSlug)
            .pipe(unavailable('load public programme'));
          if (programme === null) {
            return yield* new PublicProgrammeNotFound({ eventSlug, organizationSlug });
          }
          return programme;
        }),
        readiness: Effect.fn('ProgrammeService.readiness')(function* (
          userId: string,
          eventId: string,
        ) {
          const editor = yield* authorize(userId, eventId);
          const publishedSessions = editor.sessions.filter(
            ({ status }) => status === 'published',
          ).length;
          return {
            canPublish: editor.rooms.length > 0 && editor.speakers.length > 0,
            draftSessions: editor.sessions.filter(({ status }) => status === 'draft').length,
            publishedSessions,
            totalSessions: editor.sessions.length,
          };
        }),
        saveRoom: Effect.fn('ProgrammeService.saveRoom')(function* (
          userId: string,
          input: RoomInput,
        ) {
          const editor = yield* authorize(userId, input.eventId);
          const current =
            input.roomId === undefined
              ? undefined
              : editor.rooms.find(({ roomId }) => roomId === input.roomId);
          if (input.roomId !== undefined && current === undefined) {
            return yield* new ProgrammeResourceNotManaged({
              resourceId: input.roomId,
              resourceType: 'room',
            });
          }
          if (input.capacity > editor.event.capacity) {
            return yield* new ProgrammeCapacityInvalid({ resourceId: input.roomId ?? 'new-room' });
          }
          const collides = editor.rooms.some(
            (room) =>
              room.roomId !== input.roomId &&
              room.name.localeCompare(input.name, undefined, { sensitivity: 'accent' }) === 0,
          );
          if (collides) {
            return yield* new ProgrammeNameConflict({ name: input.name, resourceType: 'room' });
          }
          if (
            input.roomId !== undefined &&
            editor.sessions.some(
              (session) => session.roomId === input.roomId && session.capacity > input.capacity,
            )
          ) {
            return yield* new ProgrammeCapacityInvalid({ resourceId: input.roomId });
          }

          const currentTime = yield* DateTime.now;
          const now = DateTime.formatIso(currentTime);
          const roomId = yield* repository
            .saveRoom(userId, input, now)
            .pipe(unavailable('save programme room'));
          if (roomId === null) {
            return yield* new ProgrammeAccessDenied({ eventId: input.eventId, userId });
          }
          return { operation: input.roomId === undefined ? 'created' : 'updated', roomId } as const;
        }),
        saveSession: Effect.fn('ProgrammeService.saveSession')(function* (
          userId: string,
          input: SessionInput,
        ) {
          const editor = yield* authorize(userId, input.eventId);
          if (
            input.sessionId !== undefined &&
            !editor.sessions.some(({ sessionId }) => sessionId === input.sessionId)
          ) {
            return yield* new ProgrammeResourceNotManaged({
              resourceId: input.sessionId,
              resourceType: 'session',
            });
          }
          const normalized = yield* normalizedSession(input, editor);
          const excludingSessionId = input.sessionId ?? null;
          const roomConflict = yield* repository
            .hasRoomConflict(
              input.eventId,
              input.roomId,
              normalized.startsAt,
              normalized.endsAt,
              excludingSessionId,
            )
            .pipe(unavailable('check room availability'));
          if (roomConflict) {
            return yield* new ProgrammeConflict({
              resourceId: input.roomId,
              resourceType: 'room',
            });
          }
          const speakerConflict = yield* repository
            .hasSpeakerConflict(
              input.eventId,
              input.speakerId,
              normalized.startsAt,
              normalized.endsAt,
              excludingSessionId,
            )
            .pipe(unavailable('check speaker availability'));
          if (speakerConflict) {
            return yield* new ProgrammeConflict({
              resourceId: input.speakerId,
              resourceType: 'speaker',
            });
          }

          const currentTime = yield* DateTime.now;
          const now = DateTime.formatIso(currentTime);
          const sessionId = yield* repository
            .saveSession(userId, normalized, now)
            .pipe(unavailable('save programme session'));
          if (sessionId === null) {
            return yield* new ProgrammeAccessDenied({ eventId: input.eventId, userId });
          }
          return {
            operation: input.sessionId === undefined ? 'created' : 'updated',
            sessionId,
          } as const;
        }),
        saveSpeaker: Effect.fn('ProgrammeService.saveSpeaker')(function* (
          userId: string,
          input: SpeakerInput,
        ) {
          const editor = yield* authorize(userId, input.eventId);
          if (
            input.speakerId !== undefined &&
            !editor.speakers.some(({ speakerId }) => speakerId === input.speakerId)
          ) {
            return yield* new ProgrammeResourceNotManaged({
              resourceId: input.speakerId,
              resourceType: 'speaker',
            });
          }

          const currentTime = yield* DateTime.now;
          const now = DateTime.formatIso(currentTime);
          const speakerId = yield* repository
            .saveSpeaker(userId, input, now)
            .pipe(unavailable('save programme speaker'));
          if (speakerId === null) {
            return yield* new ProgrammeAccessDenied({ eventId: input.eventId, userId });
          }
          return {
            operation: input.speakerId === undefined ? 'created' : 'updated',
            speakerId,
          } as const;
        }),
        setSessionStatus: Effect.fn('ProgrammeService.setSessionStatus')(function* (
          userId: string,
          eventId: string,
          sessionId: string,
          status: ProgrammeSessionStatus,
        ) {
          const editor = yield* authorize(userId, eventId);
          const session = editor.sessions.find((candidate) => candidate.sessionId === sessionId);
          if (session === undefined) {
            return yield* new ProgrammeResourceNotManaged({
              resourceId: sessionId,
              resourceType: 'session',
            });
          }
          if (status === 'published' && session.status === 'cancelled') {
            const roomConflict = yield* repository
              .hasRoomConflict(eventId, session.roomId, session.startsAt, session.endsAt, sessionId)
              .pipe(unavailable('check room availability'));
            if (roomConflict) {
              return yield* new ProgrammeConflict({
                resourceId: session.roomId,
                resourceType: 'room',
              });
            }
            const speakerConflict = yield* repository
              .hasSpeakerConflict(
                eventId,
                session.speakerId,
                session.startsAt,
                session.endsAt,
                sessionId,
              )
              .pipe(unavailable('check speaker availability'));
            if (speakerConflict) {
              return yield* new ProgrammeConflict({
                resourceId: session.speakerId,
                resourceType: 'speaker',
              });
            }
          }
          const currentTime = yield* DateTime.now;
          const now = DateTime.formatIso(currentTime);
          const updated = yield* repository
            .setSessionStatus(userId, eventId, sessionId, status, now)
            .pipe(unavailable('update session publication'));
          if (!updated) {
            return yield* new ProgrammeResourceNotManaged({
              resourceId: sessionId,
              resourceType: 'session',
            });
          }
          return { sessionId, status };
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
}
