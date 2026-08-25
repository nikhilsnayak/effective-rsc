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
4. How should development detect an `ERSC.Loading.make` renderer that suspends internally?

## Current evidence

- Workspace consumers currently import package TypeScript directly. This avoids a second compiler
  while runtime behavior is still changing. Generated application output is separately fixed under
  `.ersc/` by D-019.
- Pre-header HTML failures remain typed `HtmlRenderError`s in Effect. Response mapping and
  post-header diagnostics remain unresolved.
- The Flight model currently carries the complete document route tree and opaque React form state.
  The provisional `serverFnResult` proves an imperative value can accompany a refresh, but not its
  final success/failure shape.
- `ERSC.Loading.make` rejects Promise and Effect outputs, so its declared renderer is synchronous
  and service-free. TypeScript cannot detect a renderer that calls `use` or otherwise throws a
  thenable internally; the development diagnostic for that case remains open.
- `ERSC.ServerFn.make` is now application-scoped. Its requirements are checked against the declared
  service universe, and its branded lazy Effect is executed only by the matching application
  request runtime. D-036 records the framework-intrinsic choice that resolved the former Promise
  versus Effect question.
- A Flight root can commit Loading while nested rows continue streaming. Once the Navigation API
  handler settles, a later navigation does not abort that earlier event signal. The reference
  routers do not supply one shared policy for retiring such post-commit streams, so D-037 defers the
  question while ERSC remains the active milestone.

## Later milestones

1. Dynamic paths and Effect Schema decoding for path/search parameters.
2. Typed `Link` and imperative navigation.
3. Mapping expected Effect failures, `ErrorBoundary`, `NotFound`, redirects, and defects.
4. Metadata, preloading, and route-owned assets beyond the global stylesheet.
5. Development orchestration, RSC-aware HMR, and route diagnostics.
6. One router design covering Back/Forward reuse, prefetch ownership, post-commit Flight response
   ownership, cache lifetime, eviction, invalidation, Activity, parallel outlets, partial responses,
   and missing-subtree representation. These concerns must be designed together, and parallel
   outlets must extend nested Layouts.
7. Public Fragment-ref and View Transition types.
