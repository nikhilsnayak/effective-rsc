## Client navigation

ERSC handles eligible document navigations through the browser Navigation API and
`NavigationPrecommitController`. There is no History API fallback. A browser missing either one
still hydrates Client Components and supports Server Functions and streamed current-page refreshes,
including HMR. Links use full-page navigation instead of the client router. Without JavaScript,
the server-rendered document retains working links and natively submitted forms.

Development reports a missing navigation API in the console and a dismissible development-panel
warning. The warning does not block interaction and is absent in production.

An intercepted Page navigation has two milestones:

- **Native commit:** ERSC starts the Flight request in a React Transition, retains the common Layout
  prefix, and publishes the destination in another Transition after the asynchronous load. The
  precommit handler settles at the destination's first UI commit. The Navigation API can
  then commit the URL and history entry, apply focus and default scroll, and finish any React View
  Transition without waiting for Flight EOF.
- **Stream completion:** after native commit, the client router owns any remaining Flight stream
  until EOF or until React confirms that another render retired it. A completed tree is cached for
  the exact Navigation API history-entry id that committed for that navigation.

Canceling or superseding before commit interrupts the client transport and server request Effects.
A scheduled destination is discarded before its stream is released, so no rollback is needed. The
current UI and stream remain live while a successor prepares and retire only after React confirms a
different render. After native commit, Browser Stop no longer owns the stream; later Flight failures
use React's Error Boundary handling.

Back/Forward traversal reuses a completed cached payload. Push, replace, and uncached traversal
fetch fresh Flight. Disposing a history entry evicts its payload; a Server Function refresh clears
the traversal cache because a mutation may affect any route.

Flight redirects use the response's final URL; a non-success or non-Flight response becomes a
full-document navigation. Native focus and scroll remain enabled. Because Suspense content may
continue after native commit, history can remember an intermediate fallback's scroll position;
stream-aware restoration is not yet implemented.

### React View Transitions

Applications own React `<ViewTransition>` boundaries and all animation CSS. ERSC does not wrap the
route tree or call `document.startViewTransition()`. It calls React's `addTransitionType()` inside
the same Transition that publishes an initial navigation or refresh render, so application
boundaries can select animation policy without delaying native navigation until Flight EOF.

The types are additive:

| Publication                                            | Added types                                        |
| ------------------------------------------------------ | -------------------------------------------------- |
| Every routed navigation                                | `navigation`, `navigation-${event.navigationType}` |
| Push navigation                                        | `navigation-forward`                               |
| Backward traversal                                     | `navigation-backward`                              |
| Forward traversal                                      | `navigation-forward`                               |
| Navigation with `event.hasUAVisualTransition`          | `navigation-ua-visual-transition`                  |
| Server Function response tree or current-route refresh | `server-function`                                  |
| HMR current-route refresh                              | `hmr-refresh`                                      |

`event.navigationType` is `push`, `replace`, or `traverse`. Replace has no direction type. A
traversal has no direction type when either history index is unavailable or the indices are equal.
Applications may suppress author animation for `navigation-ua-visual-transition` and `hmr-refresh`,
but ERSC does not impose that policy.

These types describe only the first publication. Suspense content that resolves later renders in a
separate, untyped React Transition. Applications should use their own Suspense-specific
`<ViewTransition>` boundaries and styling for those reveals.
