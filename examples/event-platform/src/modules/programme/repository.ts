import { Context, Effect, Layer, Schema } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

import {
  type ProgrammeEditor,
  ProgrammeEvent,
  ProgrammeRoom,
  ProgrammeSession,
  type ProgrammeSessionStatus,
  ProgrammeSpeaker,
  type PublicProgramme,
  type RoomInput,
  type SessionInput,
  type SpeakerInput,
} from '@/modules/programme/model';

const decodeEvents = Schema.decodeUnknownEffect(Schema.Array(ProgrammeEvent));
const decodeRooms = Schema.decodeUnknownEffect(Schema.Array(ProgrammeRoom));
const decodeSessions = Schema.decodeUnknownEffect(Schema.Array(ProgrammeSession));
const decodeSpeakers = Schema.decodeUnknownEffect(Schema.Array(ProgrammeSpeaker));

export class ProgrammeRepository extends Context.Service<ProgrammeRepository>()(
  '@effective-rsc/example-event-platform/programme/ProgrammeRepository',
  {
    make: Effect.gen(function* () {
      const sql = yield* SqlClient;

      const loadSessions = Effect.fnUntraced(function* (
        eventId: string,
        visibility: 'all' | 'published',
      ) {
        const rows = yield* sql<ProgrammeSession>`
          SELECT
            programme_sessions.id AS sessionId,
            programme_sessions.title,
            programme_sessions.summary,
            programme_sessions.starts_at AS startsAt,
            programme_sessions.ends_at AS endsAt,
            programme_sessions.capacity,
            programme_sessions.status,
            event_rooms.id AS roomId,
            event_rooms.name AS roomName,
            event_speakers.id AS speakerId,
            event_speakers.name AS speakerName
          FROM programme_sessions
          INNER JOIN event_rooms ON event_rooms.id = programme_sessions.room_id
          INNER JOIN programme_session_speakers
            ON programme_session_speakers.session_id = programme_sessions.id
          INNER JOIN event_speakers
            ON event_speakers.id = programme_session_speakers.speaker_id
          WHERE programme_sessions.event_id = ${eventId}
            AND (${visibility} = 'all' OR programme_sessions.status = 'published')
          ORDER BY programme_sessions.starts_at, event_rooms.name, programme_sessions.title
        `;

        return yield* decodeSessions(rows);
      });

      return {
        hasRoomConflict: Effect.fn('ProgrammeRepository.hasRoomConflict')(function* (
          eventId: string,
          roomId: string,
          startsAt: string,
          endsAt: string,
          excludingSessionId: string | null,
        ) {
          const rows = yield* sql<{ readonly occupied: number }>`
            SELECT EXISTS (
              SELECT 1
              FROM programme_sessions
              WHERE event_id = ${eventId}
                AND room_id = ${roomId}
                AND status <> 'cancelled'
                AND starts_at < ${endsAt}
                AND ends_at > ${startsAt}
                AND (${excludingSessionId} IS NULL OR id <> ${excludingSessionId})
            ) AS occupied
          `;

          return rows[0]?.occupied === 1;
        }),
        hasSpeakerConflict: Effect.fn('ProgrammeRepository.hasSpeakerConflict')(function* (
          eventId: string,
          speakerId: string,
          startsAt: string,
          endsAt: string,
          excludingSessionId: string | null,
        ) {
          const rows = yield* sql<{ readonly occupied: number }>`
            SELECT EXISTS (
              SELECT 1
              FROM programme_sessions
              INNER JOIN programme_session_speakers
                ON programme_session_speakers.session_id = programme_sessions.id
              WHERE programme_sessions.event_id = ${eventId}
                AND programme_session_speakers.speaker_id = ${speakerId}
                AND programme_sessions.status <> 'cancelled'
                AND programme_sessions.starts_at < ${endsAt}
                AND programme_sessions.ends_at > ${startsAt}
                AND (${excludingSessionId} IS NULL OR programme_sessions.id <> ${excludingSessionId})
            ) AS occupied
          `;

          return rows[0]?.occupied === 1;
        }),
        loadEditor: Effect.fn('ProgrammeRepository.loadEditor')(function* (
          userId: string,
          eventId: string,
        ) {
          const eventRows = yield* sql<ProgrammeEvent>`
            SELECT
              events.id AS eventId,
              events.name AS eventName,
              events.slug AS eventSlug,
              events.status,
              events.timezone,
              events.starts_at AS startsAt,
              events.ends_at AS endsAt,
              events.capacity,
              organizations.name AS organizationName,
              organizations.slug AS organizationSlug
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            INNER JOIN organization_memberships
              ON organization_memberships.organization_id = events.organization_id
            WHERE events.id = ${eventId}
              AND organization_memberships.user_id = ${userId}
              AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
            LIMIT 1
          `;
          const events = yield* decodeEvents(eventRows);
          const event = events[0];
          if (event === undefined) {
            return null;
          }

          const roomRows = yield* sql<ProgrammeRoom>`
            SELECT id AS roomId, name, capacity
            FROM event_rooms
            WHERE event_id = ${eventId}
            ORDER BY name
          `;
          const speakerRows = yield* sql<ProgrammeSpeaker>`
            SELECT
              id AS speakerId,
              name,
              role,
              organization,
              bio
            FROM event_speakers
            WHERE event_id = ${eventId}
            ORDER BY name
          `;
          const rooms = yield* decodeRooms(roomRows);
          const speakers = yield* decodeSpeakers(speakerRows);
          const sessions = yield* loadSessions(eventId, 'all');

          return { event, rooms, sessions, speakers } satisfies ProgrammeEditor;
        }),
        loadPublic: Effect.fn('ProgrammeRepository.loadPublic')(function* (
          organizationSlug: string,
          eventSlug: string,
        ) {
          const eventRows = yield* sql<ProgrammeEvent>`
            SELECT
              events.id AS eventId,
              events.name AS eventName,
              events.slug AS eventSlug,
              events.status,
              events.timezone,
              events.starts_at AS startsAt,
              events.ends_at AS endsAt,
              events.capacity,
              organizations.name AS organizationName,
              organizations.slug AS organizationSlug
            FROM events
            INNER JOIN organizations ON organizations.id = events.organization_id
            WHERE organizations.slug = ${organizationSlug}
              AND events.slug = ${eventSlug}
              AND events.status IN ('published', 'completed')
            LIMIT 1
          `;
          const events = yield* decodeEvents(eventRows);
          const event = events[0];
          if (event === undefined) {
            return null;
          }
          const sessions = yield* loadSessions(event.eventId, 'published');

          return { event, sessions } satisfies PublicProgramme;
        }),
        saveRoom: Effect.fn('ProgrammeRepository.saveRoom')(function* (
          userId: string,
          input: RoomInput,
          now: string,
        ) {
          if (input.roomId === undefined) {
            const rows = yield* sql<{ readonly roomId: string }>`
              INSERT INTO event_rooms (id, event_id, name, capacity, created_at, updated_at)
              SELECT
                'room-' || lower(hex(randomblob(12))),
                events.id,
                ${input.name},
                ${input.capacity},
                ${now},
                ${now}
              FROM events
              WHERE events.id = ${input.eventId}
                AND EXISTS (
                  SELECT 1
                  FROM organization_memberships
                  WHERE organization_id = events.organization_id
                    AND user_id = ${userId}
                    AND role IN ('owner', 'admin', 'event_manager')
                )
              RETURNING id AS roomId
            `;
            return rows[0]?.roomId ?? null;
          }

          const rows = yield* sql<{ readonly roomId: string }>`
            UPDATE event_rooms
            SET name = ${input.name}, capacity = ${input.capacity}, updated_at = ${now}
            WHERE id = ${input.roomId}
              AND event_id = ${input.eventId}
              AND EXISTS (
                SELECT 1
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE events.id = event_rooms.event_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS roomId
          `;
          return rows[0]?.roomId ?? null;
        }),
        saveSession: Effect.fn('ProgrammeRepository.saveSession')(function* (
          userId: string,
          input: SessionInput,
          now: string,
        ) {
          return yield* sql.withTransaction(
            Effect.gen(function* () {
              let rows: ReadonlyArray<{ readonly sessionId: string }>;
              if (input.sessionId === undefined) {
                rows = yield* sql<{ readonly sessionId: string }>`
                    INSERT INTO programme_sessions (
                      id,
                      event_id,
                      room_id,
                      title,
                      summary,
                      starts_at,
                      ends_at,
                      capacity,
                      status,
                      created_at,
                      updated_at
                    )
                    SELECT
                      'session-' || lower(hex(randomblob(12))),
                      events.id,
                      ${input.roomId},
                      ${input.title},
                      ${input.summary},
                      ${input.startsAt},
                      ${input.endsAt},
                      ${input.capacity},
                      'draft',
                      ${now},
                      ${now}
                    FROM events
                    WHERE events.id = ${input.eventId}
                      AND EXISTS (
                        SELECT 1
                        FROM organization_memberships
                        WHERE organization_id = events.organization_id
                          AND user_id = ${userId}
                          AND role IN ('owner', 'admin', 'event_manager')
                      )
                    RETURNING id AS sessionId
                  `;
              } else {
                rows = yield* sql<{ readonly sessionId: string }>`
                    UPDATE programme_sessions
                    SET
                      room_id = ${input.roomId},
                      title = ${input.title},
                      summary = ${input.summary},
                      starts_at = ${input.startsAt},
                      ends_at = ${input.endsAt},
                      capacity = ${input.capacity},
                      updated_at = ${now}
                    WHERE id = ${input.sessionId}
                      AND event_id = ${input.eventId}
                      AND EXISTS (
                        SELECT 1
                        FROM events
                        INNER JOIN organization_memberships
                          ON organization_memberships.organization_id = events.organization_id
                        WHERE events.id = programme_sessions.event_id
                          AND organization_memberships.user_id = ${userId}
                          AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
                      )
                    RETURNING id AS sessionId
                  `;
              }
              const sessionId = rows[0]?.sessionId;
              if (sessionId === undefined) {
                return null;
              }

              yield* sql`
                DELETE FROM programme_session_speakers
                WHERE session_id = ${sessionId}
              `;
              const speakerRows = yield* sql<{ readonly speakerId: string }>`
                INSERT INTO programme_session_speakers (session_id, speaker_id)
                SELECT ${sessionId}, id
                FROM event_speakers
                WHERE id = ${input.speakerId}
                  AND event_id = ${input.eventId}
                RETURNING speaker_id AS speakerId
              `;
              if (speakerRows.length !== 1) {
                return yield* Effect.die(
                  new TypeError('A validated programme speaker disappeared during persistence.'),
                );
              }

              return sessionId;
            }),
          );
        }),
        saveSpeaker: Effect.fn('ProgrammeRepository.saveSpeaker')(function* (
          userId: string,
          input: SpeakerInput,
          now: string,
        ) {
          if (input.speakerId === undefined) {
            const rows = yield* sql<{ readonly speakerId: string }>`
              INSERT INTO event_speakers (
                id,
                event_id,
                name,
                role,
                organization,
                bio,
                created_at,
                updated_at
              )
              SELECT
                'speaker-' || lower(hex(randomblob(12))),
                events.id,
                ${input.name},
                ${input.role},
                ${input.organization},
                ${input.bio},
                ${now},
                ${now}
              FROM events
              WHERE events.id = ${input.eventId}
                AND EXISTS (
                  SELECT 1
                  FROM organization_memberships
                  WHERE organization_id = events.organization_id
                    AND user_id = ${userId}
                    AND role IN ('owner', 'admin', 'event_manager')
                )
              RETURNING id AS speakerId
            `;
            return rows[0]?.speakerId ?? null;
          }

          const rows = yield* sql<{ readonly speakerId: string }>`
            UPDATE event_speakers
            SET
              name = ${input.name},
              role = ${input.role},
              organization = ${input.organization},
              bio = ${input.bio},
              updated_at = ${now}
            WHERE id = ${input.speakerId}
              AND event_id = ${input.eventId}
              AND EXISTS (
                SELECT 1
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE events.id = event_speakers.event_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS speakerId
          `;
          return rows[0]?.speakerId ?? null;
        }),
        setSessionStatus: Effect.fn('ProgrammeRepository.setSessionStatus')(function* (
          userId: string,
          eventId: string,
          sessionId: string,
          status: ProgrammeSessionStatus,
          now: string,
        ) {
          const rows = yield* sql<{ readonly sessionId: string }>`
            UPDATE programme_sessions
            SET status = ${status}, updated_at = ${now}
            WHERE id = ${sessionId}
              AND event_id = ${eventId}
              AND EXISTS (
                SELECT 1
                FROM events
                INNER JOIN organization_memberships
                  ON organization_memberships.organization_id = events.organization_id
                WHERE events.id = programme_sessions.event_id
                  AND organization_memberships.user_id = ${userId}
                  AND organization_memberships.role IN ('owner', 'admin', 'event_manager')
              )
            RETURNING id AS sessionId
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
