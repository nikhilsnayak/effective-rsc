# Open questions

Do not settle these implicitly. When implementation supplies decisive evidence, remove the question
and add or revise its owning decision.

## OQ-001 — SSR failures

How should failures before HTML headers map to HTTP responses, and how should failures after streaming
begins be reported? Pre-header failures are typed `HtmlRenderError`s; post-header diagnostics remain
undefined.

## OQ-002 — Suspensing Loading renderers

How should development diagnose an `ERSC.Loading.make` renderer that calls `use` or otherwise throws a
thenable internally? Its declared renderer rejects Promise and Effect outputs, but TypeScript cannot
detect suspension hidden inside synchronous code.

## OQ-003 — Route parameter failures and search params

How should a matched parameterized Page's path-parameter Schema rejection map to NotFound or another
expected failure, and how should Pages declare and decode typed search parameters?
