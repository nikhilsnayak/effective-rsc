# Decision register

| ID    | Status   | Decision                                                                                                                                    |
| ----- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | Accepted | Build a research framework without production-stability or backward-compatibility requirements.                                             |
| D-002 | Accepted | Use filesystem routing as the only public route authoring model and compile it into a typed route tree.                                     |
| D-003 | Accepted | Support `layout.tsx`, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, and non-UI `route.ts` conventions.                           |
| D-004 | Accepted | Stream SSR for every initial document request and embed that render's Flight payload for hydration.                                         |
| D-005 | Accepted | Use whole-tree Flight responses for client navigation in v0.                                                                                |
| D-006 | Accepted | Build the client router directly on the Navigation API without a History API fallback.                                                      |
| D-007 | Accepted | Use React Canary, Rspack's native RSC support, and `react-server-dom-rspack`, pinned to exact compatible releases.                          |
| D-008 | Accepted | Use Effect v4 RC for HTTP, request scopes, services, typed failures, interruption, and observability.                                       |
| D-009 | Accepted | Name the Effect and Schema wrapper for native React Server Functions `ServerFn.make`.                                                       |
| D-010 | Accepted | Use `unstable/HttpApi` for non-UI HTTP routes, not for pages or Flight.                                                                     |
| D-011 | Deferred | Effect RPC support; it may later serve long-lived or streaming operations but will not replace Server Functions.                            |
| D-012 | Accepted | Use TypeScript 7 and require strict type checking.                                                                                          |
| D-013 | Accepted | Use Bun as the primary and sole supported v0 runtime for tooling, development, tests, HTTP serving, and production execution.               |
| D-014 | Deferred | SSG, ISR, partial prerendering, SPA mode, alternate bundlers, runtime adapters, and programmatic routing.                                   |
| D-015 | Working  | Begin with `core`, `rspack`, `server`, and `client` package boundaries, changing them only when the first vertical slice provides evidence. |
