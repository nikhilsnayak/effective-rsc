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
small serialized model containing the complete document root and React's opaque form state because
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

The static-route checkpoint registers every declared literal path directly with Effect's HTTP
router and renders its Page plus exact named Slot record through the inherited root Layout. Service
requirements are inferred across the Layout, every Page, and every non-empty Slot. This establishes
multiple HTML and Flight destinations without choosing the still-open dynamic-parameter schema.

The parallel-rendering checkpoint resolves the nested representation as an n-ary tree with named
slots. The primary Page is the implicit `children` branch; `Slot.make` defines additional named
parallel branches declared by `Layout.make`, and `null` records an intentionally empty branch.
Layout, Page, and Slot concerns are independent values in one native Flight model, and a
framework-owned `RouteOutlet` Client Component recursively stitches each child node into its
declared outlet. The whole matched tree still travels in one Flight response under D-005; partial
segment requests remain a later decision.

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
