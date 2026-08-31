# Open questions

Do not settle these implicitly. When implementation supplies decisive evidence, remove the question
and add or revise its owning decision.

IDs are append-only and never reused, including after a question is resolved.

## Open

### OQ-003 — Route-parameter Schema rejection

- **Question:** How should a matched Page's path-parameter Schema rejection map to NotFound or another expected failure?
- **Why:** Effect HTTP has already selected the route, but the application-level Schema can still reject captured values.
- **Affected:** Page rendering, HTTP status, error boundaries, and navigation Flight. Any non-200 answer widens `RequestOutcome['status']`, which is `200` today.
- **Evidence:** Parameter Schemas currently fail in the Page render Effect after route selection.
- **Related:** D-028, D-046.
- **Resolution:** Unresolved.
- **Status:** Open.

### OQ-004 — Typed search parameters

- **Question:** How should Pages declare and decode typed search parameters?
- **Why:** Search parameters have multiplicity, defaults, and navigation semantics distinct from route parameters.
- **Affected:** Page authoring, URLs, routing, and navigation refreshes.
- **Evidence:** The current Page contract models only Effect HTTP path captures.
- **Related:** D-028, D-046.
- **Resolution:** Unresolved.
- **Status:** Open.

### OQ-006 — Server Function failure channel

- **Question:** How should a Server Function handler's typed failure reach its caller?
- **Why:** Effect owns the application runtime, but a handler's error type is the one part of its signature the client contract does not carry.
- **Affected:** `ERSC.ServerFn.make` typing, Flight payloads, client call sites, and error boundaries.
- **Evidence:** `ServerFnOperationError` stores the failure as `Schema.Defect` and `serverFnOutcome` squashes it, so `ServerFunction<Input, Output, Services>` resolves `Promise<Output>` and delivers failures as `unknown`. The kitchen-sink encodes its own `AgendaMutationState` result in `Output` to work around this.
- **Related:** D-009, D-036, D-040.
- **Resolution:** Unresolved.
- **Status:** Open.

### OQ-008 — Multi-argument Server Function input

- **Question:** How should ERSC model React actions that receive both previous state and submitted
  input?
- **Why:** `ERSC.ServerFn.make` currently models one encoded input. Direct form actions fit that
  contract, while `useActionState` payload actions receive `(previousState, payload)`.
- **Affected:** Server Function Schema authoring, `useActionState`, progressive enhancement, and
  client reference typing.
- **Evidence:** `Schema.fromFormData(...)` provides a sound one-argument `FormData` contract but
  cannot describe React's two-argument action signature without loosening inference or adding an
  explicit API shape.
- **Related:** D-009, D-036, D-040, OQ-006.
- **Resolution:** Unresolved.
- **Status:** Open.

## Deferred

### OQ-002 — Suspensing Loading diagnostics

- **Question:** How should development diagnose an `ERSC.Loading.make` renderer that calls `use` or otherwise throws a thenable internally?
- **Why:** Its declared renderer rejects Promise and Effect outputs, but TypeScript cannot detect suspension hidden inside synchronous code.
- **Affected:** Loading authoring, development diagnostics, and HMR error presentation.
- **Evidence:** The static contract catches direct async outputs but not hidden suspension.
- **Related:** D-016, D-039, D-041–D-043.
- **Resolution:** The static contract rejects direct Promise and Effect outputs. Detecting suspension
  hidden inside a renderer requires development-only React instrumentation and a deliberate error
  presentation path; do not add that runtime machinery for `0.1.0`.
- **Status:** Deferred until framework development error presentation exists.

### OQ-007 — Packaged framework agent evaluation

- **Question:** How should effective-rsc evaluate whether a fresh agent can discover the public API,
  scaffold an application, and complete a realistic build using only published package artifacts?
- **Why:** Type checks and integration tests validate framework behavior but do not measure CLI,
  documentation, diagnostics, or API discoverability for a new user or agent.
- **Candidate:** Use two layers: deterministic scaffold, type-check, build, start, route, and 404
  checks in CI; plus a fresh-context agent evaluation at milestones or before publishing.
- **Anti-overfitting:** Rotate several versioned application briefs with the same feature matrix but
  different domains. Keep some briefs absent from examples and documentation.
- **Scoring:** Record setup, documentation, API discovery, type experience, routing, services,
  Server Functions, styling/build/runtime, diagnostics, confidence on another application, and an
  independently justified overall score.
- **Evidence:** The first packaged-artifact evaluation uses local `effective-rsc` and
  `create-ersc-app` tarballs to build City Signals without source-repository context.
- **Affected:** Release confidence, `create-ersc-app`, package documentation, `LLMS.md`, public API
  design, and diagnostics.
- **Related:** D-052, D-053.
- **Resolution:** Future exploration; use the first run to define assertions and a result schema
  without embedding its solution.
- **Status:** Deferred until the baseline framework feature set is ready.
