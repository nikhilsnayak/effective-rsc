# Open questions

Do not settle these implicitly. When implementation supplies decisive evidence, remove the question
and add or revise its owning decision.

IDs are append-only and never reused, including after a question is resolved.

## OQ-001 — Streaming SSR failure policy

- **Question:** How should failures before HTML headers map to HTTP responses, and how should failures after streaming begins be reported?
- **Why:** Once headers are committed, the server cannot replace the response with an ordinary typed error response.
- **Affected:** HTML rendering, Effect HTTP responses, diagnostics, and observability.
- **Evidence:** Pre-header failures are typed `HtmlRenderError`s; post-header diagnostics are undefined.
- **Related:** D-004, D-020, D-040.
- **Resolution:** Unresolved.
- **Status:** Open.

## OQ-002 — Suspensing Loading diagnostics

- **Question:** How should development diagnose an `ERSC.Loading.make` renderer that calls `use` or otherwise throws a thenable internally?
- **Why:** Its declared renderer rejects Promise and Effect outputs, but TypeScript cannot detect suspension hidden inside synchronous code.
- **Affected:** Loading authoring, development diagnostics, and HMR error presentation.
- **Evidence:** The static contract catches direct async outputs but not hidden suspension.
- **Related:** D-016, D-039, D-041–D-043.
- **Resolution:** Revisit with the development server and HMR work.
- **Status:** Deferred until D-041–D-043.

## OQ-003 — Route-parameter Schema rejection

- **Question:** How should a matched Page's path-parameter Schema rejection map to NotFound or another expected failure?
- **Why:** Effect HTTP has already selected the route, but the application-level Schema can still reject captured values.
- **Affected:** Page rendering, HTTP status, error boundaries, and navigation Flight.
- **Evidence:** Parameter Schemas currently fail in the Page request runtime after route selection.
- **Related:** D-028, D-046.
- **Resolution:** Unresolved.
- **Status:** Open.

## OQ-004 — Typed search parameters

- **Question:** How should Pages declare and decode typed search parameters?
- **Why:** Search parameters have multiplicity, defaults, and navigation semantics distinct from route parameters.
- **Affected:** Page authoring, URLs, routing, and navigation refreshes.
- **Evidence:** The current Page contract models only Effect HTTP path captures.
- **Related:** D-028, D-046.
- **Resolution:** Unresolved.
- **Status:** Open.

## OQ-005 — Superseded committed navigation responses

- **Question:** Should a newer committed route retire an earlier committed-but-still-streaming Flight response?
- **Why:** The earlier response can continue consuming request-scoped work after a later navigation owns the visible URL.
- **Affected:** Navigation cancellation, Flight stream lifetime, resource use, and reveal behavior.
- **Evidence:** `NavigateEvent.signal` owns each intercepted navigation through its commit, while response streams can outlive that handler.
- **Related:** D-032, D-043.
- **Resolution:** Unresolved; formerly tracked as D-037, whose identifier is permanently retired.
- **Status:** Open.
