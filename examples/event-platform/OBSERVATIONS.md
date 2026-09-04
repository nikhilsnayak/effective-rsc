# Implementation observations

This file records evidence surfaced while building realistic product workflows. It is not a
framework backlog: observations should be promoted to framework decisions only after they are
reproduced independently and reviewed against `docs/DECISIONS.md` and `docs/OPEN_QUESTIONS.md`.

## Registration form mutation state

The checkout form needs both decoded `FormData` and a typed result for inline decline, inventory,
and idempotency feedback. A direct native form action fits the one-input Server Function contract,
but React's `useActionState` adds a previous-state argument. The example therefore invokes the
FormData Server Function from a client transition and stores the typed result locally.

This is concrete product evidence for existing open question OQ-008. It is not yet evidence that a
new transport or framework-specific form abstraction is necessary.

## E2E ownership

The event-platform E2E suite should describe product journeys and user-visible outcomes. Protocol,
compiler, development-mode, and navigation mechanics belong in `fixtures/framework-e2e`. If a
product journey exposes a framework regression, preserve the journey here and add a minimal
mechanism-level reproduction to that fixture.

The initial copy inherited 28 kitchen-sink checks, so changes to unrelated protocol details made
the product suite slow and brittle. The suite now contains nine journeys covering public discovery,
registration through attendee ticket management, the complete author-publish-discover-register
lifecycle, reporting,
communications, refunds, waitlists, registration configuration, and reversible venue check-in.
Production and development each use an independent in-memory SQLite database so mutable journeys
cannot race or leak state between servers.

## Registration controls share the checkout transaction

Discount redemption, ticket reservation, order creation, and custom-answer persistence happen in
one SQL transaction. The order snapshots subtotal, discount, applied code, and final total so
historical purchases do not change when promotion settings later change. An idempotent replay does
not consume another redemption, while a declined payment releases both ticket inventory and the
limited-use promotion allocation.

Question definitions are always reloaded and validated on the server before inventory is reserved.
Required answers, select membership, duplicate answers, and stale question identifiers therefore do
not rely on browser markup for enforcement. Archiving removes a question from future checkout while
preserving its existing answers for order operations.

## Waitlist promotion stops at a status update

Joining a sold-out waitlist is idempotent by event, ticket type, and normalized attendee email. It
does not collect payment details or issue a credential. An authorized manager explicitly promotes a
waiting entry, which atomically changes its state and creates a deterministic outbox message before
the local email gateway is invoked.

The example deliberately models promotion as a status update rather than an automatic purchase. Its
message explicitly says that no place is reserved. The sold-out demo allocation is backed by an
organizer-owned inventory-hold record rather than unexplained pending checkout reservations. A
production integration would normally release those holds and add expiring, capacity-backed claim
tokens before promising recipients a guaranteed place; silently charging a stored payment method is
outside this fixture's deterministic payment boundary.

## Checkout identity, credentials, and interruption

Checkout idempotency is scoped by event and bound to a canonical fingerprint of the buyer, ticket,
discount, payment intent, and custom answers. Reusing a key for different input is rejected instead
of returning another attendee's receipt. The payment adapter receives the same event-scoped identity.

Ticket credentials and attendee sessions have separate random values. The QR-visible ticket code is
therefore sufficient for venue check-in but cannot be transformed into an attendee-hub session.
Once payment succeeds, ticket issuance runs uninterruptibly; interruption or failure while payment is
still pending releases inventory and discount usage. Database triggers close the remaining
check-then-write races for event ticket allocation and programme room or speaker conflicts.

## Reporting authorization and aggregation

Financial reporting is restricted to organization owners, administrators, and event managers.
Check-in staff can still see attendance totals in the operational console, but cannot load orders,
revenue, or ticket-sales breakdowns. Both the event lookup and every aggregate query apply that
membership scope, so authorization is not lost below the service boundary.

Revenue and payment outcomes remain grouped by currency instead of coercing an event into an
unenforced single-currency assumption. The report deliberately derives live values from ticket,
order, and credential state rather than maintaining a separate projection; that is appropriate for
the example's data volume and keeps mutations immediately observable after the framework refreshes
the RSC payload. A production-scale platform would likely promote these aggregates to an owned
reporting projection once query cost justified the extra consistency machinery.

## Transactional attendee communications

Announcements reuse the attendee email outbox instead of introducing a second delivery model. An
authorized manager first saves a draft, then atomically freezes its audience and creates one
deterministic pending outbox record per distinct eligible attendee email. Delivery updates those
records individually, which makes partial progress visible and retryable without sending again to
recipients already marked as delivered.

Audience membership is evaluated from paid, non-cancelled credentials at send time. This avoids
stale recipient lists while a message remains a draft and gives checked-in versus not-yet-checked-in
targeting a direct relationship to venue operations. The local gateway delivers synchronously so
the example stays deterministic; the outbox boundary remains suitable evidence for moving delivery
to an independently owned worker in a production deployment.

## Order refunds as one transaction

Refunding a paid order updates commercial, credential, inventory, audit, and notification state in
one SQL transaction. The organizer cannot observe a refunded order whose ticket remains valid or
whose capacity was not returned. The notification then crosses the email-gateway boundary and is
marked delivered independently; a failure there leaves the durable pending outbox record available
for later delivery rather than rolling back the already-authoritative refund.

## Mutation-driven route refresh

The check-in console keeps immediate scan feedback in client state while its attendance totals and
audit trail remain server-rendered. Invoking the check-in Server Function refreshes the current RSC
route after the action settles, so those server-owned views reconcile without application-specific
cache invalidation or a document reload.

This is a useful positive capability for operational screens. The product-level E2E journey verifies
that arrival totals and the audit trail reconcile after check-in and undo; lower-level refresh
semantics remain framework test coverage rather than event-platform assertions.

## Root route precedence over public assets

The application declares its catalog with `.page('/', EventCatalogPage)`. It originally returned
the router's empty 404 response for both HTML and Flight while nested routes and conventional public
assets returned 200.

The framework mounts public assets at `/*`; Effect's static-server helper also registers that
wildcard at the empty root path. Application and asset Layers previously registered concurrently,
so the asset root could win before the application's exact `/` entry. Removing the physical
`public/` directory did not restore fallthrough because route selection occurred before the static
handler checked the filesystem.

The framework now registers application routes before asset fallbacks, making precedence
independent of Layer acquisition timing. The event-platform E2E suite carries the product-level
regression assertion that `/` renders the public catalog, and both Playwright servers use `/` as
their readiness URL. The example does not conceal the behavior with a static page or client-side
redirect.

## Navigation-aware View Transitions

The client router tags React transitions with navigation mechanism and direction, including
`navigation-push`, `navigation-traverse`, `navigation-forward`, and `navigation-backward`. Server
Function refreshes carry `server-function`, development refreshes carry `hmr-refresh`, and
navigations for which the user agent already supplied a visual transition also carry
`navigation-ua-visual-transition`. The event platform consumes these types without adding click
handlers or duplicating route-history inference in application code.

Suspense content, mutation feedback, and keyed operational lists use independent reveal or update
boundaries. `server-function` refreshes can therefore animate only the affected product surface,
while page-level motion stays disabled. CSS globally disables every View Transition animation for
`hmr-refresh` and `navigation-ua-visual-transition`; the latter avoids competing with a transition
already owned by the browser. Reduced-motion preferences disable every View Transition animation.

An initial pass also shared event and ticket titles between cards and deeper pages. Frame-by-frame
review rejected those boundaries: card/detail typography changed from 20–24 px to 36–48 px, so the
incoming-only text snapshot visibly snapped size during backward traversal. Programme and
registration headings shared only the event-name fragment, leaving adjacent words behind in the
page snapshot to collide with the moving title. These text shares were removed; the directional
page transition already communicates navigation depth without distorting readable content.

The same review shortened directional movement from 320 ms to the existing 210 ms entrance token
and replaced built-in easing with strong ease-out and ease-in-out curves. Navigation is a frequent
interaction, so it should feel crisp; the longer timing made small capture-cadence variations read
as stutter.

## Traversal transition background flash

Frame-by-frame inspection of attendee and ticket traversal showed that the persistent shell never
disappeared, ruling out a document reload or an incomplete router commit. The
flash came from the application animation timeline: the old snapshot reached zero opacity after
140 ms while the new snapshot's fade was delayed by the same 140 ms, briefly leaving both
transparent over Chromium's white transition canvas.

Navigation fades now overlap, and the top-level View Transition overlay uses the application's
background token as a defensive fallback. The fix is entirely application CSS; the framework's
traversal direction and route publication behavior did not require a change.
