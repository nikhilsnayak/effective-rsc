# Vision

## Purpose — Accepted

effective-rsc is a research framework for discovering what a coherent, bleeding-edge React Server
Components framework looks like when React owns the UI protocol and Effect owns the application
runtime.

It is not intended as a safe production default. It may require current React Canary releases,
Effect v4 release candidates, TypeScript 7, Rspack RSC support, and recently standardized browser
APIs without compatibility fallbacks.

## Principles — Accepted

1. Prefer one opinionated path over configuration matrices.
2. Preserve React's RSC and Server Function protocols rather than replacing them.
3. Model requests, resources, cancellation, failures, services, and observability with Effect.
4. Make filesystem conventions compile into explicit typed artifacts.
5. Stream useful HTML on the initial request and Flight on later navigations.
6. Use the Navigation API as the browser navigation primitive.
7. Keep the framework small enough that its essential pipeline remains understandable.
8. Adopt new React and browser capabilities when they simplify the model, without legacy fallbacks.

## Non-goals — Accepted for v0

- Production stability or backward compatibility.
- Multiple bundlers, server runtimes, deployment adapters, or routing authoring models.
- SPA-only rendering or per-route SSR switches.
- Static generation, ISR, or partial prerendering.
- Support for browsers without the Navigation API.
- Replacing React Server Functions with a custom RPC transport.
- A partial-route or slot-specific Flight protocol before whole-tree navigation is measured.
