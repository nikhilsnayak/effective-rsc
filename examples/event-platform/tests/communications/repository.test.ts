import { SqliteClient } from '@effect/sql-sqlite-bun';
import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { CommunicationsRepository } from '@/modules/communications/repository';
import { runMigrations } from '@/persistence/Migrations';

const PersistenceLayer = Layer.effectDiscard(runMigrations).pipe(
  Layer.provideMerge(SqliteClient.layer({ filename: ':memory:' })),
);
const RepositoryLayer = CommunicationsRepository.layer.pipe(Layer.provide(PersistenceLayer));

describe('CommunicationsRepository', () => {
  it.effect('scopes drafts, resolves an audience, and reports outbox delivery', () =>
    Effect.gen(function* () {
      const repository = yield* CommunicationsRepository;
      const eventId = 'event-effect-systems-summit-2026';
      const announcementId = 'announcement-arrival';

      const event = yield* repository.loadEvent('user-maya', eventId);
      expect(event).toMatchObject({
        allAttendees: 1,
        checkedInAttendees: 0,
        notCheckedInAttendees: 1,
        role: 'owner',
      });

      const saved = yield* repository.saveDraft(
        'user-maya',
        {
          announcementId,
          audience: 'not_checked_in',
          body: 'Doors open at 08:30. Bring your ticket code.',
          eventId,
          subject: 'Arrival information',
        },
        '2026-09-04T08:00:00Z',
      );
      expect(saved).toBe(true);
      const drafts = yield* repository.listAnnouncements('user-maya', eventId);
      expect(drafts).toMatchObject([{ announcementId, recipientCount: 0, status: 'draft' }]);

      const queued = yield* repository.queueAnnouncement(
        'user-maya',
        eventId,
        announcementId,
        '2026-09-04T08:01:00Z',
      );
      expect(queued?.messages).toEqual([
        {
          body: 'Doors open at 08:30. Bring your ticket code.',
          emailId: 'email-announcement-arrival-1',
          recipient: 'ada@example.test',
          subject: 'Arrival information',
        },
      ]);
      expect(queued?.announcement).toMatchObject({ pendingCount: 1, recipientCount: 1 });

      const retried = yield* repository.queueAnnouncement(
        'user-maya',
        eventId,
        announcementId,
        '2026-09-04T08:01:01Z',
      );
      expect(retried?.messages.map(({ emailId }) => emailId)).toEqual([
        'email-announcement-arrival-1',
      ]);

      const marked = yield* repository.markEmailSent(
        'email-announcement-arrival-1',
        '2026-09-04T08:01:02Z',
      );
      expect(marked).toBe(true);
      const sent = yield* repository.listAnnouncements('user-maya', eventId);
      expect(sent).toMatchObject([{ deliveredCount: 1, pendingCount: 0, status: 'sent' }]);
    }).pipe(Effect.provide(RepositoryLayer)),
  );

  it.effect('does not expose communications to check-in-only staff', () =>
    Effect.gen(function* () {
      const repository = yield* CommunicationsRepository;
      const eventId = 'event-effect-systems-summit-2026';
      const event = yield* repository.loadEvent('user-nikhil', eventId);
      const saved = yield* repository.saveDraft(
        'user-nikhil',
        {
          announcementId: 'announcement-hidden',
          audience: 'all_attendees',
          body: 'This must not be saved.',
          eventId,
          subject: 'Hidden',
        },
        '2026-09-04T08:00:00Z',
      );

      expect(event).toBeNull();
      expect(saved).toBe(false);
      const announcements = yield* repository.listAnnouncements('user-nikhil', eventId);
      expect(announcements).toEqual([]);
    }).pipe(Effect.provide(RepositoryLayer)),
  );
});
