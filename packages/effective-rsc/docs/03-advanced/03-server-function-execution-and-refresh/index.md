## Results and route refresh

| Invocation                                  | Result                             | Route behavior              |
| ------------------------------------------- | ---------------------------------- | --------------------------- |
| Direct browser call or hydrated form action | Promise or React action state      | Refreshes the current route |
| Form submission without JavaScript          | New document with React form state | Renders the submitted route |
| `ServerFn.query` / `queryAtom`              | Effect or atom result              | No refresh                  |
| `ServerFn.stream` / `streamAtom`            | Stream or latest chunk             | No refresh                  |

For hydrated mutations, the result settles independently of suspended refresh content. Calls may
execute concurrently. ERSC applies a response tree only while it still belongs to the current page;
otherwise it fetches a fresh current-page tree. A completed mutation response invalidates cached
Back/Forward trees, including when its result describes an expected application failure.

Handle expected outcomes in the returned value. Input-validation and server-defect failures reject
the hydrated invocation, but its response can still refresh the route. A route-render failure uses
React's Error Boundaries and does not replace an already completed function result.

Without JavaScript, native forms receive a complete document with updated form state. Invalid input
returns `400`; an unhandled server failure follows the server error response path. Passing the native
reference to `useActionState` preserves this form behavior. Extra arguments bound inside a Client
Component currently do not work without JavaScript; bind them on the server when progressive
submission is required.

<!-- source-navigation -->

- [Server Functions guide](../../02-guides/01-server-functions/index.md)
- [ServerFn errors and output types](../../04-api-reference/08-server-fn/index.md)
