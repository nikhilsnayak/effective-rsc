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

## Later milestones

1. The `Application.make` route API for Effect Schema decoding of path and search parameters.
2. Typed `Link` and imperative navigation syntax.
3. Error-channel mapping between expected Effect failures, `ErrorBoundary`, `NotFound`, redirects,
   and unexpected defects.
4. Metadata, asset preloading, and route-specific resource ownership beyond the global application
   stylesheet.
5. Development-server orchestration, RSC-aware HMR, and route-declaration diagnostics.
6. Prefetch policy, cache lifetime, invalidation, and React Activity integration.
7. The exact scope of Fragment refs and View Transition types exposed by the client router.
8. Whether matched nested route concerns are serialized as a stack with recursive placeholders or
   as an n-ary structure so layouts and pages begin rendering in parallel without data waterfalls.
