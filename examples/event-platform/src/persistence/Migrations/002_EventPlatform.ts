import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE TABLE organizations (
      id TEXT PRIMARY KEY NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE users (
      id TEXT PRIMARY KEY NOT NULL,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `;

  yield* sql`
    CREATE TABLE organization_memberships (
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'event_manager', 'check_in_staff', 'viewer')),
      created_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, user_id)
    )
  `;

  yield* sql`
    CREATE TABLE events (
      id TEXT PRIMARY KEY NOT NULL,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      slug TEXT NOT NULL,
      name TEXT NOT NULL,
      tagline TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),
      format TEXT NOT NULL CHECK (format = 'in_person'),
      timezone TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      locality TEXT NOT NULL,
      country_code TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK (capacity > 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (organization_id, slug),
      CHECK (starts_at < ends_at)
    )
  `;

  yield* sql`
    INSERT INTO organizations (id, slug, name, created_at)
    VALUES
      ('org-effective-rsc', 'effective-rsc', 'Effective RSC', '2026-01-15T09:00:00Z'),
      ('org-runtime-collective', 'runtime-collective', 'Runtime Collective', '2026-04-08T09:00:00Z')
  `;

  yield* sql`
    INSERT INTO users (id, email, name, created_at)
    VALUES
      ('user-nikhil', 'nikhil@example.test', 'Nikhil Nayak', '2026-01-15T09:00:00Z'),
      ('user-maya', 'maya@example.test', 'Maya Iyer', '2026-04-08T09:00:00Z')
  `;

  yield* sql`
    INSERT INTO organization_memberships (organization_id, user_id, role, created_at)
    VALUES
      ('org-effective-rsc', 'user-nikhil', 'owner', '2026-01-15T09:00:00Z'),
      ('org-runtime-collective', 'user-maya', 'owner', '2026-04-08T09:00:00Z')
  `;

  yield* sql`
    INSERT INTO events (
      id,
      organization_id,
      slug,
      name,
      tagline,
      description,
      status,
      format,
      timezone,
      venue_name,
      locality,
      country_code,
      starts_at,
      ends_at,
      capacity,
      created_at,
      updated_at
    )
    VALUES
      (
        'event-effective-rsc-conf-2026',
        'org-effective-rsc',
        'effective-rsc-conf-2026',
        'effective-rsc Conf',
        'Two days on React Server Components and the Effect runtime.',
        'A focused professional conference for people building server-first React applications.',
        'completed',
        'in_person',
        'Asia/Kolkata',
        'Bangalore International Centre',
        'Bengaluru',
        'IN',
        '2026-08-22T09:30:00+05:30',
        '2026-08-23T16:30:00+05:30',
        320,
        '2026-01-15T09:00:00Z',
        '2026-08-23T12:00:00Z'
      ),
      (
        'event-effect-systems-summit-2026',
        'org-runtime-collective',
        'effect-systems-summit-2026',
        'Effect Systems Summit',
        'Operational software built around typed effects.',
        'A one-day gathering for engineers designing resilient services, workflows, and developer tools.',
        'published',
        'in_person',
        'Europe/Amsterdam',
        'De Hallen Studios',
        'Amsterdam',
        'NL',
        '2026-11-12T09:00:00+01:00',
        '2026-11-12T18:00:00+01:00',
        240,
        '2026-04-08T09:00:00Z',
        '2026-08-28T09:00:00Z'
      )
  `;
});
