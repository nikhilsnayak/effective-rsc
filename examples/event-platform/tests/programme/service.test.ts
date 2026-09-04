import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import type { ProgrammeEditor, SessionInput } from '@/modules/programme/model';
import { ProgrammeRepository } from '@/modules/programme/repository';
import { ProgrammeService } from '@/modules/programme/service';

const editor = {
  event: {
    capacity: 80,
    endsAt: '2026-12-05T12:00:00.000Z',
    eventId: 'event-workshop',
    eventName: 'RSC Workshop Lab',
    eventSlug: 'rsc-workshop-lab',
    organizationName: 'Effective RSC',
    organizationSlug: 'effective-rsc',
    startsAt: '2026-12-05T04:00:00.000Z',
    status: 'draft',
    timezone: 'Asia/Kolkata',
  },
  rooms: [{ capacity: 40, name: 'Workshop room', roomId: 'room-workshop' }],
  sessions: [],
  speakers: [
    {
      bio: 'Builds typed server systems.',
      name: 'Priya Shah',
      organization: 'Runtime Collective',
      role: 'Staff engineer',
      speakerId: 'speaker-priya',
    },
  ],
} satisfies ProgrammeEditor;

const sessionInput = {
  capacity: 40,
  endsAt: '2026-12-05T12:00',
  eventId: editor.event.eventId,
  roomId: 'room-workshop',
  speakerId: 'speaker-priya',
  startsAt: '2026-12-05T10:30',
  summary: 'Trace the full request lifecycle.',
  title: 'Flight from first principles',
} satisfies SessionInput;

describe('ProgrammeService', () => {
  it.effect('normalizes local session times before persistence', () => {
    let persisted: SessionInput | undefined;
    const ServiceLayer = ProgrammeService.layer.pipe(
      Layer.provide(
        ProgrammeRepository.layerTest({
          hasRoomConflict: () => Effect.succeed(false),
          hasSpeakerConflict: () => Effect.succeed(false),
          loadEditor: () => Effect.succeed(editor),
          saveSession: (_userId, input) =>
            Effect.sync(() => {
              persisted = input;
              return 'session-created';
            }),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* ProgrammeService;
      const saved = yield* service.saveSession('user-nikhil', sessionInput);

      expect(saved.operation).toBe('created');
      expect(persisted?.startsAt).toBe('2026-12-05T05:00:00.000Z');
      expect(persisted?.endsAt).toBe('2026-12-05T06:30:00.000Z');
    }).pipe(Effect.provide(ServiceLayer));
  });

  it.effect('rejects overlapping room bookings before persistence', () => {
    const ServiceLayer = ProgrammeService.layer.pipe(
      Layer.provide(
        ProgrammeRepository.layerTest({
          hasRoomConflict: () => Effect.succeed(true),
          loadEditor: () => Effect.succeed(editor),
          saveSession: () => Effect.die(new Error('conflicting session must not be persisted')),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* ProgrammeService;
      const error = yield* service.saveSession('user-nikhil', sessionInput).pipe(Effect.flip);

      expect(error._tag).toBe('@effective-rsc/example-event-platform/programme/ProgrammeConflict');
      if (error._tag === '@effective-rsc/example-event-platform/programme/ProgrammeConflict') {
        expect(error.resourceType).toBe('room');
      }
    }).pipe(Effect.provide(ServiceLayer));
  });

  it.effect('rejects sessions outside the event boundary', () => {
    const ServiceLayer = ProgrammeService.layer.pipe(
      Layer.provide(
        ProgrammeRepository.layerTest({
          loadEditor: () => Effect.succeed(editor),
          saveSession: () => Effect.die(new Error('invalid session must not be persisted')),
        }),
      ),
    );

    return Effect.gen(function* () {
      const service = yield* ProgrammeService;
      const error = yield* service
        .saveSession('user-nikhil', { ...sessionInput, startsAt: '2026-12-05T08:00' })
        .pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/programme/ProgrammeScheduleInvalid',
      );
    }).pipe(Effect.provide(ServiceLayer));
  });
});
