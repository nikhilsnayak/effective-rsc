import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import type { OutboundEmail } from '@/modules/attendee/email-gateway';
import {
  Announcement,
  type AnnouncementAudience,
  CommunicationEvent,
  type SaveAnnouncementInput,
} from '@/modules/communications/model';

const CommunicationEvents = Schema.Array(CommunicationEvent);
const Announcements = Schema.Array(Announcement);
const Recipient = Schema.Struct({ recipient: Schema.String });
const PendingMessage = Schema.Struct({
  body: Schema.String,
  emailId: Schema.String,
  recipient: Schema.String,
  subject: Schema.String,
});

export type QueuedAnnouncement = {
  readonly announcement: Announcement;
  readonly messages: ReadonlyArray<OutboundEmail>;
};

export class CommunicationsRepository extends Context.Service<CommunicationsRepository>()(
  '@effective-rsc/example-event-platform/communications/CommunicationsRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      const recipientsFor = (eventId: string, audience: AnnouncementAudience) => {
        const base = (status: 'checked_in' | 'valid') => sql<Schema.Schema.Type<typeof Recipient>>`
          SELECT DISTINCT tickets.holder_email AS recipient
          FROM tickets
          INNER JOIN orders ON orders.id = tickets.order_id
          WHERE tickets.event_id = ${eventId}
            AND orders.status = 'paid'
            AND tickets.status = ${status}
          ORDER BY tickets.holder_email
        `;

        switch (audience) {
          case 'all_attendees':
            return sql<Schema.Schema.Type<typeof Recipient>>`
              SELECT DISTINCT tickets.holder_email AS recipient
              FROM tickets
              INNER JOIN orders ON orders.id = tickets.order_id
              WHERE tickets.event_id = ${eventId}
                AND orders.status = 'paid'
                AND tickets.status != 'cancelled'
              ORDER BY tickets.holder_email
            `;
          case 'checked_in':
            return base('checked_in');
          case 'not_checked_in':
            return base('valid');
        }
      };

      const listAnnouncements = Effect.fn('CommunicationsRepository.listAnnouncements')(function* (
        userId: string,
        eventId: string,
      ) {
        const rows = yield* sql<Announcement>`
            SELECT
              announcements.id AS announcementId,
              announcements.subject,
              announcements.body,
              announcements.audience,
              announcements.status,
              announcements.created_at AS createdAt,
              announcements.updated_at AS updatedAt,
              announcements.sent_at AS sentAt,
              COUNT(email_outbox.id) AS recipientCount,
              COUNT(CASE WHEN email_outbox.status = 'sent' THEN 1 END) AS deliveredCount,
              COUNT(CASE WHEN email_outbox.status = 'pending' THEN 1 END) AS pendingCount
            FROM announcements
            INNER JOIN events ON events.id = announcements.event_id
            LEFT JOIN email_outbox
              ON email_outbox.aggregate_type = 'announcement'
              AND email_outbox.aggregate_id = announcements.id
            WHERE announcements.event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            GROUP BY announcements.id
            ORDER BY announcements.updated_at DESC
          `;

        return yield* Schema.decodeEffect(Announcements)(rows);
      });

      return {
        listAnnouncements,
        loadEvent: Effect.fn('CommunicationsRepository.loadEvent')(function* (
          userId: string,
          eventId: string,
        ) {
          const rows = yield* sql<CommunicationEvent>`
            SELECT
              events.id AS eventId,
              events.name AS eventName,
              events.status,
              organizations.name AS organizationName,
              organization_memberships.role,
              COUNT(DISTINCT CASE WHEN tickets.status != 'cancelled' THEN tickets.holder_email END) AS allAttendees,
              COUNT(DISTINCT CASE WHEN tickets.status = 'checked_in' THEN tickets.holder_email END) AS checkedInAttendees,
              COUNT(DISTINCT CASE WHEN tickets.status = 'valid' THEN tickets.holder_email END) AS notCheckedInAttendees
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            LEFT JOIN tickets ON tickets.event_id = events.id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${userId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            GROUP BY events.id, organizations.id, organization_memberships.role
            LIMIT 1
          `;
          const events = yield* Schema.decodeEffect(CommunicationEvents)(rows);

          return events[0] ?? null;
        }),
        markEmailSent: Effect.fn('CommunicationsRepository.markEmailSent')(function* (
          emailId: string,
          sentAt: string,
        ) {
          const rows = yield* sql<{ readonly emailId: string }>`
            UPDATE email_outbox
            SET status = 'sent', attempts = attempts + 1, sent_at = ${sentAt}
            WHERE id = ${emailId}
              AND status = 'pending'
            RETURNING id AS emailId
          `;

          return rows.length === 1;
        }),
        queueAnnouncement: Effect.fn('CommunicationsRepository.queueAnnouncement')(function* (
          userId: string,
          eventId: string,
          announcementId: string,
          sentAt: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              const rows = yield* sql<{
                readonly audience: AnnouncementAudience;
                readonly body: string;
                readonly subject: string;
              }>`
                UPDATE announcements
                SET status = 'sent', sent_at = ${sentAt}, updated_at = ${sentAt}
                WHERE id = ${announcementId}
                  AND event_id = ${eventId}
                  AND status = 'draft'
                  AND EXISTS (
                    SELECT 1
                    FROM events
                    INNER JOIN organization_memberships
                      ON organization_memberships.organization_id = events.organization_id
                    WHERE events.id = announcements.event_id
                      AND organization_memberships.user_id = ${userId}
                      AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
                  )
                RETURNING audience, subject, body
              `;
              const announcement = rows[0];
              if (announcement === undefined) {
                const current = yield* listAnnouncements(userId, eventId);
                const saved = current.find((item) => item.announcementId === announcementId);
                if (saved?.status !== 'sent') {
                  return null;
                }
                const pendingRows = yield* sql<OutboundEmail>`
                  SELECT id AS emailId, recipient, subject, body
                  FROM email_outbox
                  WHERE aggregate_type = 'announcement'
                    AND aggregate_id = ${announcementId}
                    AND status = 'pending'
                  ORDER BY id
                `;
                const messages = yield* Schema.decodeEffect(Schema.Array(PendingMessage))(
                  pendingRows,
                );

                return { announcement: saved, messages } satisfies QueuedAnnouncement;
              }

              const recipientRows = yield* recipientsFor(eventId, announcement.audience);
              const recipients = yield* Schema.decodeEffect(Schema.Array(Recipient))(recipientRows);
              const messages: Array<OutboundEmail> = [];

              for (const [index, { recipient }] of recipients.entries()) {
                const emailId = `email-${announcementId}-${index + 1}`;
                yield* sql`
                  INSERT OR IGNORE INTO email_outbox (
                    id,
                    recipient,
                    subject,
                    body,
                    aggregate_type,
                    aggregate_id,
                    status,
                    created_at
                  )
                  VALUES (
                    ${emailId},
                    ${recipient},
                    ${announcement.subject},
                    ${announcement.body},
                    'announcement',
                    ${announcementId},
                    'pending',
                    ${sentAt}
                  )
                `;
                messages.push({
                  body: announcement.body,
                  emailId,
                  recipient,
                  subject: announcement.subject,
                });
              }

              const current = yield* listAnnouncements(userId, eventId);
              const saved = current.find((item) => item.announcementId === announcementId);
              if (saved === undefined) {
                return yield* Effect.die(
                  new TypeError(`Queued announcement "${announcementId}" could not be reloaded.`),
                );
              }

              return { announcement: saved, messages } satisfies QueuedAnnouncement;
            }),
          );
        }),
        saveDraft: Effect.fn('CommunicationsRepository.saveDraft')(function* (
          userId: string,
          input: SaveAnnouncementInput,
          savedAt: string,
        ) {
          const rows = yield* sql<{ readonly announcementId: string }>`
            INSERT INTO announcements (
              id,
              event_id,
              author_user_id,
              subject,
              body,
              audience,
              status,
              created_at,
              updated_at
            )
            SELECT
              ${input.announcementId},
              events.id,
              ${userId},
              ${input.subject},
              ${input.body},
              ${input.audience},
              'draft',
              ${savedAt},
              ${savedAt}
            FROM events
            WHERE events.id = ${input.eventId}
              AND EXISTS (
                SELECT 1
                FROM organization_memberships
                WHERE organization_memberships.organization_id = events.organization_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            ON CONFLICT(id) DO UPDATE SET
              subject = excluded.subject,
              body = excluded.body,
              audience = excluded.audience,
              updated_at = excluded.updated_at
            WHERE announcements.event_id = excluded.event_id
              AND announcements.author_user_id = excluded.author_user_id
              AND announcements.status = 'draft'
            RETURNING id AS announcementId
          `;

          return rows.length === 1;
        }),
      };
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make);
  static readonly layerTest = Layer.mock(this);
}
