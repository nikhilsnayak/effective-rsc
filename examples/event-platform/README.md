# Event platform

The real-world effective-rsc product example: a multi-organization, multi-event conference
operations platform. Framework-mechanism coverage lives separately in `fixtures/framework-e2e`.

## Run it

```sh
bun run dev
```

Open `http://localhost:18193`. `bun run build` then `bun run start` runs the production build.

Application state uses a durable Bun SQLite database at `.data/event-platform.sqlite`. Migrations
seed two fictional organizations and public events. Remove the local database when you
intentionally want to replay the seed data, or set `EVENT_PLATFORM_DATABASE_FILENAME` to choose
another SQLite database.

## Test it

```sh
bun run test      # Vitest: calendar formatting, repository, service
bun run test:e2e  # Playwright: product journeys in production and development
```

After a build, `test:e2e` runs every product journey twice: once against `ersc start` on port 18204
and once against `ersc dev` on port 18205. Each server gets its own in-memory SQLite database and
seed data, so the projects cannot race through shared state. Playwright owns both E2E ports, so the
normal development server can keep running on port 18193.

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

## Current product surface

- Public catalog spanning multiple organizations and events.
- Tenant-scoped event addresses at `/events/:organizationSlug/:eventSlug`.
- Durable organizations, memberships, events, and agenda state with migration-owned seed data.
- Organization-scoped organizer studio at `/organizer`, including role-aware access and guarded event
  lifecycle transitions.
- Event authoring for owner, admin, and event-manager roles, including private draft creation,
  public copy, venue and timezone-aware scheduling, capacity, optimistic edits, and ticket-type
  inventory and visibility controls.
- Programme management at `/organizer/events/:eventId/programme`, including reusable rooms and
  speaker profiles, timezone-aware session scheduling, room and speaker conflict prevention,
  capacity constraints, and per-session draft, published, and cancelled states.
- Database-backed public programmes at
  `/events/:organizationSlug/:eventSlug/programme`; only published sessions are visible.
- Public registration at `/events/:organizationSlug/:eventSlug/register`, with ticket inventory,
  idempotent orders, atomic limited-use discounts, server-validated custom attendee questions,
  deterministic payment approval/decline, and issued ticket codes.
- Sold-out ticket waitlists with idempotent public joining and manager-driven status updates at
  `/organizer/events/:eventId/waitlist`.
- Manager-owned registration questions at `/organizer/events/:eventId/registration`, including
  text and select answers, required-field enforcement, archival, and answer visibility on orders.
- Attendee hub at `/attendee`, with magic-link session exchange, ownership-scoped ticket access,
  scannable QR credentials, holder corrections, and a local transactional-email mailbox.
- Staff check-in console at `/organizer/check-in/:eventId`, with organization-role authorization,
  credential lookup, idempotent scans, reversible check-ins, live attendance totals, and an
  immutable operator audit trail.
- Manager-only event reporting at `/organizer/events/:eventId/reports`, combining ticket inventory,
  paid revenue, payment outcomes, issued credentials, and check-in conversion.
- Manager-only attendee communications at `/organizer/events/:eventId/communications`, with saved
  drafts, operational audience targeting, transactional outbox delivery, retryable pending messages,
  and delivery totals surfaced back to organizers.
- Manager-only order administration at `/organizer/events/:eventId/orders`, with purchase history,
  atomic audited refunds, credential cancellation, inventory restoration, and attendee notification.
- Completed-event archives remain discoverable and use the same database-backed programme as live
  events.

The local authentication adapter selects seeded organizer `user-nikhil` by default. Set a
`gather-organizer` cookie to another seeded or unknown user ID to exercise role and access-denied
paths without an external identity provider. Nikhil is also seeded as check-in staff for Effect
Systems Summit; use ticket code `GTH-DEMOADA0001` in its console to exercise venue operations.

The attendee adapter selects seeded session `demo-attendee-ada` by default. Its lifetime and the
seeded ticket-sale and discount windows are intentionally long-lived so the fixture does not expire.
A completed checkout creates an independent, cryptographically random 30-day attendee session and
returns its `/attendee/access/:token` magic-link path. The token cannot be derived from the QR-visible
ticket code. The endpoint validates it before storing it in the HTTP-only
`gather-attendee-session` cookie.

This is a 0.1 showcase, not a production service. Identity, payment, and email use deterministic
local adapters, and all organizations, events, outcomes, messages, and operational records are
fictional. Provider integrations, multi-ticket carts, scheduled communications, and capacity-backed
waitlist claims are intentionally outside this release.
