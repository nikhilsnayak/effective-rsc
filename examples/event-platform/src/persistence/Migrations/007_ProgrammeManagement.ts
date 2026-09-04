import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE event_rooms (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (event_id, name)
    )
  `;

  yield* sql`
    CREATE TABLE event_speakers (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      role TEXT NOT NULL,
      organization TEXT NOT NULL,
      bio TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE programme_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      room_id TEXT NOT NULL REFERENCES event_rooms(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'cancelled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (starts_at < ends_at)
    )
  `;

  yield* sql`
    CREATE TABLE programme_session_speakers (
      session_id TEXT NOT NULL REFERENCES programme_sessions(id) ON DELETE CASCADE,
      speaker_id TEXT NOT NULL REFERENCES event_speakers(id) ON DELETE RESTRICT,
      PRIMARY KEY (session_id, speaker_id)
    )
  `;

  yield* sql`
    CREATE INDEX event_rooms_event_idx
    ON event_rooms (event_id, name)
  `;

  yield* sql`
    CREATE INDEX event_speakers_event_idx
    ON event_speakers (event_id, name)
  `;

  yield* sql`
    CREATE INDEX programme_sessions_event_schedule_idx
    ON programme_sessions (event_id, starts_at, status)
  `;

  yield* sql`
    CREATE INDEX programme_sessions_room_schedule_idx
    ON programme_sessions (room_id, starts_at, ends_at)
  `;

  yield* sql`
    INSERT INTO event_rooms (id, event_id, name, capacity, created_at, updated_at)
    VALUES
      (
        'room-conference-auditorium',
        'event-effective-rsc-conf-2026',
        'Auditorium',
        260,
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'room-conference-studio',
        'event-effective-rsc-conf-2026',
        'Studio',
        90,
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'room-workshop-studio',
        'event-rsc-workshop-lab-2026',
        'Workshop studio',
        80,
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      ),
      (
        'room-workshop-clinic',
        'event-rsc-workshop-lab-2026',
        'Debugging clinic',
        28,
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      ),
      (
        'room-summit-main',
        'event-effect-systems-summit-2026',
        'Main hall',
        240,
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      )
  `;

  yield* sql`
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
    VALUES
      (
        'speaker-conference-nikhil',
        'event-effective-rsc-conf-2026',
        'Nikhil Nayak',
        'Creator',
        'effective-rsc',
        'Nikhil builds effective-rsc and explores explicit runtime boundaries for server-first React.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-conference-maya',
        'event-effective-rsc-conf-2026',
        'Maya Iyer',
        'Runtime engineer',
        'Runtime Collective',
        'Maya designs resilient services around typed effects and explicit lifecycles.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-conference-theo',
        'event-effective-rsc-conf-2026',
        'Theo Martins',
        'Browser platform engineer',
        'Open Systems Lab',
        'Theo works on browser primitives for navigation, streaming, and responsive interfaces.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-conference-leena',
        'event-effective-rsc-conf-2026',
        'Leena Shah',
        'Design engineer',
        'Independent',
        'Leena designs interruption-friendly product interactions and resilient interface systems.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-conference-rohan',
        'event-effective-rsc-conf-2026',
        'Rohan Mehta',
        'Framework engineer',
        'Runtime Collective',
        'Rohan builds cache and routing systems for server-rendered applications.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-conference-anika',
        'event-effective-rsc-conf-2026',
        'Anika Rao',
        'Type systems researcher',
        'Independent',
        'Anika studies typed application protocols and composable failure models.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-conference-jonah',
        'event-effective-rsc-conf-2026',
        'Jonah Kim',
        'Web platform lead',
        'Open Systems Lab',
        'Jonah helps product teams adopt modern browser APIs with progressive enhancement.',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'speaker-workshop-priya',
        'event-rsc-workshop-lab-2026',
        'Priya Shah',
        'Staff engineer',
        'Runtime Collective',
        'Priya builds server-first React systems and the tooling teams use to understand them.',
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      ),
      (
        'speaker-workshop-daniel',
        'event-rsc-workshop-lab-2026',
        'Daniel Kim',
        'Developer experience lead',
        'Open Systems Lab',
        'Daniel works on reproducible debugging workflows for distributed applications.',
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      ),
      (
        'speaker-summit-maya',
        'event-effect-systems-summit-2026',
        'Maya Iyer',
        'Founder',
        'Runtime Collective',
        'Maya helps teams design resilient services around typed effects and explicit lifecycles.',
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      )
  `;

  yield* sql`
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
    VALUES
      (
        'session-conference-rsc-principles',
        'event-effective-rsc-conf-2026',
        'room-conference-auditorium',
        'Server Components from first principles',
        'A ground-up look at Flight, full-document streaming, and the module graphs behind a Server Component application.',
        '2026-08-22T04:00:00Z',
        '2026-08-22T04:45:00Z',
        260,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-conference-effect-runtime',
        'event-effective-rsc-conf-2026',
        'room-conference-auditorium',
        'Effect is the runtime, not a utility belt',
        'What changes when typed errors, interruption, resources, and observability are the foundation of an application runtime?',
        '2026-08-22T05:15:00Z',
        '2026-08-22T06:00:00Z',
        260,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-conference-router',
        'event-effective-rsc-conf-2026',
        'room-conference-studio',
        'A router that waits for the UI',
        'Using Suspense, transitions, and the Navigation API to make the URL and the revealed interface commit as one event.',
        '2026-08-22T06:30:00Z',
        '2026-08-22T07:15:00Z',
        90,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-conference-interruption',
        'event-effective-rsc-conf-2026',
        'room-conference-studio',
        'Designing for interruption',
        'Practical design techniques for loading, cancellation, optimistic state, and interfaces that remain composed under pressure.',
        '2026-08-22T09:00:00Z',
        '2026-08-22T09:45:00Z',
        90,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-conference-cache',
        'event-effective-rsc-conf-2026',
        'room-conference-auditorium',
        'Cache the work, not the page',
        'A segment-oriented cache model for instant navigation without turning the whole application into a stale snapshot.',
        '2026-08-23T04:00:00Z',
        '2026-08-23T04:45:00Z',
        260,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-conference-mutations',
        'event-effective-rsc-conf-2026',
        'room-conference-studio',
        'Mutation protocols that compose',
        'Preserving React’s native mutation protocol while adding typed inputs, failures, and application-managed lifetimes.',
        '2026-08-23T05:15:00Z',
        '2026-08-23T06:00:00Z',
        90,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-conference-browser',
        'event-effective-rsc-conf-2026',
        'room-conference-auditorium',
        'The browser is the platform',
        'A tour of the modern browser APIs that let frameworks become smaller while application interactions become richer.',
        '2026-08-23T06:30:00Z',
        '2026-08-23T07:15:00Z',
        260,
        'published',
        '2026-08-01T09:00:00Z',
        '2026-08-01T09:00:00Z'
      ),
      (
        'session-workshop-flight',
        'event-rsc-workshop-lab-2026',
        'room-workshop-studio',
        'Flight protocol from first principles',
        'Trace an RSC request from the route boundary through rendering, Flight, and hydration.',
        '2026-12-05T04:30:00Z',
        '2026-12-05T06:00:00Z',
        80,
        'draft',
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      ),
      (
        'session-workshop-debugging',
        'event-rsc-workshop-lab-2026',
        'room-workshop-clinic',
        'Request-scope debugging clinic',
        'Diagnose cancellation, serialization, and module-graph failures with a repeatable workflow.',
        '2026-12-05T07:00:00Z',
        '2026-12-05T08:30:00Z',
        28,
        'draft',
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      ),
      (
        'session-summit-keynote',
        'event-effect-systems-summit-2026',
        'room-summit-main',
        'Effects as an operating model',
        'A field report on making failures, resources, and concurrency visible across a product organization.',
        '2026-11-12T08:30:00Z',
        '2026-11-12T09:20:00Z',
        240,
        'published',
        '2026-09-03T09:00:00Z',
        '2026-09-03T09:00:00Z'
      )
  `;

  yield* sql`
    INSERT INTO programme_session_speakers (session_id, speaker_id)
    VALUES
      ('session-conference-rsc-principles', 'speaker-conference-nikhil'),
      ('session-conference-effect-runtime', 'speaker-conference-maya'),
      ('session-conference-router', 'speaker-conference-theo'),
      ('session-conference-interruption', 'speaker-conference-leena'),
      ('session-conference-cache', 'speaker-conference-rohan'),
      ('session-conference-mutations', 'speaker-conference-anika'),
      ('session-conference-browser', 'speaker-conference-jonah'),
      ('session-workshop-flight', 'speaker-workshop-priya'),
      ('session-workshop-debugging', 'speaker-workshop-daniel'),
      ('session-summit-keynote', 'speaker-summit-maya')
  `;
});
