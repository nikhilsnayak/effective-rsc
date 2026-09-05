# Client router

Status: **Current** under [D-066 and D-067](../DECISIONS.md).

## Purpose

The client router is a private deep module whose sole interface, `installClientRouter`, installs the
Navigation API subscription in the browser scope. Behind it, the router selects routed navigations,
loads Flight, publishes React renders, coordinates native completion with the first UI commit, and
owns postcommit streams. Callers do not receive lifecycle state or operations.

`NavigationApi` remains the browser adapter and `BrowserRenderer` remains the React publication
adapter. Neither owns the end-to-end routing policy. Refresh, Server Function, and HMR selection
remain separate modules; they do not enter a global router scheduler.

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
  React-->>Router: destination UI commits
  Router-->>Navigation: settle precommit handler
  Navigation->>Navigation: commit entry, focus, and default scroll
  Navigation-->>React: native transition finishes
  Server-->>Router: remaining Flight chunks / EOF
  Note over Router,React: Router retains the stream until EOF or render retirement
```

For a cancelable navigation, the router intercepts with `precommitHandler` and loads inside an async
React Action. Because publication follows an `await`, it uses a nested `startTransition`. The Action
ends after scheduling publication; outside it, the handler waits for the renderer's `committed`
promise. The framework root's layout effect resolves that promise, allowing URL/history commit,
browser focus and scroll, and React's View Transition to proceed without waiting for Flight EOF.

The browser currently owns the default forward-navigation scroll reset. This is not a complete
scroll-restoration design: a history entry can observe the intermediate Suspense fallback even
though its route continues streaming after native navigation finishes. Router-owned history scroll
restoration is therefore deferred in [OQ-009](../OPEN_QUESTIONS.md); D-066 does not treat the
browser's remembered position as a stable streamed-route position.

The `NavigateEvent.signal` owns interruption until the destination commits. Ownership of a remaining
stream then transfers once to an ERSC Effect scope. Browser Stop cannot cancel later chunks; this is
the cost of truthful native completion.

Some traversals are non-cancelable and cannot use `precommitHandler`; their entry is already
committed when routing starts. They otherwise use the same loading, rendering, and stream ownership
rules.

## React View Transitions

The application owns every React `<ViewTransition>` boundary and all animation policy. ERSC does
not wrap the route tree and does not call `document.startViewTransition()`. It supplies context by
calling React's `addTransitionType()` inside the same `startTransition()` callback that publishes
the corresponding render.

This placement is significant. Routed Flight and current-route refreshes load asynchronously, so
adding types before loading would not associate them with the later UI update. The publication
Transition adds the types immediately before calling `BrowserRenderer`. Effect owns loading and
cleanup; the Transition callback does not return a Promise waiting for its own React commit.

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

The router stores one visible generation and at most one candidate. A newer navigation replaces the
candidate rather than adding another generation.

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
    };

type Candidate =
  | {
      readonly _tag: 'Loading';
      readonly generation: Generation;
      readonly lifetime: GenerationLifetime;
    }
  | {
      readonly _tag: 'Publishing';
      readonly generation: Generation;
      readonly lifetime: GenerationLifetime;
      readonly resource: RouteResource;
    }
  | {
      readonly _tag: 'Rendering';
      readonly generation: Generation;
      readonly lifetime: GenerationLifetime;
      readonly resource: RouteResource;
      readonly render: RendererNavigation;
    };

type EntryState =
  | { readonly _tag: 'PendingCommit' }
  | { readonly _tag: 'Committed'; readonly entry: NavigationHistoryEntry | null };

type FlightState =
  | { readonly _tag: 'Streaming'; readonly resource: RouteResource }
  | { readonly _tag: 'Completed'; readonly cache: RouteResource['cache'] };
```

The concrete types must continue this discipline: no optional lifecycle fields and no booleans
whose combinations encode phases. A completed stream with a pending entry is valid because EOF may
precede native history commit. A visible streaming generation is valid because nested RSC chunks
may remain unresolved after the first UI commit.

Each async result carries its opaque generation identity. Results for a generation the router no
longer owns are expected stale no-ops. An event impossible for the currently owned generation is a
wiring error and throws a plain `TypeError`.

## Events and commands

State changes are synchronous and atomic through a pure reducer. Dispatch reads the current
`MutableRef`, computes the reducer result, installs the next state before running commands, and does
not yield between those steps. Loading, Flight consumption, and React rendering remain concurrent;
the router does not introduce a queue, mutex, or synchronized execution lane.

The closed lifecycle event family is:

- `BeginNavigation`
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

The reducer returns the next state and at most one tagged command. State is installed before the
command runs. A command owns any required ordering; for example, superseding a scheduled candidate
performs `discard -> release`. There is no event bus, typestate layer, or public lifecycle handle.

`RouteLoaded` installs `Publishing`, which owns the Flight resource, before emitting the
`PublishRoute` command. Once that command obtains a renderer handle, `RenderScheduled` installs
`Rendering`, which owns both values. This handoff is synchronous and does not yield: every
supersedable phase therefore records the resources needed to clean it up before asynchronous work
can continue.

Every candidate phase owns an `AbortController` combined with the native `NavigateEvent.signal`.
`BeginNavigation` installs the successor before emitting `SupersedeCandidate`, which interrupts the
old lifetime and performs phase-specific cleanup. The router does not depend on when the browser
delivers its supersession abort.

## Renderer interface

Navigation publication returns only UI lifecycle facts:

```ts
type RendererNavigation = {
  readonly committed: Promise<void>;
  readonly retired: Promise<void>;
  readonly discard: () => Promise<void>;
};
```

- `committed` resolves from the framework root's layout effect after the render becomes visible.
- `retired` resolves when any different render commits and the navigation tree is no longer visible.
- `discard` is legal only before commit and resolves once the scheduled tree cannot commit.

The router must finish `discard` before releasing that candidate's Flight resource. The renderer
does not expose Flight completion, a stable-tree snapshot, history rollback, or navigation status.

## Supersession and retirement

- A preparing candidate never replaces the visible generation merely by starting.
- A newer navigation immediately supersedes the preparing candidate. A loading candidate is
  interrupted; a scheduled candidate is discarded before its resource is released.
- When the successor commits, it becomes visible. Its renderer-confirmed retirement of the previous
  render is the only signal that permits the old streaming scope to close.
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

Tests use the installed router seam and observable browser behavior, not reducer internals. They
cover precommit load and render supersession, exact cache-entry identity under both completion
orders, renderer-confirmed retirement, non-cancelable traversal failure, and interactions with
refresh. Browser tests prove native completion at the first UI commit, continued streaming after
that point, preserved visible content, discarded candidates, and every published transition type.
