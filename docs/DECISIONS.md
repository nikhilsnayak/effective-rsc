# Decision register

**Current** decisions describe implemented behavior. **Planned** decisions are accepted but not yet
implemented. **Deferred** decisions are intentionally outside the current milestone.

## Current

| ID    | Decision                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-001 | Build a research framework without production-stability or backward-compatibility guarantees.                                                             |
| D-002 | Load one explicit application from `src/application.tsx`; filenames have no other routing semantics.                                                      |
| D-003 | Compose immutable `ERSC.Routes` from Page, Layout, and Loading values owned by one ERSC identity.                                                         |
| D-004 | Stream full-document SSR and embed the same render's Flight for hydration.                                                                                |
| D-005 | Use one whole-tree Flight response per navigation; do not introduce a partial-patch transport.                                                            |
| D-006 | Build routing directly on the Navigation API without a History API fallback.                                                                              |
| D-007 | Compile applications directly with Rspack's native RSC plugins and native RSDR without an Rsbuild application pipeline.                                   |
| D-008 | Use Effect v4 RC for effectful orchestration and plain TypeScript for pure or incidental code.                                                            |
| D-009 | Add Effect and Schema typing to `ERSC.ServerFn.make` while preserving React's native reference and binding protocol.                                      |
| D-010 | Use `unstable/HttpApi` only for non-UI HTTP routes.                                                                                                       |
| D-012 | Use TypeScript 7 with strict checking.                                                                                                                    |
| D-013 | Use Bun as the application runtime, Vitest with `@effect/vitest`, and Bun-hosted integration tests.                                                       |
| D-015 | Publish one `effective-rsc` package with explicit application, RSC, client, server, and build graphs.                                                     |
| D-016 | Use one application-scoped ERSC module with Page, Layout, Loading, Component, ServerFn, and Routes factories; Loading stays synchronous and service-free. |
| D-017 | Carry the complete document route tree and React form state in a small native Flight model used by Fizz and hydration.                                    |
| D-018 | Expose one package-root application API; keep runtime and build subpaths private.                                                                         |
| D-019 | Put generated application output under `.ersc/`.                                                                                                          |
| D-020 | Model renderers as Effect services and keep cross-graph contracts separate from runtime-owned live Layers.                                                |
| D-021 | Compose requests in `Application.httpLayer`; let `Application.layer` add Bun listening.                                                                   |
| D-022 | Declare the service universe with `Application.ersc<Services>()` and close it with `ERSC.make({ servicesLayer })`.                                        |
| D-023 | Use port `18193` as the default application port.                                                                                                         |
| D-024 | Let the framework `'use server-entry'` module own application compilation and asset metadata.                                                             |
| D-025 | Compile Tailwind CSS v4 through `@tailwindcss/webpack` from the application root while preserving Rspack's native CSS assets.                             |
| D-026 | Treat React, React DOM, Effect, Effect's browser and Bun platforms, and RSDR as exact shared peers installed by applications.                             |
| D-028 | Compile exact paths directly into Effect HTTP, reserve `/_ersc/assets`, preserve Layout/Loading ancestry, and keep native `404` responses.                |
| D-029 | Make Routes immutable and mountable; nested Layout/Loading are optional, while a non-empty root requires a Layout.                                        |
| D-030 | Render one unary Layout → optional Loading → child chain ending in Page.                                                                                  |
| D-031 | Give each route node an opaque local React identity and defer slot and patch fields.                                                                      |
| D-032 | Let `NavigateEvent.signal` own navigation through the exact Layout commit; await the Flight root and publish once.                                        |
| D-033 | Retain the revealed common Layout prefix across navigation; replace the complete tree after a Server Function.                                            |
| D-034 | Enable Strict Mode and the React Compiler in the browser graph only; RSC and SSR omit the compiler.                                                       |
| D-035 | Bind the ERSC request runner with AsyncLocalStorage while entering native Flight rendering.                                                               |
| D-036 | Treat `ERSC.ServerFn.make` as a framework intrinsic with a Promise client contract and a branded lazy Effect on the server.                               |
| D-038 | Define ERSC as an application-scoped authoring and execution module closed by `ERSC.make`.                                                                |
| D-039 | Give Component, Layout, Loading, and Page uniform options-object authoring interfaces.                                                                    |
| D-040 | Return request/protocol failures as non-2xx; return completed Server Function outcomes with the 200 Flight refresh.                                       |
| D-044 | Build the package as bundleless ESM with Rslib and publish compiled JavaScript, declarations, and source maps under `dist/`.                              |
| D-045 | License the repository and published `effective-rsc` package under the MIT License.                                                                       |

## Planned

| ID    | Decision                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| D-041 | Let one Bun + Effect HTTP server own port `18193` in development and replace only the compiled application handler after successful builds. |
| D-042 | Use Rspack's HMR runtime and React Fast Refresh over `/_ersc/hmr`; apply client updates before refetching Flight after RSC changes.         |
| D-043 | Replace the whole route tree on HMR refresh, interrupt superseded refreshes, and retain successful responses through stream EOF.            |

## Deferred

| ID    | Decision                                                                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| D-011 | Consider Effect RPC only for work that does not imply an RSC refresh.                                                               |
| D-014 | Defer SSG, ISR, partial prerendering, SPA mode, alternate bundlers, and runtime adapters.                                           |
| D-027 | Revisit StyleX only after its Rspack CSS-emission hook ships and MultiCompiler RSC CSS ownership and watch invalidation are proven. |
| D-037 | Decide whether a newer committed route should retire an earlier committed-but-still-streaming Flight response.                      |
