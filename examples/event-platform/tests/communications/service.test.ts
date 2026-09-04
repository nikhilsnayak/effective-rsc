import { describe, expect, it } from '@effect/vitest';
import { Effect, Layer } from 'effect';

import { EmailGateway } from '@/modules/attendee/email-gateway';
import { CommunicationsRepository } from '@/modules/communications/repository';
import { CommunicationsService } from '@/modules/communications/service';

const event = {
  allAttendees: 1,
  checkedInAttendees: 0,
  eventId: 'event-effect-systems-summit-2026',
  eventName: 'Effect Systems Summit',
  notCheckedInAttendees: 1,
  organizationName: 'Runtime Collective',
  role: 'owner',
  status: 'published',
} as const;

const serviceLayer = (
  repository: Parameters<typeof CommunicationsRepository.layerTest>[0],
  gateway: Parameters<typeof EmailGateway.layerTest>[0] = {},
) =>
  CommunicationsService.layer.pipe(
    Layer.provide(
      Layer.merge(CommunicationsRepository.layerTest(repository), EmailGateway.layerTest(gateway)),
    ),
  );

describe('CommunicationsService', () => {
  it.effect('delivers every queued recipient and records each success', () => {
    const delivered: Array<string> = [];
    const recorded: Array<string> = [];

    return Effect.gen(function* () {
      const service = yield* CommunicationsService;
      const result = yield* service.send('user-maya', event.eventId, 'announcement-arrival');

      expect(result.recipientCount).toBe(2);
      expect(delivered).toEqual(['ada@example.test', 'grace@example.test']);
      expect(recorded).toEqual(['email-announcement-1', 'email-announcement-2']);
    }).pipe(
      Effect.provide(
        serviceLayer(
          {
            loadEvent: () => Effect.succeed(event),
            markEmailSent: (emailId) => {
              recorded.push(emailId);
              return Effect.succeed(true);
            },
            queueAnnouncement: () =>
              Effect.succeed({
                announcement: {
                  announcementId: 'announcement-arrival',
                  audience: 'all_attendees',
                  body: 'Doors open at 08:30.',
                  createdAt: '2026-09-04T08:00:00Z',
                  deliveredCount: 0,
                  pendingCount: 2,
                  recipientCount: 2,
                  sentAt: '2026-09-04T08:01:00Z',
                  status: 'sent',
                  subject: 'Arrival information',
                  updatedAt: '2026-09-04T08:01:00Z',
                },
                messages: [
                  {
                    body: 'Doors open at 08:30.',
                    emailId: 'email-announcement-1',
                    recipient: 'ada@example.test',
                    subject: 'Arrival information',
                  },
                  {
                    body: 'Doors open at 08:30.',
                    emailId: 'email-announcement-2',
                    recipient: 'grace@example.test',
                    subject: 'Arrival information',
                  },
                ],
              }),
          },
          {
            deliver: (message) => {
              delivered.push(message.recipient);
              return Effect.void;
            },
          },
        ),
      ),
    );
  });

  it.effect('rejects unauthorized workspaces before loading announcement history', () => {
    let loadedAnnouncements = false;

    return Effect.gen(function* () {
      const service = yield* CommunicationsService;
      const error = yield* service.workspace('user-nikhil', event.eventId).pipe(Effect.flip);

      expect(error._tag).toBe(
        '@effective-rsc/example-event-platform/communications/CommunicationsAccessDenied',
      );
      expect(loadedAnnouncements).toBe(false);
    }).pipe(
      Effect.provide(
        serviceLayer({
          listAnnouncements: () => {
            loadedAnnouncements = true;
            return Effect.succeed([]);
          },
          loadEvent: () => Effect.succeed(null),
        }),
      ),
    );
  });
});
