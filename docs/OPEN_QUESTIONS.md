# Open questions

Implementation must not silently settle these questions. Record the result in the owning document
and decision register when the relevant vertical slice provides evidence.

## First vertical slice

1. Which Rspack APIs belong behind `@effective-rsc/rspack`, and which must remain visible to framework
   authors during early development?
2. Should the first package build publish JavaScript and declarations into `dist`, or consume
   TypeScript source directly inside the monorepo until the runtime is proven?
3. What is the smallest internal payload shape shared by initial hydration, navigation, and Server
   Function refresh without obscuring React's native values?
4. How should an SSR failure be represented before headers are committed, and what diagnostic is
   emitted if failure happens after streaming begins?
5. Which development diagnostics prove that a `loading.tsx` fallback attempted to suspend?

## Later milestones

1. The route-module API for Effect Schema decoding of path and search parameters.
2. Typed `Link` and imperative navigation syntax.
3. Error-channel mapping between expected Effect failures, `error.tsx`, not-found, redirects, and
   unexpected defects.
4. Metadata, stylesheets, asset preloading, and route-specific resource ownership.
5. Development-server orchestration, RSC-aware HMR, and generated-route diagnostics.
6. Prefetch policy, cache lifetime, invalidation, and React Activity integration.
7. The exact scope of Fragment refs and View Transition types exposed by the client router.
