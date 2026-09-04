import { Effect } from 'effect';
import { SqlClient } from 'effect/unstable/sql/SqlClient';

export default Effect.gen(function* () {
  const sql = yield* SqlClient;

  yield* sql`
    CREATE INDEX events_organization_status_idx
    ON events (organization_id, status)
  `;

  yield* sql`
    CREATE INDEX organization_memberships_user_idx
    ON organization_memberships (user_id, organization_id)
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
    VALUES (
      'event-rsc-workshop-lab-2026',
      'org-effective-rsc',
      'rsc-workshop-lab-2026',
      'RSC Workshop Lab',
      'A practical day for building with the native RSC protocol.',
      'A small-group workshop moving from Flight fundamentals through mutations, navigation, and production diagnostics.',
      'draft',
      'in_person',
      'Asia/Kolkata',
      'Bangalore International Centre',
      'Bengaluru',
      'IN',
      '2026-12-05T09:30:00+05:30',
      '2026-12-05T17:30:00+05:30',
      80,
      '2026-08-30T09:00:00Z',
      '2026-08-30T09:00:00Z'
    )
  `;
});
