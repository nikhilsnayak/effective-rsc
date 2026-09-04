# Client router

Status: **Planned** by [D-066](../DECISIONS.md). This document specifies the target client-navigation
architecture. Until D-066 is delivered and promoted to Current, [Request flows](request-flows.md)
and [Lifetimes, failures, and protocols](lifetimes-and-protocols.md) describe the implementation.

## Purpose

The client router is one deep module behind one interface:

```ts
installClientRouter: Effect.Effect<void, never, ClientDependencies>;
```

It installs the Navigation API subscription, decides which navigations ERSC owns, loads routed
Flight, publishes React renders, coordinates native commit with Layout commit, owns postcommit
stream lifetimes, and releases obsolete work. Callers do not receive attempts, phase handles,
coordinator state, or lifecycle operations.

`NavigationApi` remains the browser adapter and `BrowserRenderer` remains the React publication
adapter. Neither owns the end-to-end routing policy. Refresh, Server Function, and HMR selection
remain separate modules; they do not enter a global router scheduler.

The implementation moves installed routing behavior into `client-router.ts` and absorbs
`navigation-coordinator.ts` rather than layering another coordinator over them. Keep the router in
one private module; split an internal module only when it has an independently useful interface.

## Native and Flight lifetimes

```mermaid
sequenceDiagram
  participant Navigation as Navigation API
  participant Router as Client router
  participant Server
  participant React

  Navigation->>Router: routed navigate event
  Router->>Server: GET Flight in owned Effect scope
  Server-->>Router: root route payload; stream continues
  Router->>React: publish in a Transition
  React-->>Router: destination Layout commits
  Router-->>Navigation: settle precommit handler
  Navigation->>Navigation: commit entry, focus, and default scroll
  Navigation-->>React: native transition finishes
  Server-->>Router: remaining Flight chunks / EOF
  Note over Router,React: Router retains the stream until EOF or render retirement
```

For a cancelable navigation, the router intercepts with `precommitHandler`. Loading begins in an
async React Action. Because publication happens after an `await`, the renderer update receives its
own nested `startTransition`. The Action ends after scheduling publication; the handler waits for
the renderer's `committed` promise outside the Action. The root Layout effect resolves that promise,
allowing URL/history commit, browser focus and scroll, and React's View Transition to proceed
without waiting for Flight EOF.

The browser currently owns the default forward-navigation scroll reset. This is not a complete
scroll-restoration design: a history entry can observe the intermediate Suspense fallback even
though its route continues streaming after native navigation finishes. Router-owned history scroll
restoration is therefore deferred in [OQ-009](../OPEN_QUESTIONS.md); D-066 does not treat the
browser's remembered position as a stable streamed-route position.

The `NavigateEvent.signal` owns interruption only until the destination render commits. At that
point ownership transfers exactly once to an ERSC Effect scope. Browser Stop therefore cannot
cancel chunks still streaming after the first commit. This is an intentional trade for truthful
native completion.

Some traversals are non-cancelable and cannot use `precommitHandler`; their entry is already
committed when routing starts. They otherwise use the same loading, rendering, and stream ownership
rules.

## React View Transitions

The application owns every React `<ViewTransition>` boundary and all animation policy. ERSC does
not wrap the route tree and does not call `document.startViewTransition()`. It supplies context by
calling React's `addTransitionType()` inside the same `startTransition()` callback that publishes
the corresponding render.

This placement is significant. Routed Flight and current-route refreshes load asynchronously, so
adding types only to the outer async Action would not associate them with the later UI update. The
nested publication Transition adds the types immediately before calling `BrowserRenderer`.

Transition types are additive:

| Publication                                            | Types                                                   |
| ------------------------------------------------------ | ------------------------------------------------------- |
| Every routed navigation                                | `navigation`, then `navigation-${event.navigationType}` |
| Push navigation                                        | `navigation-forward`                                    |
| Backward traversal                                     | `navigation-backward`                                   |
| Forward traversal                                      | `navigation-forward`                                    |
| Navigation with `event.hasUAVisualTransition`          | `navigation-ua-visual-transition`                       |
| Server Function response tree or current-route refresh | `server-function`                                       |
| HMR current-route refresh                              | `hmr-refresh`                                           |

A replace navigation has no direction type. A traversal also has no direction type when its source
index is unavailable or equal to its destination index. Applications may use the UA visual and HMR
types to suppress author animation, but ERSC does not impose that styling policy.

These types describe the first publication only. Nested Suspense content can reveal in later React
Transitions after native navigation has finished; React does not carry the router's types into those
later reveals. Applications own any Suspense-specific `<ViewTransition>` boundaries and styling.

## State model

The router stores exactly one visible generation and at most one preparing candidate. A third
navigation replaces the candidate; it does not create an unbounded generation set.

The implementation uses nested tagged unions. This schematic omits incidental data but not
lifecycle alternatives:

```ts
type RouterState =
  | { readonly _tag: 'Ready'; readonly visible: Visible }
  | {
      readonly _tag: 'Navigating';
      readonly visible: Visible;
      readonly candidate: Candidate;
    };

type Visible =
  | { readonly _tag: 'Settled' }
  | {
      readonly _tag: 'Navigation';
      readonly generation: Generation;
      readonly entry: EntryState;
      readonly flight: FlightState;
      readonly render: RendererNavigation;
    };

type Candidate =
  | {
      readonly _tag: 'Loading';
      readonly generation: Generation;
      readonly entry: EntryState;
      readonly lifetime: GenerationLifetime;
    }
  | {
      readonly _tag: 'Publishing';
      readonly generation: Generation;
      readonly entry: EntryState;
      readonly flight: FlightState;
      readonly lifetime: GenerationLifetime;
    }
  | {
      readonly _tag: 'Rendering';
      readonly generation: Generation;
      readonly entry: EntryState;
      readonly flight: FlightState;
      readonly lifetime: GenerationLifetime;
      readonly render: RendererNavigation;
    };

type EntryState =
  | { readonly _tag: 'PendingCommit'; readonly destination: NavigationDestination }
  | { readonly _tag: 'Committed'; readonly entry: NavigationHistoryEntry };

type FlightState =
  | { readonly _tag: 'Streaming'; readonly resource: RouteResource }
  | { readonly _tag: 'Completed'; readonly routeTree: RouteTreeModel };
```

The concrete types must continue this discipline: no optional lifecycle fields and no booleans
whose combinations encode phases. A completed stream with a pending entry is valid because EOF may
precede native history commit. A visible streaming generation is valid because nested RSC chunks
may remain unresolved after the first Layout commit.

Each async result carries its opaque generation identity. Results for a generation the router no
longer owns are expected stale no-ops. An event impossible for the currently owned generation is a
wiring error and throws a plain `TypeError`.

## Events and commands

State changes are synchronous and atomic through a pure reducer. Dispatch reads the current
`MutableRef`, computes the reducer result, installs the next state before running commands, and does
not yield between those steps. Loading, Flight consumption, and React rendering remain concurrent;
the router does not introduce a queue, mutex, or synchronized execution lane.

The closed lifecycle event family is:

- `BeginCancelable`
- `BeginCommittedTraversal`
- `RouteLoaded`
- `DocumentLoaded`
- `RenderScheduled`
- `RenderCommitted`
- `RenderRetired`
- `HistoryCommitted`
- `FlightCompleted`
- `FlightFailed`
- `NavigationAborted`

`RenderRetired` is distinct from `NavigationAborted`: the former is React's proof that a visible
tree is no longer mounted, while the latter is the native precommit signal. This distinction lets a
refresh, HMR update, Server Function tree, or later navigation safely retire a visible navigation.

The reducer returns the next state and a flat list of tagged commands. State is installed before
commands run. Commands emitted together are independent; when effects require ordering, one
concrete command owns that sequence. In particular, superseding a scheduled candidate performs
`discard -> release` as one command. There are no generic sequence/parallel command combinators,
event bus, typestate classes, phase modules, or public lifecycle handles.

`RouteLoaded` installs `Publishing`, which owns the Flight resource, before emitting the
`PublishRoute` command. Once that command obtains a renderer handle, `RenderScheduled` installs
`Rendering`, which owns both values. This handoff is synchronous and does not yield: every
supersedable phase therefore records the resources needed to clean it up before asynchronous work
can continue.

Every candidate phase also owns an `AbortController`. Its signal is combined with the native
`NavigateEvent.signal` for precommit work. `BeginCancelable` and `BeginCommittedTraversal` install
the successor before emitting one phase-aware `SupersedeCandidate` command, which interrupts the
old lifetime and then performs any required ordered cleanup. The router therefore does not depend
on delivery timing of the browser's supersession abort to stop an obsolete load or handler.

## Renderer interface

Navigation publication returns only UI lifecycle facts:

```ts
type RendererNavigation = {
  readonly committed: Promise<void>;
  readonly retired: Promise<void>;
  readonly discard: () => Promise<void>;
};
```

- `committed` resolves from the destination root Layout effect after the render becomes visible.
- `retired` resolves when any different render commits and the navigation tree is no longer visible.
- `discard` is legal only before commit and resolves once the scheduled tree cannot commit.

The router must finish `discard` before releasing that candidate's Flight resource. The renderer
does not expose Flight completion, a stable-tree snapshot, history rollback, or navigation status.

## Supersession and retirement

- A preparing candidate never replaces the visible generation merely by starting.
- A newer navigation immediately supersedes the preparing candidate. A loading candidate is
  interrupted; a scheduled candidate is discarded before its resource is released.
- When the successor commits, it becomes visible. Only renderer-confirmed retirement permits the
  previous visible generation's streaming scope to close.
- If the old stream reaches EOF first, it becomes eligible for caching and no longer owns a stream.
- Returning to an entry whose earlier stream retired before EOF performs a new Flight request.

This preserves the selling point: ERSC owns the full streamed response, keeps the revealed route
usable while its replacement prepares, and interrupts obsolete browser and server work as soon as
React proves it is unreachable.

## Cache identity

A route resource exposes a capability that captures its route tree, cache generation, and
invalidation policy:

```ts
type RouteResource = {
  readonly cache: (entry: NavigationHistoryEntry) => void;
  // route payload, completion, and release capabilities
};
```

The router supplies the exact entry committed for the same generation. It never reads
`navigation.currentEntry` at Flight EOF. A late B completion therefore cannot cache B under a
current C entry. Cache invalidation still fences resources created before a Server Function
refresh; their later `cache(entry)` calls are no-ops.

## Failures

- Failure or native abort before a cancelable destination commits rejects its precommit work. URL
  and history have not changed. A scheduled render is discarded before resource release.
- A genuine load failure for an already-committed, non-cancelable traversal reloads the current URL
  as a document. Superseded traversal work only releases its resources.
- A Flight failure after render commit is a render/data failure. React delivers it to the nearest
  application Error Boundary or the root fallback. The router does not roll history back or reload
  automatically.
- A failure from a retired or otherwise stale generation cannot mutate current state, history, or
  UI.

There is a narrow platform race because a Layout effect runs after DOM mutation but before the
precommit promise lets the browser commit history. The design accepts that interval. It adds no
history/UI rollback machinery unless browser evidence shows the race is harmful.

## Other client work

`navigation.transition !== null` describes native navigation only. It must not become a proxy for a
postcommit Flight lifetime or a global busy flag.

- A visible navigation stream may coexist with a route refresh or Server Function request.
- A different successful renderer commit retires the visible navigation regardless of its source.
- A failed refresh leaves the visible navigation and its stream intact.
- A routed navigation may preempt an in-progress refresh through the existing render race; the
  router does not serialize them.

## Verification contract

Tests exercise the installed router seam and observable browser behavior, not reducer internals.
The required cases are:

- load supersession and stale-result no-ops;
- supersession after scheduling but before commit, including ordered discard and release;
- old visible content preserved while a candidate prepares or fails;
- successor commit before old EOF releases the old stream without caching it;
- old EOF before successor commit caches against the exact old entry;
- Flight EOF before native history commit;
- a refresh commit retires visible navigation while a failed refresh preserves it;
- non-cancelable traversal failure reloads the already-current URL;
- partial B with a pending chunk followed by delayed C, proving B abort occurs only after C's
  Layout commit and never reaches the sticky root error fallback;
- a discarded B render never becomes visible;
- native transition, focus, default forward-navigation scroll, and View Transition finish at Layout
  commit rather than EOF;
- push, replace, backward traversal, forward traversal, and UA visual-transition publications carry
  their exact additive navigation types;
- Server Function and HMR refresh publications carry their exact refresh type; and
- nested Suspense content may reveal after native Navigation finishes.

## Delivery

D-066 replaces the existing lifecycle directly; there is no feature flag or parallel router. Work
lands as reviewable slices. Each slice must preserve a working tree and pass the repository checks
appropriate to its risk. The current decisions and architecture are promoted only when the target
behavior is implemented and verified.
