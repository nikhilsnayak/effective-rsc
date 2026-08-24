# Open questions

Implementation must not silently settle these questions. Record the result in the owning document
and decision register when the relevant vertical slice provides evidence.

## First vertical slice

1. Should the published `effective-rsc` package emit JavaScript and declarations into its package
   `dist`, or consume
   TypeScript source directly inside the monorepo until the runtime is proven?
2. Which additional fields, such as an imperative Server Function return channel, belong in the
   internal Flight payload used by navigation and refresh?
3. How should an SSR failure be represented before headers are committed, and what diagnostic is
   emitted if failure happens after streaming begins?
4. Which development diagnostics prove that a `Loading.make` renderer attempted to suspend?
5. Should `ServerFn.make` become a genuinely async function through a private request-local Effect
   runner, or remain a framework-only Effect-returning intrinsic that cannot be invoked directly on
   the server?
6. How should Effect services required only by `ServerFn.make` handlers join the service union
   enforced by `Application.make`?

Current evidence: the HTTP negotiation checkpoint keeps pre-header HTML rendering failures as a
typed `HtmlRenderError` in Effect. Mapping that failure to a framework response, and diagnosing
failures after streaming begins, remain open.

The single `effective-rsc` package exports TypeScript source directly to workspace consumers so the
runtime can be tested without introducing a second compilation pipeline. Its application, RSC,
browser, server, and build graphs are private directories rather than separately published packages.
Whether a distributable artifact should emit JavaScript and declarations remains open.

This package-publication question is separate from application output. D-019 fixes all generated
application artifacts and bundles under `.ersc/`.

The initial hydration checkpoint embeds the same native Flight bytes consumed by SSR. D-017 adds a
small serialized model containing the complete document route tree and React's opaque form state because
Fizz and `hydrateRoot` both need that state after a progressively enhanced form submission. This is
a value carried by React Flight, not a replacement transport. Additional navigation or Server
Function metadata remains open.

The Server Function checkpoint is intentionally Working. A named `ServerFn.make` reference imported
directly by a Client Component proves hydrated invocation and whole-tree refresh without replacing
React's protocol. The progressive form path executes the mutation but its full-document response
does not yet complete. Server-side binding of that factory-created named export is waiting on
Rspack's server-layer metadata fix, while inline lexical capture is waiting on matching bound-argument
helper exports between the pinned Rspack and RSDR releases. Local aliases and export-shape workarounds
are not evidence and are not retained. Independently of those upstream blockers, the
Promise-versus-Effect contract and action-only service inference in questions 5 and 6 must be
resolved before `ServerFn.make` is considered complete.

The static nested-route checkpoint composes immutable `Routes` values through `page` and `mount`,
compiles every final literal path directly into Effect's HTTP router, and renders its ordered Layout,
Loading, and Page ancestry as one unary Flight tree. Service requirements are inferred through every
mount. This establishes modular route ownership, nested persistent Layouts, and multiple HTML and
Flight destinations without choosing the still-open dynamic-parameter schema.

Named parallel outlets are deferred. They must eventually extend rather than replace the accepted
nested Layout model, and should be introduced together with evidence for their ownership and partial
request semantics. The current whole-tree checkpoint deliberately retains no unused patch model and
has no cache: every intercepted navigation fetches fresh Flight. Its React boundary is fixed as one
authoritative root-model update inside the user navigation transition, canceled through the owning
`NavigateEvent.signal` and paired with an exact layout-commit signal. Back/Forward reuse, prefetch
ownership, eviction and invalidation policy, React Activity retention, parallel outlets, partial
request format, and the exact missing-subtree representation remain one unresolved router design
rather than independent features that can be chosen safely in isolation.

## Later milestones

1. Dynamic path matching and the `Application.make` API for Effect Schema decoding of path and
   search parameters.
2. Typed `Link` and imperative navigation syntax.
3. Error-channel mapping between expected Effect failures, `ErrorBoundary`, `NotFound`, redirects,
   and unexpected defects.
4. Metadata, asset preloading, and route-specific resource ownership beyond the global application
   stylesheet.
5. Development-server orchestration, RSC-aware HMR, and route-declaration diagnostics.
6. Prefetch policy, cache lifetime, invalidation, and React Activity integration.
7. The exact scope of Fragment refs and View Transition types exposed by the client router.
