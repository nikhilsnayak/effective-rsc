## Client navigation

ERSC handles eligible document navigations through the browser Navigation API and
`NavigationPrecommitController`. There is no History API fallback. A browser missing either one
never hydrates: the streamed document stays as served and the application behaves as a plain
multi-page application, with document navigations and natively submitted forms but no interactive
Client Components.

An intercepted Page navigation has two milestones:

- **UI commit:** ERSC starts the Flight request in a React transition and retains the common Layout
  prefix. The URL commits after React displays the destination Loading or content, so the URL and
  visible UI change together.
- **Work completion:** the browser navigation remains active until Flight reaches EOF. A completed
  tree is then cached for its Navigation API history-entry id.

Canceling before completion interrupts the client transport and request-scoped server Effects. An
explicit cancellation restores the last committed URL and route tree. A superseding navigation
keeps the committed UI visible until its successor reaches the UI-commit milestone.

Back/Forward traversal reuses a completed cached payload. Push, replace, and uncached traversal
fetch fresh Flight. Disposing a history entry evicts its payload; a Server Function refresh clears
the traversal cache because a mutation may affect any route.

Flight redirects use the response's final URL. A non-success or non-Flight response is promoted to
a full-document navigation. Native focus and scroll behavior remain enabled.
