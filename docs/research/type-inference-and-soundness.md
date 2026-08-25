# Type inference, soundness, and type performance

Status: research note; recommendations here are not Accepted architecture decisions.

## Question

How should ERSC preserve strong inference and practical type soundness without making editor
inference or type checking a bottleneck?

Effect is the primary reference because ERSC builds directly on its `Effect`, `Layer`, `Schema`,
and service models. TanStack Router, Zod, Drizzle ORM, and the TypeScript compiler guidance provide
useful comparisons for route state, generic reduction, diagnostics, and compiler performance.

## Executive conclusion

ERSC's overall direction is sound:

- `Application.ersc<Services>()` establishes one authoritative service universe before local
  inference begins.
- Effect's variance lets service-free operations and operations requiring a subset of `Services`
  pass while rejecting requirements outside that universe.
- invariant ERSC membership prevents members from widening between different service universes;
  runtime identity correctly handles two ERSC instances with the same `Services` type.
- immutable `RoutesDefinitionImpl` transitions let TypeScript verify route state changes without
  casts.
- route state now retains only facts consumed by later rules: layout presence and reachable paths.

The main opportunities are simplification and measurement, not a different architecture:

1. Read route state directly from its phantom metadata instead of matching the recursive
   `RoutesDefinition` interface.
2. Remove factory generics whose exact values are immediately erased. Effect's declared variance
   can validate those operations with simpler signatures.
3. Prefer callable interfaces for authored concerns, allowing TypeScript to cache their
   relationships.
4. Keep `RoutesDefinitionImpl`, `const Path`, and `const Prefix`; remove literal-preserving generics
   whose values are not accumulated.
5. Use `NoInfer` only when a secondary argument competes with an already-authoritative inference
   source.

## Follow-up results

The recommendations were evaluated against the current framework with TypeScript 7 extended
diagnostics. Each experiment was compiled independently and unhelpful changes were reverted.

| Change                                                | Instantiations | Result                                                |
| ----------------------------------------------------- | -------------: | ----------------------------------------------------- |
| Starting point                                        |        126,102 | baseline                                              |
| Direct route metadata extraction                      |        124,962 | retained                                              |
| Separate lightweight route consumption constraint     |        131,488 | rejected                                              |
| Simplify Effect generics and callable representations |        123,628 | retained                                              |
| Express identity carrier aliases as interfaces        |        123,628 | rejected because it materialized 186 additional types |

The settled result is 2,474 fewer instantiations than the starting point, a reduction of about 2%.
Framework and kitchen-sink TypeScript compilation both pass. The most important result is not
the percentage: the retained changes also make the authored interface smaller and easier to read.

## What “sound” means here

TypeScript is intentionally not a fully sound language. ERSC should target practical soundness:

- supported, strictly typed calls cannot introduce a requirement outside the declared service
  universe;
- accumulated route types correspond to actual immutable runtime transitions;
- public return types do not claim information that the implementation obtained through an
  unchecked assertion;
- erased JavaScript, `any`, external data, and per-instance ownership are checked at runtime;
- a type optimization is not accepted if it achieves lower cost by collapsing useful results to
  `never`, `any`, `unknown`, or widened strings.

This deliberately combines static and runtime checks. Drizzle's documented `sql<T>` API is a useful
counterexample: the generic is explicitly a user assertion and does not perform runtime mapping.
Types alone cannot make an unvalidated boundary true.

## Effect: the primary model

### Let variance enforce the service boundary

Effect v4 declares:

```ts
interface Effect<out A, out E = never, out R = never>
interface Layer<in ROut, out E = never, out RIn = never>
```

`R` is a union of required service identifiers. Therefore:

- `Effect<A, E, never>` fits an ERSC with any service universe;
- `Effect<A, E, ServiceA>` fits an ERSC declared with `ServiceA | ServiceB`;
- `Effect<A, E, ServiceA | Outside>` does not fit that ERSC.

Before this follow-up, ERSC inferred separate `Output`, `Error`, and
`Requirements extends Services` parameters in several factories, then erased most exact values from
the returned concern. Effect's covariance allows the requirements and renderer-output generics to
be removed while retaining the typed error channel:

```ts
type PageFactory<Services> = {
  readonly make: <Error>(
    operation: () => Effect.Effect<Awaited<ReactNode>, Error, Services>,
  ) => PageComponent<Services>;
};

type ComponentFactory<Services> = {
  readonly make: <Props, Error>(
    operation: (props: Props) => Effect.Effect<Awaited<ReactNode>, Error, Services>,
  ) => EffectComponent<Props, Services>;
};
```

This was validated in a temporary compile-only probe against the current repository:

- service-free and subset-service Page, Layout, Component, and ServerFn operations compiled;
- an outside service was rejected in each operation;
- Component props remained exact;
- ServerFn input and output remained inferred.

The probe compiled with TypeScript 7 and was removed afterward. The same reduction should apply to:

- Page and Layout: retain `Error`, while success is constrained directly to renderable output;
- Component: retain `Props` and `Error`;
- RequestRuntime: retain `Output` and `Error`;
- ServerFn: retain `InputSchema`, `Output`, and `Error`;
- Loading: retain `Output`, because its non-Effect validation consumes that exact type;
- `ERSC.make`: retain `ApplicationError`, because `ApplicationDefinition` exposes it.

The Effect-aware lint rejects `unknown` as an operation error channel because it destroys useful
error information. Consequently, `Error` remains inferred even where the returned concern erases
it. The safe simplification removes separate `Requirements` generics and renderer success generics,
not the typed error channel. This follows Zod 4's broader lesson: fewer generic parameters are
valuable when they remove state safely, not merely because a smaller signature looks nicer.

### The invariant ERSC marker is correct

Effect defines `Types.Invariant<A>` as `(_: A) => A`. ERSC now uses that convention directly:

```ts
readonly [ERSCServicesTypeId]?: Types.Invariant<Services>;
```

It prevents a member authored under `ERSC<A>` from widening into `ERSC<A | B>`. The Effect helper
makes that intent recognizable but is a naming and coherence improvement rather than a soundness
change.

This marker proves service-universe compatibility, not runtime instance ownership. TypeScript does
not manufacture a fresh nominal type for every call to `Application.ersc<SameServices>()`. Two ERSC
values with identical `Services` therefore require the existing runtime object-identity check.

That split is appropriate:

| Guarantee                                                | Owner                           |
| -------------------------------------------------------- | ------------------------------- |
| Operation requirements are within `Services`             | Effect variance and TypeScript  |
| Members do not widen between different service universes | invariant ERSC marker           |
| Members came from this exact ERSC instance               | runtime identity comparison     |
| The final Layer has no unresolved requirements           | `Layer<Services, Error, never>` |

### The Layer constraint is closed, not exact-output

`Layer<Services, ApplicationError>` defaults `RIn` to `never`, so the final application Layer cannot
retain requirements. Because `ROut` is contravariant, a Layer providing `Services | Extra` is
accepted, while one providing only a subset of `Services` is rejected.

The accurate rule is therefore: the Layer is closed and provides at least the declared universe.
Requiring exactly the same provided union would add bidirectional conditional comparisons while
rejecting harmless extra provision. ERSC should keep the current rule unless exact provision gains
real runtime semantics.

### Prefer lightweight constraints and direct metadata

Effect Schema exposes lightweight `Constraint` and `ConstraintDecoder` interfaces for consumers
that only need type views and decoding requirements. ERSC already makes the right choice in
`ServerFn` by accepting `Schema.ConstraintDecoder<unknown, Services>` instead of the full Schema
protocol.

Effect made a similar optimization in its HTTP API types: helpers stopped matching a rich recursive
endpoint interface and instead consumed lightweight constraints or read phantom metadata directly.

Current ERSC extractors match the full `RoutesDefinition`:

```ts
type RoutesPaths<Definition> =
  Definition extends RoutesDefinition<infer _Services, infer _HasLayout, infer Paths>
    ? Paths
    : never;
```

That comparison can involve methods, child route types, runtime fields, and ERSC identity merely to
read `paths`. The direct form is smaller:

```ts
type RoutesPaths<Definition> = Definition extends {
  readonly [RoutesTypeId]: {
    readonly paths: infer Paths extends string;
  };
}
  ? Paths
  : never;
```

Direct metadata extraction reduced instantiations and is retained. A separate lightweight route
consumption constraint was also prototyped, but increased instantiations by about 5.2% compared with
the direct-metadata version. It also introduced another interface for maintainers to understand.
That experiment was reverted: `RoutesDefinition` remains the single route interface.

### Use `NoInfer` only to establish authority

Effect applies `NoInfer` when one value already owns a type and another value must conform without
widening it—for example a service key owns `S`, while its implementation must match `S`.

ERSC already makes `Application.ersc<Services>()` authoritative. There is currently no evidence that
factory operation requirements need `NoInfer`; blocking their inference would obscure precisely the
requirements ERSC needs to validate. Add it only if a future secondary parameter can incorrectly
influence an already-derived type.

## TanStack Router: inference locality and route scale

TanStack Router validates several ERSC choices:

- `createRootRouteWithContext<Context>()(options)` captures an application-wide contract once, then
  allows local values to infer. This is analogous to `Application.ersc<Services>()` followed by
  scoped factories.
- `const` generics preserve literals only when later APIs consume them. ERSC should keep `const Path`
  and `const Prefix` because route state uses those literals.
- validators infer a candidate first and intersect it with an `unknown`/`never` constraint. ERSC's
  named `ValidStaticPath`, `NoPathCollision`, and `NonEmptyRoutes` types follow this established
  pattern.
- route-bound APIs are more precise and cheaper than repeatedly asking global APIs to search a full
  route union. Future ERSC navigation APIs should prefer application- or route-scoped handles.

TanStack's largest performance improvement came from avoiding recursive reconstruction of its entire
route tree at every `Link` use site. Its generator emits direct route maps, and its documentation
recommends narrowing `from` and `to` as early as possible.

ERSC should not copy generated routing now. Accepted architecture gives the static application route
graph to the bundler rather than file discovery or manifest reconstruction. If route-scale fixtures
eventually show a recursive-union bottleneck, a compiler-emitted flat lookup under `.ersc/` could be
considered as an optimization without changing route ownership; that would require its own design
decision.

TanStack also demonstrates patterns ERSC should not copy:

- ambient module augmentation assumes one global router type and is weaker for multiple application
  instances;
- its public precision is often backed by `any`, double casts, and mutated instances;
- carrying many type parameters through the entire tree produces impressive downstream knowledge
  but caused real language-service regressions.

ERSC's immutable class transition is stronger for this project's goals. `RoutesDefinitionImpl`
creates a real new value, TypeScript checks its returned state, `declare [RoutesTypeId]` adds no
runtime field, and the private path set stays encapsulated. Returning to a functional
`makeDefinition` would require a cast or actual runtime phantom properties. The class is justified.

## Zod: reduce generic state and measure it

Zod 4 reports a major reduction in TypeScript instantiations after redesigning its generic model,
including a simple object-extension example falling from more than 25,000 instantiations to roughly 175. Its core `ZodType` model carries fewer, more direct views, and library integrations can target
the lightweight `zod/v4/core` protocol instead of a richer user-facing surface.

Lessons for ERSC:

- remove generic channels that do not survive in a returned value or feed a validation rule;
- consume the smallest structural interface that supplies the needed views;
- do not infer the same state repeatedly from a rich recursive interface;
- maintain focused compiler benchmarks, because visual signature complexity is not a reliable
  performance measure.

Zod's internals also contain assertions and permissive implementation types. ERSC can learn from the
public generic reduction without adopting those escape hatches.

## Drizzle ORM: type state should model a real state machine

Drizzle's query builders retain state because later SQL operations consume it. For example, strict
builders remove methods after one use to model SQL grammar, while `$dynamic()` explicitly switches
to a different compositional workflow.

Lessons for ERSC:

- type state is justified only when a later operation changes behavior or validity based on it;
- distinct strict and dynamic modes should exist only for genuinely distinct workflows;
- a named diagnostic marker such as Drizzle's `DrizzleTypeError` can improve invalid-state error
  messages, but it should be prototyped against actual editor diagnostics before replacing compact
  `never` validators;
- Drizzle's `Assume` helpers and internal assertions are not patterns to copy into ERSC.

This answers the Loading-state question directly: Loading remains a strongly typed runtime field,
but no later type-level rule depends on its presence. Carrying `HasLoading` through every `.page()`
and `.mount()` would add type work without adding a guarantee. If a future rule consumes Loading
presence, add that state at that time.

## TypeScript compiler guidance

The compiler's own performance guidance supports the same design:

- prefer named interfaces over repeatedly expanded intersections where practical, because interface
  relationships can be cached;
- name complex conditional results so the checker can reuse them;
- prefer a base constraint over a large union when a consumer needs only common structure;
- annotate exported return types when inference would repeatedly materialize a large anonymous type;
- use `NoInfer` to control competing inference sources, not as a general performance hint.

Callable interfaces were compared with branded callable intersections for Page, Layout, Loading,
Component, and ServerFn. Interfaces reduced both materialized types and instantiations, so the
callable concerns now use interfaces. The identity carrier aliases did not show the same benefit and
remain aliases.

## Assessment of the current ERSC types

| Area                                 | Assessment                                               | Next action                                               |
| ------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| `Application.ersc<Services>()`       | Strong authoritative inference boundary                  | Keep                                                      |
| invariant service phantom            | Sound for exact service universes                        | Expressed as `Types.Invariant`; keep                      |
| runtime ERSC identity                | Necessary for same-`Services` instances                  | Keep                                                      |
| concern factory generics             | Retain public/inferred values and typed errors           | Renderer output and separate requirement generics removed |
| `Schema.ConstraintDecoder`           | Correct lightweight constraint                           | Keep                                                      |
| route path validators                | Compact inference-first validation                       | Keep; improve diagnostics only after an editor prototype  |
| route extractors                     | Match a richer recursive interface than needed           | Read phantom metadata directly                            |
| route consumption                    | A separate lightweight constraint increased checker work | Keep `RoutesDefinition` as the single route interface     |
| `RoutesDefinitionImpl`               | Cast-free, immutable, compiler-checked transition        | Keep                                                      |
| `HasLayout` state                    | Consumed by root validation                              | Keep                                                      |
| `Paths` state                        | Consumed by collisions, mounting, and root validation    | Keep                                                      |
| removed Loading state                | No type-level consumer                                   | Keep removed                                              |
| `const Path` / `const Prefix`        | Literal is accumulated                                   | Keep                                                      |
| `const Options` / `const Definition` | Deep literal preservation is not consumed                | Removed                                                   |
| compile-time tests in Vitest files   | Useful and now compiled by the normal check              | Separate only if the contract matrix materially grows     |
| whole-project diagnostics            | Useful trend, poor isolation                             | Add Effect-style marginal type-performance fixtures       |

## Verification strategy

### Dedicated type-contract suite

Separate compile-time contracts from runtime Vitest behavior. Cover both positive exact inference and
isolated negative calls:

- service-free, one-service, subset, union, and outside-universe operations;
- invariant service-universe membership;
- runtime-only rejection for a different ERSC instance with identical `Services`;
- exact Component props and ServerFn input/output;
- Layer missing services, unresolved requirements, extra provision, and error inference;
- literal paths through long page chains and nested mounts;
- duplicate paths, empty mounts, missing root Layout, and empty root rejection;
- synchronous Loading acceptance and Promise, Effect, and union-hidden Effect rejection;
- conservative behavior for widened or aliased paths;
- `any`, `unknown`, and `never` boundary cases.

An `@ts-expect-error` only proves that some error occurred on the line. Pair each negative fixture
with nearby positive inference assertions, and keep invalid expressions isolated so an unrelated
error cannot satisfy the directive.

### Isolated type-performance suite

Model the harness on Effect's `typeperf` runner:

- compile a tiny baseline and each fixture as an isolated TypeScript program;
- import through the public `effective-rsc` entry;
- subtract the shared baseline;
- gate marginal `Instantiations` and `Types`, while recording `Symbols` and check time;
- force the intended type views so a collapse to `never` cannot appear as an optimization;
- compare revisions with the same TypeScript installation.

Initial fixtures:

1. Page, Layout, Component, and ServerFn construction.
2. Flat route chains at 10, 100, and 500 pages.
3. Nested mounts with path-union expansion.
4. Duplicate-path validation.
5. Root `ERSC.make` validation.
6. Direct route metadata extraction versus full-interface extraction.
7. Regression coverage for the retained single route interface.

Cold compiler diagnostics do not fully represent IDE latency. For representative large fixtures,
also inspect a TypeScript trace around `.page()`, `.mount()`, Component construction, and
`ERSC.make`, and manually verify hover/completion quality.

## Recommended follow-up

The human-facing interface changes above are complete. Remaining verification work should follow the
design rather than drive it:

1. Ensure the normal repository check compiles both the framework and kitchen-sink TypeScript.
2. Keep focused positive and negative inference assertions around the retained contracts.
3. Add an isolated type-performance harness only when route scaling or another type-heavy feature
   makes a permanent regression gate valuable.
4. Consider named diagnostic marker types only after comparing real editor errors.

## Primary sources

### Effect

- Local [Effect variance](../../repos/effect/packages/effect/src/Effect.ts)
- Local [Layer variance](../../repos/effect/packages/effect/src/Layer.ts)
- Local [Schema constraints](../../repos/effect/packages/effect/src/Schema.ts)
- Local [type utilities](../../repos/effect/packages/effect/src/Types.ts)
- Local [type tests](../../repos/effect/packages/effect/typetest/Effect.tst.ts)
- Local [type-performance methodology](../../repos/effect/packages/effect/typeperf/README.md)
- Local [HTTP endpoint constraints](../../repos/effect/packages/effect/src/unstable/httpapi/HttpApiEndpoint.ts)

### TanStack Router

- [Type-safety guide](https://tanstack.com/router/latest/docs/guide/type-safety)
- [TypeScript performance write-up](https://tanstack.com/blog/tanstack-router-typescript-performance)
- [Route source](https://github.com/TanStack/router/blob/main/packages/router-core/src/route.ts)
- [Type primitives](https://github.com/TanStack/router/blob/main/packages/router-core/src/typePrimitives.ts)
- [React route factories](https://github.com/TanStack/router/blob/main/packages/react-router/src/route.tsx)
- [Link type tests](https://github.com/TanStack/router/blob/main/packages/react-router/tests/link.test-d.tsx)

### Zod

- [Zod 4 release and compiler benchmarks](https://zod.dev/v4)
- [Zod 4 core schemas](https://github.com/colinhacks/zod/blob/main/packages/zod/src/v4/core/schemas.ts)
- [Guidance for library authors](https://github.com/colinhacks/zod/blob/main/packages/docs/content/library-authors.mdx)

### Drizzle ORM

- [Dynamic query building](https://orm.drizzle.team/docs/dynamic-query-building)
- [Typed SQL and its runtime boundary](https://orm.drizzle.team/docs/sql)
- [Type utilities](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/utils.ts)
- [PostgreSQL select type state](https://github.com/drizzle-team/drizzle-orm/blob/main/drizzle-orm/src/pg-core/query-builders/select.types.ts)

### TypeScript

- [Compiler performance guidance](https://github.com/microsoft/TypeScript/wiki/Performance)
- [`NoInfer` in TypeScript 5.4](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html#the-noinfer-utility-type)
- [Type inference handbook](https://www.typescriptlang.org/docs/handbook/type-inference.html)
