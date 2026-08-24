# Vision

## Purpose — Accepted

effective-rsc researches a coherent, bleeding-edge RSC framework in which React owns the UI
protocol and Effect owns the application runtime. It is not a production-safe default and may rely
on React Canary, Effect v4 RC, TypeScript 7, Rspack RSC support, and new browser APIs without legacy
fallbacks.

## Principles — Accepted

1. Prefer one opinionated path to configuration matrices.
2. Preserve React's RSC and Server Function protocols.
3. Model failures, resources, cancellation, services, and observability with Effect.
4. Keep route topology and concern ownership explicit and statically typed.
5. Stream useful HTML initially and Flight during navigation.
6. Use the Navigation API as the browser routing primitive.
7. Keep the essential pipeline understandable.
8. Adopt new platform capabilities when they simplify the model.

## Non-goals — Accepted for v0

- Production stability or backward compatibility.
- Alternative bundlers, runtimes, adapters, route models, or legacy-browser routing.
- SPA-only rendering, per-route SSR, SSG, ISR, or partial prerendering.
- Replacing Server Functions with custom RPC.
- Partial-route or slot-specific Flight before whole-tree navigation is measured.
