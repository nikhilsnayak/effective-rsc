# Event platform

A conference operations application spanning organizations and events. Framework protocol and
lifecycle verification lives in `fixtures/framework-e2e`.

## Run it

```sh
bun run dev
```

Open `http://localhost:18193`. `bun run build` then `bun run start` runs the production build.

Application state uses a durable Bun SQLite database at `.data/event-platform.sqlite`. Migrations
seed two fictional organizations and public events. Remove the local database when you
intentionally want to replay the seed data, or set `EVENT_PLATFORM_DATABASE_FILENAME` to choose
another SQLite database. Ticket sale windows use UTC in storage; a migration repairs older
local-time values using the owning event’s timezone.

## Test it

```sh
bun run test      # Vitest: calendar formatting, repository, service
bun run test:e2e  # Playwright: product journeys in production and development
```

After a build, E2E journeys run against production on port 18204 and development on 18205. Each
journey gets a fresh server and seeded in-memory SQLite database, including retries. The suite uses
one worker and owns both ports; normal development can continue on 18193.

## What it exercises

| Framework concern               | Where                                                                                                                         |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Application composition         | `src/application.tsx`                                                                                                         |
| Root Layout owning the document | `src/modules/platform/components/platform-shell.tsx`                                                                          |
| Static and parameterized Pages  | `src/modules/{event,programme}/components/`                                                                                   |
| Nested Routes, Loading, mounts  | `src/modules/{attendee,organizer,programme}/routes.tsx`                                                                       |
| Scoped middleware and redirect  | `src/modules/{attendee,organizer}/`                                                                                           |
| Effectful Components            | Server-rendered pages and dashboard fragments throughout `src/modules/`                                                       |
| Server Functions                | `src/modules/{event-authoring,programme,registration,registration-settings,waitlist,attendee,check-in,communications,orders}` |
| React View Transitions          | `src/components/navigation-transition.tsx`, shared titles, lists, and reveals                                                 |
| Client Components               | Forms and operational controls throughout `src/modules/`                                                                      |
| Userland Effect HTTP            | `src/modules/attendee/http.ts` (`GET /attendee/access/:token`)                                                                |
| Services and layers             | `src/modules/*/{service,repository}.ts`                                                                                       |
| Effect SQL and Bun SQLite       | `src/persistence/`                                                                                                            |
| Tailwind v4 through Rspack      | `src/styles.css`                                                                                                              |

`src/ersc.ts` declares the service universe once; application values come from one ERSC identity
and its derived middleware views.

## Product features

- Public multi-organization catalog at `/events/:organizationSlug/:eventSlug`, including completed
  events and published, database-backed programmes.
- Role-aware organizer studio at `/organizer`: private drafts, public copy, venues, timezone-aware
  scheduling, capacity, optimistic edits, and ticket inventory/visibility for owners, admins, and
  event managers. Organizations, memberships, events, and agenda state are durable and seeded by
  migrations.
- Programme editor at `/organizer/events/:eventId/programme`: reusable rooms/speakers, conflict
  prevention, session capacities and draft/published/cancelled states. Event edits preserve session
  date and capacity constraints.
- Public registration at `/events/:organizationSlug/:eventSlug/register`: idempotent orders,
  atomic limited-use discounts, validated attendee questions, deterministic payment outcomes, and
  ticket codes. Sold-out waitlists support idempotent joining and manager status updates.
- Registration settings at `/organizer/events/:eventId/registration`: text/select questions,
  required fields, archival, and answers visible on orders.
- Attendee hub at `/attendee`: magic-link sessions, ownership-scoped tickets, QR credentials,
  holder corrections, and a local transactional-email mailbox.
- Staff console at `/organizer/check-in/:eventId`: organization-role authorization, credential
  lookup, idempotent/reversible scans, live totals, and an immutable operator audit trail.
- Manager tools under `/organizer/events/:eventId`: `/reports` combines inventory, revenue,
  payments, credentials, and check-ins; `/communications` provides audience-targeted drafts, outbox
  delivery, retryable messages, and totals; `/orders` provides purchase history and audited refunds
  with credential cancellation, inventory restoration, and attendee notification. `/waitlist`
  manages waiting attendees.

## Local adapters

Organizer authentication defaults to seeded `user-nikhil`. Set a `gather-organizer` cookie to another
seeded or unknown user ID to exercise authorization. Nikhil is check-in staff for Effect Systems
Summit; ticket `GTH-DEMOADA0001` exercises its console.

Attendee authentication defaults to `demo-attendee-ada`. Seeded sessions, sale windows, and discounts
are long-lived to keep the example usable. Checkout creates a random 30-day attendee session and
returns `/attendee/access/:token`; the endpoint validates the token before setting the HTTP-only
`gather-attendee-session` cookie. Tokens cannot be derived from QR-visible ticket codes.

All identities, payments, emails, and operational records are fictional local adapters. This showcase
excludes production provider integrations, multi-ticket carts, scheduled communications, and
capacity-backed waitlist claims.
