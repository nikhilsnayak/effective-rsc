import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Exit, Layer } from 'effect';

import type { RoomInput, SessionInput, SpeakerInput } from '@/modules/programme/model';
import { ProgrammeRepository } from '@/modules/programme/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = ProgrammeRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('ProgrammeRepository', () => {
  it.effect('persists an event-scoped room, speaker, session, and publication state', () =>
    Effect.gen(function* () {
      const repository = yield* ProgrammeRepository;
      const eventId = 'event-rsc-workshop-lab-2026';
      const editor = yield* repository.loadEditor('user-nikhil', eventId);
      expect(editor?.rooms).toHaveLength(2);
      expect(editor?.speakers).toHaveLength(2);
      expect(editor?.sessions).toHaveLength(2);
      const unauthorizedEditor = yield* repository.loadEditor('user-maya', eventId);
      expect(unauthorizedEditor).toBeNull();

      const room = {
        capacity: 18,
        eventId,
        name: 'Pairing room',
      } satisfies RoomInput;
      const roomId = yield* repository.saveRoom('user-nikhil', room, '2026-09-04T08:00:00.000Z');
      expect(roomId).not.toBeNull();

      const speaker = {
        bio: 'Sam teaches teams to model request lifecycles explicitly.',
        eventId,
        name: 'Sam Rivera',
        organization: 'Protocol Works',
        role: 'Principal engineer',
      } satisfies SpeakerInput;
      const speakerId = yield* repository.saveSpeaker(
        'user-nikhil',
        speaker,
        '2026-09-04T08:00:00.000Z',
      );
      expect(speakerId).not.toBeNull();
      if (roomId === null || speakerId === null) {
        return;
      }

      const session = {
        capacity: 18,
        endsAt: '2026-12-05T10:30:00.000Z',
        eventId,
        roomId,
        speakerId,
        startsAt: '2026-12-05T09:30:00.000Z',
        summary: 'Model one request from acquisition through interruption.',
        title: 'Lifecycle pairing lab',
      } satisfies SessionInput;
      const sessionId = yield* repository.saveSession(
        'user-nikhil',
        session,
        '2026-09-04T08:00:00.000Z',
      );
      expect(sessionId).not.toBeNull();
      if (sessionId === null) {
        return;
      }

      const roomCollision = yield* repository
        .saveSession(
          'user-nikhil',
          { ...session, speakerId: 'speaker-workshop-priya', title: 'Conflicting room session' },
          '2026-09-04T08:01:00.000Z',
        )
        .pipe(Effect.exit);
      expect(Exit.isFailure(roomCollision)).toBe(true);

      const speakerCollision = yield* repository
        .saveSession(
          'user-nikhil',
          {
            ...session,
            roomId: 'room-workshop-studio',
            title: 'Conflicting speaker session',
          },
          '2026-09-04T08:02:00.000Z',
        )
        .pipe(Effect.exit);
      expect(Exit.isFailure(speakerCollision)).toBe(true);

      const roomConflict = yield* repository.hasRoomConflict(
        eventId,
        roomId,
        session.startsAt,
        session.endsAt,
        null,
      );
      const speakerConflict = yield* repository.hasSpeakerConflict(
        eventId,
        speakerId,
        session.startsAt,
        session.endsAt,
        null,
      );
      const statusUpdated = yield* repository.setSessionStatus(
        'user-nikhil',
        eventId,
        sessionId,
        'published',
        '2026-09-04T08:05:00.000Z',
      );
      expect(roomConflict).toBe(true);
      expect(speakerConflict).toBe(true);
      expect(statusUpdated).toBe(true);

      const updated = yield* repository.loadEditor('user-nikhil', eventId);
      expect(updated?.rooms.some((candidate) => candidate.roomId === roomId)).toBe(true);
      expect(updated?.speakers.some((candidate) => candidate.speakerId === speakerId)).toBe(true);
      expect(updated?.sessions.find((candidate) => candidate.sessionId === sessionId)?.status).toBe(
        'published',
      );
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('moves a session and changes its speaker using the final assignment', () =>
    Effect.gen(function* () {
      const repository = yield* ProgrammeRepository;
      const eventId = 'event-rsc-workshop-lab-2026';
      // Priya has a second booking at 09:00 in the clinic.
      yield* repository.saveSession(
        'user-nikhil',
        {
          eventId,
          roomId: 'room-workshop-clinic',
          speakerId: 'speaker-workshop-priya',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-05T10:00:00.000Z',
          capacity: 28,
          title: 'Priya’s next session',
          summary: 'A separate booking.',
        },
        '2026-09-08T10:01:00.000Z',
      );
      // Move her studio session to the same time, with Daniel replacing her.
      const sessionId = yield* repository.saveSession(
        'user-nikhil',
        {
          sessionId: 'session-workshop-flight',
          eventId,
          roomId: 'room-workshop-studio',
          speakerId: 'speaker-workshop-daniel',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-05T10:00:00.000Z',
          capacity: 80,
          title: 'Flight workshop',
          summary: 'Rescheduled with Daniel.',
        },
        '2026-09-08T10:02:00.000Z',
      );
      const editor = yield* repository.loadEditor('user-nikhil', eventId);
      expect(editor?.sessions.find((session) => session.sessionId === sessionId)).toMatchObject({
        startsAt: '2026-12-05T09:00:00.000Z',
        speakerId: 'speaker-workshop-daniel',
      });
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('rolls back both the schedule and speaker when the final assignment conflicts', () =>
    Effect.gen(function* () {
      const repository = yield* ProgrammeRepository;
      const eventId = 'event-rsc-workshop-lab-2026';
      const before = yield* repository.loadEditor('user-nikhil', eventId);
      const failed = yield* repository
        .saveSession(
          'user-nikhil',
          {
            sessionId: 'session-workshop-debugging',
            eventId,
            roomId: 'room-workshop-clinic',
            speakerId: 'speaker-workshop-priya',
            startsAt: '2026-12-05T05:00:00.000Z',
            endsAt: '2026-12-05T06:00:00.000Z',
            capacity: 28,
            title: 'Conflicting edit',
            summary: 'Priya is already speaking in the studio.',
          },
          '2026-09-08T10:00:00.000Z',
        )
        .pipe(Effect.flip);
      expect(failed.reason.cause).toMatchObject({ message: 'programme speaker conflict' });
      const after = yield* repository.loadEditor('user-nikhil', eventId);
      expect(after?.sessions).toEqual(before?.sessions);
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('leaves the speaker assignment intact when the editor is unauthorized', () =>
    Effect.gen(function* () {
      const repository = yield* ProgrammeRepository;
      const eventId = 'event-rsc-workshop-lab-2026';
      const before = yield* repository.loadEditor('user-nikhil', eventId);
      const sessionId = yield* repository.saveSession(
        'user-maya',
        {
          sessionId: 'session-workshop-debugging',
          eventId,
          roomId: 'room-workshop-clinic',
          speakerId: 'speaker-workshop-priya',
          startsAt: '2026-12-05T09:00:00.000Z',
          endsAt: '2026-12-05T10:00:00.000Z',
          capacity: 28,
          title: 'Unauthorized edit',
          summary: 'This must not be saved.',
        },
        '2026-09-08T10:00:00.000Z',
      );
      expect(sessionId).toBeNull();
      const after = yield* repository.loadEditor('user-nikhil', eventId);
      expect(after?.sessions).toEqual(before?.sessions);
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('only exposes published sessions for a public event', () =>
    Effect.gen(function* () {
      const repository = yield* ProgrammeRepository;
      const programme = yield* repository.loadPublic(
        'runtime-collective',
        'effect-systems-summit-2026',
      );
      const completedConference = yield* repository.loadPublic(
        'effective-rsc',
        'effective-rsc-conf-2026',
      );
      const draft = yield* repository.loadPublic('effective-rsc', 'rsc-workshop-lab-2026');

      expect(programme?.sessions).toHaveLength(1);
      expect(programme?.sessions[0]?.title).toBe('Effects as an operating model');
      expect(completedConference?.sessions).toHaveLength(7);
      expect(completedConference?.sessions[0]?.title).toBe(
        'Server Components from first principles',
      );
      expect(draft).toBeNull();
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
