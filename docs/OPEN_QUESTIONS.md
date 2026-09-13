# Open questions

Do not settle these implicitly. When evidence resolves a question, remove it and add or revise the
owning decision. IDs are append-only and never reused.

## Open

### OQ-004 — Typed search parameters

How should Pages declare and decode search parameters? Multiplicity, defaults, and navigation
semantics differ from path captures, which are all the current Page contract models. The answer
must cover authoring, URLs, routing, and refreshes. Related: D-028, D-046.

## Deferred

### OQ-002 — Loading suspension diagnostics

How should development detect `use` or a thrown thenable inside a Loading renderer? Types reject
Promise/Effect outputs but cannot detect hidden suspension. The panel handles ordinary build and
runtime failures; Loading-specific React instrumentation remains outside the baseline until its
approach is settled. Related: D-016, D-039, D-041–D-043.

### OQ-007 — Packaged framework agent evaluation

How should a fresh agent demonstrate API discovery, scaffolding, and realistic application work
using published artifacts alone? Unit and integration tests cannot measure that experience.

The candidate has two layers: deterministic scaffold, type-check, build, start, route, and `404`
checks in CI; fresh-context agent evaluations at milestones or before publishing. Rotate versioned
briefs with equivalent feature coverage and different domains; keep some absent from examples/docs.
Score setup, docs/API discovery, types, routing, services, Server Functions, styling/build/runtime,
diagnostics, confidence on another application, and an independently justified overall result.

The first run uses local framework/CLI tarballs for City Signals without repository context. Use it
to define assertions and a result schema without embedding its solution. Deferred until the baseline
feature set is ready. Related: D-052, D-053.

### OQ-009 — Stream-aware history scroll restoration

When should the router capture and restore positions for routes streaming after their first commit?
D-066 permits native navigation to finish against a Suspense fallback. A skipped framework E2E test
reproduces Back traversal clamping a saved offset against that fallback and retaining the wrong
position after content arrives; default forward reset works.

Keep native behavior for now. A future design must key positions by exact history entry and account
for later reveals, hash navigation, focus, and a safe restoration point. Related: D-066.

### OQ-010 — Typed application navigation transition APIs

How should links and programmatic navigation share type-safe application transition names?
`data-ersc-transition-types` carries intent without choosing a Link component, helper factory, or
global type registration. The site uses it for Previous/Next/document order, but misspellings are
unchecked.

Keep plain attributes until application navigation APIs are designed; settle naming, API shape,
and type safety together. Existing Server Function client helpers do not resolve this question.
Related: D-018, D-047, D-067, D-071.
