# Open questions

Do not settle these implicitly. When implementation provides evidence, update the owning document
and add or revise a decision.

## Current checkpoint

1. Should the published package emit JavaScript and declarations in `dist`, or continue exposing
   TypeScript source while the runtime stabilizes?
2. What additional metadata belongs in the internal Flight model, including the final imperative
   Server Function result channel?
3. How should SSR failures map to responses before headers, and what diagnostic should report
   failures after streaming begins?
4. How should development detect a `Loading.make` renderer that suspends?
5. Should `ServerFn.make` use a private request-local runner to become genuinely async, or remain a
   framework-only Effect intrinsic that cannot be called directly on the server?
6. How should services used only by ServerFn handlers join `Application.make`'s inferred service
   union?

## Current evidence

- Workspace consumers currently import package TypeScript directly. This avoids a second compiler
  while runtime behavior is still changing. Generated application output is separately fixed under
  `.ersc/` by D-019.
- Pre-header HTML failures remain typed `HtmlRenderError`s in Effect. Response mapping and
  post-header diagnostics remain unresolved.
- The Flight model currently carries the complete document route tree and opaque React form state.
  The provisional `serverFnResult` proves an imperative value can accompany a refresh, but not its
  final success/failure shape.
- The working and blocked Server Function shapes are recorded in
  [ARCHITECTURE.md](ARCHITECTURE.md); their evidence does not answer questions 5 or 6.

## Later milestones

1. Dynamic paths and Effect Schema decoding for path/search parameters.
2. Typed `Link` and imperative navigation.
3. Mapping expected Effect failures, `ErrorBoundary`, `NotFound`, redirects, and defects.
4. Metadata, preloading, and route-owned assets beyond the global stylesheet.
5. Development orchestration, RSC-aware HMR, and route diagnostics.
6. One router design covering Back/Forward reuse, prefetch ownership, cache lifetime, eviction,
   invalidation, Activity, parallel outlets, partial responses, and missing-subtree representation.
   These concerns must be designed together, and parallel outlets must extend nested Layouts.
7. Public Fragment-ref and View Transition types.
