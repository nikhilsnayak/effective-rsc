## Client queries and streams

Import `ServerFn` from `effective-rsc/client` to query a Server Function for a value or consume its
stream. The helpers expose results as Effects, Streams, or atoms, with typed failures and cancellation.

| Helper                    | Server return type | Client result                                                                               |
| ------------------------- | ------------------ | ------------------------------------------------------------------------------------------- |
| `ServerFn.query(fn)`      | Non-stream value   | Function returning `Effect<Output, ServerFnError>`                                          |
| `ServerFn.queryAtom(fn)`  | Non-stream value   | `Atom.AtomResultFn<Args, Output, ServerFnError>`                                            |
| `ServerFn.stream(fn)`     | Effect `Stream<A>` | Function returning `Stream<A, ServerFnError>`                                               |
| `ServerFn.streamAtom(fn)` | Effect `Stream<A>` | Atom of the latest chunk; may also fail with `Cause.NoSuchElementError` for an empty stream |

Function helpers take the original encoded arguments: `ServerFn.query(lookupAuthor)({ authorId })`.
Atom setters take an argument tuple: `lookup([{ authorId }])`.

Value helpers reject any return union containing a `ReadableStream`. Stream helpers require every
return alternative to be a `ReadableStream`, as exposed by a streaming Server Function reference.

Queries and streams do not trigger a route refresh. For React forms and `useActionState`, pass the
native Server Function reference directly.

### Cancellation and atoms

Interrupting a query Effect cancels its pending invocation. Streams emit values immediately and
complete only after both the returned stream and its server response finish. Until then, interruption
or early termination cancels unfinished work, including pending Server Components in received values.
A late transport failure fails the stream; nested React render errors remain local to their content.
Completion means delivery finished, not that the UI rendered successfully.

Each atom helper supersedes its own in-flight run when called again; `Atom.Interrupt` cancels it
explicitly. `streamAtom` publishes values as they arrive and stays `waiting` until the full response
finishes. Plain query calls run independently.

With `@effect/atom-react`, provide a `RegistryProvider` above consumers; a Client Component wrapper
can be rendered by the root Layout. A nested provider gives its subtree a separate registry.
`useAtomInitialValues` can seed values. Shared atom instances share state within that registry; create
separate instances when reads should be independent.

Read successes and failure causes from `AsyncResult`. `streamAtom` keeps the latest chunk;
`Atom.pull` can accumulate chunks from an Effect Stream. Pulling does not add network backpressure.

<!-- source-navigation -->

- [Query example](../../02-guides/01-server-functions/80_author-preview.tsx)
- [ServerFn output and errors](../08-server-fn/index.md)
- [Resources and cancellation](../../03-advanced/01-request-runtime-and-lifetimes/index.md)
